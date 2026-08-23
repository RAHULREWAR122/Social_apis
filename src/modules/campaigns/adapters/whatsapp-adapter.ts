import axios from "axios";
import { env } from "../../../config/env";
import { HttpError } from "../../../utils/http-error";
import { getDecryptedAccessToken } from "../../whatsapp/whatsapp.service";

export async function sendWhatsAppTemplate(input: {
  whatsappAccountId: string;
  to: string;
  templateName: string;
  language: string;
  variables: string[];
}) {
  const { account, accessToken } = await getDecryptedAccessToken(input.whatsappAccountId);

  const url = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${account.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.language },
      ...(input.variables.length
        ? { components: [{ type: "body", parameters: input.variables.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  };

  try {
    const { data } = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });

    const providerMessageId: string | undefined = data?.messages?.[0]?.id;
    return { providerMessageId };
  } catch (err) {
    // Surface Meta's actual reason (expired token, unapproved template, wrong number format, etc)
    // instead of letting a raw AxiosError bubble up as an opaque 500 — this is the only WhatsApp
    // call in the codebase not already wrapped by a worker's own try/catch (campaign sends are;
    // "Send test" isn't), so it needs to fail with a clear, actionable message on its own.
    if (axios.isAxiosError(err)) {
      const metaMessage = err.response?.data?.error?.message;
      throw new HttpError(502, `WhatsApp send failed: ${metaMessage ?? err.message}`);
    }
    throw err;
  }
}
