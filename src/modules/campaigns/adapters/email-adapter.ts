import { google } from "googleapis";
import { HttpError } from "../../../utils/http-error";
import { getAuthorizedClientForAccount } from "../../integrations/gmail.service";

function toBase64Url(input: string) {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeaderWord(value: string) {
  // Encodes subject lines/display names that may contain non-ASCII characters (RFC 2047).
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildRawMessage(input: { from: string; to: string; subject: string; bodyHtml: string }) {
  const message = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    input.bodyHtml,
  ].join("\r\n");

  return toBase64Url(message);
}

export async function sendEmail(input: {
  emailAccountId: string;
  fromAddress: string;
  to: string;
  subject: string;
  bodyHtml: string;
}) {
  const client = await getAuthorizedClientForAccount(input.emailAccountId);
  const gmail = google.gmail({ version: "v1", auth: client });

  const raw = buildRawMessage({
    from: input.fromAddress,
    to: input.to,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
  });

  try {
    const { data } = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return { providerMessageId: data.id ?? undefined };
  } catch (err) {
    // Surface Google's actual reason (revoked access, invalid recipient, quota, etc) instead of
    // letting a raw Gaxios error bubble up as an opaque 500 — see whatsapp-adapter.ts for the same
    // fix and why it's needed specifically on the "Send test" path.
    const message = (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ?? (err as Error).message;
    throw new HttpError(502, `Email send failed: ${message}`);
  }
}
