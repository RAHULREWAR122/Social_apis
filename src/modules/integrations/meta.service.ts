import axios from "axios";
import jwt from "jsonwebtoken";
import type { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { decryptSecret, encryptSecret } from "../../utils/encryption";
import { assertSocialFeatureAvailable } from "../billing/usage.service";

// Covers both Facebook Page connection and Instagram Business discovery — same Meta app,
// same Graph API. Instagram Business publishing is authenticated via the linked Page's
// access token, there is no separate Instagram-only OAuth token.
const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

const CALLBACK_PATH = "/integrations/meta/callback";
const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

function assertMetaConfigured() {
  if (!env.META_CLIENT_ID || !env.META_CLIENT_SECRET) {
    throw new HttpError(
      503,
      "Facebook/Instagram integration is not configured yet. Set META_CLIENT_ID and META_CLIENT_SECRET.",
    );
  }
}

function redirectUri() {
  return `${env.API_BASE_URL}${CALLBACK_PATH}`;
}

export async function buildAuthUrl(organizationId: string) {
  await assertSocialFeatureAvailable(organizationId);
  assertMetaConfigured();
  const state = jwt.sign({ organizationId }, env.JWT_ACCESS_SECRET, { expiresIn: "10m" });

  const params = new URLSearchParams({
    client_id: env.META_CLIENT_ID!,
    redirect_uri: redirectUri(),
    state,
    scope: META_SCOPES,
  });

  return `https://www.facebook.com/${env.META_GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

function verifyState(state: string): { organizationId: string } {
  try {
    return jwt.verify(state, env.JWT_ACCESS_SECRET) as { organizationId: string };
  } catch {
    throw new HttpError(400, "This connection link has expired. Please try connecting again.");
  }
}

async function upsertSocialAccount(input: {
  organizationId: string;
  platform: "FACEBOOK" | "INSTAGRAM";
  externalAccountId: string;
  displayName?: string | null;
  accessToken: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.socialAccount.upsert({
    where: {
      organizationId_platform_externalAccountId: {
        organizationId: input.organizationId,
        platform: input.platform,
        externalAccountId: input.externalAccountId,
      },
    },
    create: {
      organizationId: input.organizationId,
      platform: input.platform,
      externalAccountId: input.externalAccountId,
      displayName: input.displayName ?? undefined,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      status: "CONNECTED",
      lastVerifiedAt: new Date(),
    },
    update: {
      displayName: input.displayName ?? undefined,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      status: "CONNECTED",
      lastVerifiedAt: new Date(),
    },
  });
}

export async function handleCallback(code: string, state: string) {
  const { organizationId } = verifyState(state);
  assertMetaConfigured();

  // 1. Exchange the auth code for a short-lived user access token.
  const { data: shortLived } = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id: env.META_CLIENT_ID,
      client_secret: env.META_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      code,
    },
  });

  // 2. Exchange for a long-lived (~60 day) user token — Page tokens derived from it stay valid
  // as long as this underlying user token does; there is no separate refresh-token flow here.
  const { data: longLived } = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: env.META_CLIENT_ID,
      client_secret: env.META_CLIENT_SECRET,
      fb_exchange_token: shortLived.access_token,
    },
  });

  // 3. List the Facebook Pages this user manages, each with its own (effectively permanent)
  // Page access token.
  const { data: pagesResponse } = await axios.get(`${GRAPH_BASE}/me/accounts`, {
    params: { access_token: longLived.access_token },
  });

  const pages: Array<{ id: string; name: string; access_token: string }> = pagesResponse.data ?? [];
  if (pages.length === 0) {
    throw new HttpError(400, "No Facebook Pages found for this account. You need to manage at least one Page.");
  }

  for (const page of pages) {
    await upsertSocialAccount({
      organizationId,
      platform: "FACEBOOK",
      externalAccountId: page.id,
      displayName: page.name,
      accessToken: page.access_token,
    });

    // 4. Discover a linked Instagram Business account, if any, for this Page.
    const { data: pageDetails } = await axios.get(`${GRAPH_BASE}/${page.id}`, {
      params: { fields: "instagram_business_account{id,username}", access_token: page.access_token },
    });

    const igAccount = pageDetails.instagram_business_account;
    if (igAccount?.id) {
      await upsertSocialAccount({
        organizationId,
        platform: "INSTAGRAM",
        externalAccountId: igAccount.id,
        displayName: igAccount.username,
        accessToken: page.access_token,
        metadata: { facebookPageId: page.id, igUsername: igAccount.username },
      });
    }
  }

  return { organizationId };
}

export async function listSocialAccounts(organizationId: string, platform?: "FACEBOOK" | "INSTAGRAM") {
  return prisma.socialAccount.findMany({
    where: { organizationId, platform },
    orderBy: { createdAt: "desc" },
  });
}

export async function disconnectSocialAccount(organizationId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new HttpError(404, "Social account not found");
  await prisma.socialAccount.delete({ where: { id: accountId } });
}

export async function getPageAccessToken(socialAccountId: string) {
  const account = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
  if (!account) throw new HttpError(404, "Social account not found");
  return { account, accessToken: decryptSecret(account.accessTokenEncrypted) };
}
