import axios from "axios";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { decryptSecret, encryptSecret } from "../../utils/encryption";
import { assertSocialFeatureAvailable } from "../billing/usage.service";

export type LinkedInVariant = "personal" | "organization";

const PERSONAL_SCOPES = ["openid", "profile", "email", "w_member_social"];
// Organization scopes are only grantable once LinkedIn has approved this app for their
// Marketing Developer Platform partner program — a manual business process. Requesting them
// on an unapproved app will fail at LinkedIn's consent screen, not in this code.
const ORGANIZATION_SCOPES = [...PERSONAL_SCOPES, "w_organization_social", "rw_organization_admin"];

const CALLBACK_PATH = "/integrations/linkedin/callback";

function assertLinkedInConfigured() {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    throw new HttpError(
      503,
      "LinkedIn integration is not configured yet. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.",
    );
  }
}

function redirectUri() {
  return `${env.API_BASE_URL}${CALLBACK_PATH}`;
}

export async function buildAuthUrl(organizationId: string, variant: LinkedInVariant) {
  await assertSocialFeatureAvailable(organizationId);
  assertLinkedInConfigured();
  const state = jwt.sign({ organizationId, variant }, env.JWT_ACCESS_SECRET, { expiresIn: "10m" });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.LINKEDIN_CLIENT_ID!,
    redirect_uri: redirectUri(),
    state,
    scope: (variant === "organization" ? ORGANIZATION_SCOPES : PERSONAL_SCOPES).join(" "),
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

function verifyState(state: string): { organizationId: string; variant: LinkedInVariant } {
  try {
    return jwt.verify(state, env.JWT_ACCESS_SECRET) as { organizationId: string; variant: LinkedInVariant };
  } catch {
    throw new HttpError(400, "This connection link has expired. Please try connecting again.");
  }
}

export async function handleCallback(code: string, state: string) {
  const { organizationId, variant } = verifyState(state);
  assertLinkedInConfigured();

  const { data: tokenResponse } = await axios.post(
    "https://www.linkedin.com/oauth/v2/accessToken",
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: env.LINKEDIN_CLIENT_ID!,
      client_secret: env.LINKEDIN_CLIENT_SECRET!,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );

  const accessToken: string = tokenResponse.access_token;
  // LinkedIn only issues a refresh_token for apps with "Programmatic Refresh Tokens" enabled;
  // otherwise the access token itself lasts ~60 days and reconnecting is required after that.
  const refreshToken: string | undefined = tokenResponse.refresh_token;
  const expiresInSeconds: number | undefined = tokenResponse.expires_in;

  const { data: userInfo } = await axios.get("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : undefined;

  if (variant === "personal") {
    await prisma.socialAccount.upsert({
      where: {
        organizationId_platform_externalAccountId: {
          organizationId,
          platform: "LINKEDIN_PERSONAL",
          externalAccountId: userInfo.sub,
        },
      },
      create: {
        organizationId,
        platform: "LINKEDIN_PERSONAL",
        externalAccountId: userInfo.sub,
        displayName: userInfo.name,
        accessTokenEncrypted: encryptSecret(accessToken),
        refreshTokenEncrypted: refreshToken ? encryptSecret(refreshToken) : undefined,
        tokenExpiresAt,
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
      },
      update: {
        displayName: userInfo.name,
        accessTokenEncrypted: encryptSecret(accessToken),
        refreshTokenEncrypted: refreshToken ? encryptSecret(refreshToken) : undefined,
        tokenExpiresAt,
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
      },
    });
    return { organizationId };
  }

  // Organization variant: find orgs this member administers and can post on behalf of.
  const { data: acls } = await axios.get("https://api.linkedin.com/v2/organizationAcls", {
    params: { q: "roleAssignee" },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const elements: Array<{ organization: string }> = acls.elements ?? [];
  if (elements.length === 0) {
    throw new HttpError(400, "No LinkedIn organizations found where this account is an administrator.");
  }

  for (const el of elements) {
    // el.organization is a URN like "urn:li:organization:12345"
    const orgId = el.organization.split(":").pop()!;
    await prisma.socialAccount.upsert({
      where: {
        organizationId_platform_externalAccountId: {
          organizationId,
          platform: "LINKEDIN_ORGANIZATION",
          externalAccountId: orgId,
        },
      },
      create: {
        organizationId,
        platform: "LINKEDIN_ORGANIZATION",
        externalAccountId: orgId,
        accessTokenEncrypted: encryptSecret(accessToken),
        refreshTokenEncrypted: refreshToken ? encryptSecret(refreshToken) : undefined,
        tokenExpiresAt,
        metadata: { organizationUrn: el.organization },
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
      },
      update: {
        accessTokenEncrypted: encryptSecret(accessToken),
        refreshTokenEncrypted: refreshToken ? encryptSecret(refreshToken) : undefined,
        tokenExpiresAt,
        metadata: { organizationUrn: el.organization },
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
      },
    });
  }

  return { organizationId };
}

export async function listSocialAccounts(organizationId: string) {
  return prisma.socialAccount.findMany({
    where: { organizationId, platform: { in: ["LINKEDIN_PERSONAL", "LINKEDIN_ORGANIZATION"] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function disconnectSocialAccount(organizationId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new HttpError(404, "Social account not found");
  await prisma.socialAccount.delete({ where: { id: accountId } });
}

export async function getAccessTokenForAccount(socialAccountId: string) {
  const account = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
  if (!account) throw new HttpError(404, "Social account not found");
  return { account, accessToken: decryptSecret(account.accessTokenEncrypted) };
}
