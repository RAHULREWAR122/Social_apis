import axios from "axios";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { decryptSecret, encryptSecret } from "../../utils/encryption";

function countTemplateVariables(bodyText: string) {
  const matches = new Set(Array.from(bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map((m) => m[1]));
  return matches.size;
}

/** Meta's own sample/test templates — these exist in every WhatsApp Business account by default
 *  and can only be sent from Meta's Public Test Number (error #131058), never from a real
 *  business number, no matter what status we store for them locally. */
const META_TEST_TEMPLATE_NAMES = new Set(["hello_world"]);

export function isMetaTestTemplateName(name: string) {
  return META_TEST_TEMPLATE_NAMES.has(name.trim().toLowerCase());
}

/** Calls Meta's Graph API with the given credentials before we ever save them — this is manual
 *  credential entry (no OAuth handshake to lean on, unlike Gmail/Meta-social/LinkedIn), so it's the
 *  only place in the app a wrong/expired/debug-only token can get "connected" without ever being
 *  exercised. Failing fast here means the org finds out immediately, with a clear reason, instead
 *  of only discovering it later when a real send fails. */
async function verifyWhatsAppCredentials(phoneNumberId: string, accessToken: string) {
  try {
    const { data } = await axios.get(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${phoneNumberId}`, {
      params: { fields: "display_phone_number,verified_name", access_token: accessToken },
    });
    return { displayPhoneNumber: data.display_phone_number as string | undefined, verifiedName: data.verified_name as string | undefined };
  } catch (err) {
    const metaMessage = axios.isAxiosError(err) ? err.response?.data?.error?.message : undefined;
    throw new HttpError(
      400,
      `Couldn't verify these WhatsApp details with Meta: ${metaMessage ?? "check the Phone Number ID and access token and try again."}`,
    );
  }
}

export async function connectAccount(
  organizationId: string,
  input: {
    businessAccountId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    businessName?: string;
    accessToken: string;
  },
) {
  const verified = await verifyWhatsAppCredentials(input.phoneNumberId, input.accessToken);

  return prisma.whatsAppAccount.upsert({
    where: { organizationId_phoneNumberId: { organizationId, phoneNumberId: input.phoneNumberId } },
    create: {
      organizationId,
      businessAccountId: input.businessAccountId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: verified.displayPhoneNumber ?? input.displayPhoneNumber,
      businessName: input.businessName ?? verified.verifiedName,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      status: "CONNECTED",
      lastVerifiedAt: new Date(),
    },
    update: {
      businessAccountId: input.businessAccountId,
      displayPhoneNumber: verified.displayPhoneNumber ?? input.displayPhoneNumber,
      businessName: input.businessName ?? verified.verifiedName,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      status: "CONNECTED",
      lastVerifiedAt: new Date(),
    },
    select: {
      id: true,
      businessAccountId: true,
      phoneNumberId: true,
      displayPhoneNumber: true,
      businessName: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function listAccounts(organizationId: string) {
  return prisma.whatsAppAccount.findMany({
    where: { organizationId },
    select: {
      id: true,
      businessAccountId: true,
      phoneNumberId: true,
      displayPhoneNumber: true,
      businessName: true,
      status: true,
      lastVerifiedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function disconnectAccount(organizationId: string, accountId: string) {
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new HttpError(404, "WhatsApp account not found");
  await prisma.whatsAppAccount.delete({ where: { id: accountId } });
}

export async function getDecryptedAccessToken(whatsappAccountId: string) {
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: whatsappAccountId } });
  if (!account) throw new HttpError(404, "WhatsApp account not found");
  return { account, accessToken: decryptSecret(account.accessTokenEncrypted) };
}

export async function listTemplates(organizationId: string) {
  return prisma.whatsAppTemplate.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    include: { whatsappAccount: { select: { displayPhoneNumber: true } } },
  });
}

/** Confirms the template actually exists (by name + language) on the connected WABA before we let
 *  it be saved locally — otherwise a typo'd language code (e.g. "en" vs "en_US") only surfaces
 *  later as an opaque send failure instead of at creation time. */
async function verifyMetaTemplate(businessAccountId: string, accessToken: string, templateName: string, language: string) {
  let templates: Array<{ name: string; language: string; status: string }>;
  try {
    const { data } = await axios.get(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${businessAccountId}/message_templates`, {
      params: { name: templateName, access_token: accessToken },
    });
    templates = data.data ?? [];
  } catch (err) {
    const metaMessage = axios.isAxiosError(err) ? err.response?.data?.error?.message : undefined;
    throw new HttpError(400, `Could not verify WhatsApp template with Meta: ${metaMessage ?? "Unknown Meta error"}`);
  }

  const template = templates.find((item) => item.name === templateName && item.language === language);
  if (!template) {
    throw new HttpError(
      400,
      `Template "${templateName}" with language "${language}" was not found on this WhatsApp Business Account in Meta.`,
    );
  }
  if (template.status !== "APPROVED") {
    throw new HttpError(400, `WhatsApp template "${templateName}" is ${template.status} in Meta, not APPROVED yet.`);
  }
  return template;
}

export async function createTemplate(
  organizationId: string,
  input: { whatsappAccountId: string; name: string; language: string; bodyText: string },
) {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: input.whatsappAccountId, organizationId },
  });
  if (!account) throw new HttpError(404, "WhatsApp account not found");

  if (isMetaTestTemplateName(input.name)) {
    throw new HttpError(
      400,
      `"${input.name}" is Meta's built-in test template — it can only be sent from Meta's Public Test Number, never from your own business number. Create your own template and get it approved in Meta Business Manager instead.`,
    );
  }

  const existing = await prisma.whatsAppTemplate.findFirst({
    where: { organizationId, name: input.name, language: input.language },
  });
  if (existing) throw new HttpError(409, `Template "${input.name}" (${input.language}) already exists`);

  const accessToken = decryptSecret(account.accessTokenEncrypted);
  await verifyMetaTemplate(account.businessAccountId, accessToken, input.name, input.language);

  return prisma.whatsAppTemplate.create({
    data: {
      organizationId,
      whatsappAccountId: input.whatsappAccountId,
      name: input.name,
      language: input.language,
      bodyText: input.bodyText,
      variableCount: countTemplateVariables(input.bodyText),
      status: "APPROVED",
    },
  });
}

export async function updateTemplate(
  organizationId: string,
  templateId: string,
  input: { bodyText?: string; status?: "PENDING" | "APPROVED" | "REJECTED" | "DISABLED" },
) {
  const template = await prisma.whatsAppTemplate.findFirst({ where: { id: templateId, organizationId } });
  if (!template) throw new HttpError(404, "Template not found");

  return prisma.whatsAppTemplate.update({
    where: { id: templateId },
    data: {
      ...input,
      variableCount: input.bodyText ? countTemplateVariables(input.bodyText) : undefined,
    },
  });
}

export async function deleteTemplate(organizationId: string, templateId: string) {
  const template = await prisma.whatsAppTemplate.findFirst({ where: { id: templateId, organizationId } });
  if (!template) throw new HttpError(404, "Template not found");
  await prisma.whatsAppTemplate.delete({ where: { id: templateId } });
}
