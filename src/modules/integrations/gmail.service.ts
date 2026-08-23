import { google } from "googleapis";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { decryptSecret, encryptSecret } from "../../utils/encryption";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CALLBACK_PATH = "/integrations/gmail/callback";

function assertGoogleConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(
      503,
      "Gmail integration is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }
}

function createOAuthClient() {
  assertGoogleConfigured();
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.API_BASE_URL}${CALLBACK_PATH}`,
  );
}

export function buildAuthUrl(organizationId: string) {
  const client = createOAuthClient();
  const state = jwt.sign({ organizationId }, env.JWT_ACCESS_SECRET, { expiresIn: "10m" });

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });
}

function verifyState(state: string): { organizationId: string } {
  try {
    return jwt.verify(state, env.JWT_ACCESS_SECRET) as { organizationId: string };
  } catch {
    throw new HttpError(400, "This Gmail connection link has expired. Please try connecting again.");
  }
}

export async function handleCallback(code: string, state: string) {
  const { organizationId } = verifyState(state);
  const client = createOAuthClient();

  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new HttpError(
      400,
      "Google did not return a refresh token. Disconnect this app's access in your Google account and try again.",
    );
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: userInfo } = await oauth2.userinfo.get();

  if (!userInfo.email) {
    throw new HttpError(400, "Could not determine the connected Gmail address");
  }

  await prisma.emailAccount.upsert({
    where: { organizationId_emailAddress: { organizationId, emailAddress: userInfo.email } },
    create: {
      organizationId,
      provider: "gmail",
      emailAddress: userInfo.email,
      displayName: userInfo.name ?? undefined,
      accessTokenEncrypted: encryptSecret(tokens.access_token),
      refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      status: "CONNECTED",
      lastVerifiedAt: new Date(),
    },
    update: {
      accessTokenEncrypted: encryptSecret(tokens.access_token),
      refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      status: "CONNECTED",
      lastVerifiedAt: new Date(),
    },
  });

  return { organizationId };
}

export async function listEmailAccounts(organizationId: string) {
  const accounts = await prisma.emailAccount.findMany({
    where: { organizationId },
    select: {
      id: true,
      provider: true,
      emailAddress: true,
      displayName: true,
      status: true,
      lastVerifiedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return accounts;
}

export async function disconnectEmailAccount(organizationId: string, accountId: string) {
  const account = await prisma.emailAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new HttpError(404, "Email account not found");
  await prisma.emailAccount.delete({ where: { id: accountId } });
}

/** Returns a live OAuth2 client with fresh credentials, refreshing the access token if needed. */
export async function getAuthorizedClientForAccount(emailAccountId: string) {
  const account = await prisma.emailAccount.findUnique({ where: { id: emailAccountId } });
  if (!account) throw new HttpError(404, "Email account not found");

  const client = createOAuthClient();
  client.setCredentials({
    access_token: decryptSecret(account.accessTokenEncrypted),
    refresh_token: decryptSecret(account.refreshTokenEncrypted),
    expiry_date: account.tokenExpiresAt?.getTime(),
  });

  return client;
}
