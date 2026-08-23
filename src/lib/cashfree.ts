import crypto from "crypto";
import { env } from "../config/env";
import { HttpError } from "../utils/http-error";

const BASE_URL = env.CASHFREE_ENV === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";

function assertConfigured() {
  if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) {
    throw new HttpError(503, "Payments aren't configured yet. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.");
  }
}

function requestHeaders() {
  return {
    "x-client-id": env.CASHFREE_APP_ID!,
    "x-client-secret": env.CASHFREE_SECRET_KEY!,
    "x-api-version": env.CASHFREE_API_VERSION,
    "Content-Type": "application/json",
  };
}

export type CashfreePaymentLink = {
  link_id: string;
  link_url: string;
  link_status: string;
};

/** Creates a hosted Cashfree Payment Link the browser can be redirected to directly — no client-side SDK needed. */
export async function createPaymentLink(input: {
  linkId: string;
  amountRupees: number;
  purpose: string;
  customerPhone: string;
  customerEmail?: string;
  customerName?: string;
  returnUrl: string;
  notifyUrl: string;
}): Promise<CashfreePaymentLink> {
  assertConfigured();

  const response = await fetch(`${BASE_URL}/links`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({
      link_id: input.linkId,
      link_amount: input.amountRupees,
      link_currency: "INR",
      link_purpose: input.purpose,
      customer_details: {
        customer_phone: input.customerPhone,
        customer_email: input.customerEmail,
        customer_name: input.customerName,
      },
      link_notify: { send_sms: false, send_email: false },
      link_meta: { return_url: input.returnUrl, notify_url: input.notifyUrl },
    }),
  });

  const data = (await response.json()) as CashfreePaymentLink & { message?: string };
  if (!response.ok) {
    throw new HttpError(502, data?.message ?? "Failed to create payment link with Cashfree", data);
  }
  return data;
}

/** Canonical source of truth for a link's status — used by both the webhook handler and the
 *  return-page sync call, since webhook delivery can be delayed or missed in sandbox. */
export async function getPaymentLink(linkId: string): Promise<CashfreePaymentLink & Record<string, unknown>> {
  assertConfigured();

  const response = await fetch(`${BASE_URL}/links/${encodeURIComponent(linkId)}`, { headers: requestHeaders() });
  const data = (await response.json()) as CashfreePaymentLink & Record<string, unknown> & { message?: string };
  if (!response.ok) {
    throw new HttpError(502, data?.message ?? "Failed to fetch payment link from Cashfree", data);
  }
  return data;
}

export function verifyWebhookSignature(rawBody: string, signature: string, timestamp: string) {
  if (!env.CASHFREE_SECRET_KEY) return false;
  const expected = crypto
    .createHmac("sha256", env.CASHFREE_SECRET_KEY)
    .update(timestamp + rawBody)
    .digest("base64");
  return expected === signature;
}

/** Best-effort extraction of the link_id a webhook event refers to. Not trusted as the payment
 *  outcome itself — the caller re-verifies via getPaymentLink() before changing any state. */
export function extractLinkIdFromWebhook(body: unknown): string | undefined {
  const data = (body as { data?: Record<string, unknown> })?.data;
  if (!data) return undefined;
  const nestedLink = data.link as { link_id?: unknown } | undefined;
  const candidate = data.link_id ?? nestedLink?.link_id;
  return typeof candidate === "string" ? candidate : undefined;
}
