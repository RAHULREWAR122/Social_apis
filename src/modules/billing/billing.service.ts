import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { env } from "../../config/env";
import { createPaymentLink, extractLinkIdFromWebhook, getPaymentLink, verifyWebhookSignature } from "../../lib/cashfree";
import { getUsageSnapshot } from "./usage.service";

// Plan catalog lives on the backend (not hardcoded in frontend) so it can move to an
// admin-editable table in Phase 6 without changing the API shape the frontend consumes.
//
// Pricing note: customers connect their OWN Gmail account and their OWN Meta WhatsApp Business
// Account (see integrations/whatsapp modules) — Google and Meta bill THEM directly for any
// per-message cost, not us. These prices are a platform/software fee (infra + support + features),
// not a cost-plus-markup on messages. Adjust freely; nothing else derives from these numbers.
const RENEWAL_PERIOD_DAYS = 30;

// Order matters: index in this array is used as the tier rank when comparing plans (e.g. to decide
// whether a new payment is an upgrade over the currently active plan) — keep it low-to-high.
export const PLAN_CATALOG = [
  { key: "free", name: "Free", pricePaise: 0, contactsLimit: 100, emailLimit: 5, whatsappLimit: 3, socialEnabled: false },
  { key: "starter", name: "Starter", pricePaise: 99_900, contactsLimit: 5_000, emailLimit: 10_000, whatsappLimit: 2_000, socialEnabled: true },
  { key: "business", name: "Business", pricePaise: 299_900, contactsLimit: 25_000, emailLimit: 50_000, whatsappLimit: 10_000, socialEnabled: true },
  { key: "pro", name: "Pro", pricePaise: 799_900, contactsLimit: 100_000, emailLimit: 250_000, whatsappLimit: 50_000, socialEnabled: true },
] as const;

function planTierIndex(planKey: string) {
  return PLAN_CATALOG.findIndex((p) => p.key === planKey);
}

export async function getBilling(organizationId: string) {
  const snapshot = await getUsageSnapshot(organizationId);

  const [contactsCount, emailAccountsCount] = await Promise.all([
    prisma.contact.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.emailAccount.count({ where: { organizationId } }),
  ]);

  return {
    plan: snapshot.plan,
    renewsAt: snapshot.renewsAt,
    pendingPlanName: snapshot.pendingPlanName,
    usage: {
      contactsCount,
      emailAccountsCount,
      emailsSent: snapshot.usage.email.used,
      whatsappSent: snapshot.usage.whatsapp.used,
    },
    plans: PLAN_CATALOG,
  };
}

/** Self-serve plan changes are only ever a downgrade to Free — upgrading requires payment via checkout().
 *  A paid plan already bought stays active until planRenewsAt: switching to Free while time remains just
 *  schedules the downgrade (ensurePlanCurrent() applies it once the paid period actually lapses) instead
 *  of forfeiting days already paid for. */
export async function changePlan(organizationId: string, planKey: string) {
  if (planKey !== "free") {
    throw new HttpError(400, "Upgrading a plan requires payment. Use the checkout flow on the Billing page.");
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new HttpError(404, "Organization not found");

  const hasActivePaidPeriod =
    organization.planName !== "free" && !!organization.planRenewsAt && organization.planRenewsAt.getTime() > Date.now();

  if (hasActivePaidPeriod) {
    await prisma.organization.update({ where: { id: organizationId }, data: { pendingPlanName: "free" } });
  } else {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { planName: "free", planRenewsAt: null, pendingPlanName: null },
    });
  }

  return getBilling(organizationId);
}

function buildPaymentLinkId(organizationId: string, plan: string) {
  return `plan-${plan}-${organizationId.slice(0, 8)}-${Date.now()}`;
}

export async function createCheckout(
  organizationId: string,
  input: { plan: string; customerPhone: string; customerName?: string; customerEmail?: string },
) {
  const plan = PLAN_CATALOG.find((p) => p.key === input.plan);
  if (!plan || plan.key === "free") throw new HttpError(400, "Unknown or non-payable plan");

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new HttpError(404, "Organization not found");

  const linkId = buildPaymentLinkId(organizationId, plan.key);

  const link = await createPaymentLink({
    linkId,
    amountRupees: plan.pricePaise / 100,
    purpose: `${plan.name} plan — ${organization.name}`,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    customerName: input.customerName || organization.name,
    returnUrl: `${env.WEB_APP_URL}/app/billing?linkId={link_id}`,
    notifyUrl: `${env.API_BASE_URL}/billing/webhook`,
  });

  await prisma.payment.create({
    data: {
      organizationId,
      plan: plan.key,
      amountPaise: plan.pricePaise,
      cashfreeLinkId: link.link_id,
      status: "CREATED",
    },
  });

  return { linkUrl: link.link_url, linkId: link.link_id };
}

/** Re-verifies a link's status directly against Cashfree (the canonical source of truth) and applies
 *  the plan change if paid. Called from both the webhook handler and the return-page sync endpoint.
 *
 *  Paying for a plan while a different paid plan is already active (e.g. buying Business while
 *  Starter still has days left) doesn't just overwrite the active plan — that would forfeit time
 *  already paid for:
 *   - If the newly paid plan is a genuine upgrade over whatever's currently active, it takes effect
 *     immediately (paying more should grant more right away) and any previously queued plan change
 *     is superseded.
 *   - If it's the same tier or a downgrade while paid time remains, the current plan keeps running
 *     untouched and this purchase is queued as `pendingPlanName` — ensurePlanCurrent() switches to it
 *     automatically once the active period lapses, so the org lands on the plan it paid for (not
 *     Free) and keeps going from there. */
async function finalizeLink(cashfreeLinkId: string) {
  const payment = await prisma.payment.findUnique({ where: { cashfreeLinkId } });
  if (!payment || payment.status === "PAID") return payment;

  const link = await getPaymentLink(cashfreeLinkId);
  const status = String(link.link_status ?? "").toUpperCase();

  if (status === "PAID") {
    const organization = await prisma.organization.findUnique({ where: { id: payment.organizationId } });
    const hasActivePaidPeriod =
      !!organization &&
      organization.planName !== "free" &&
      !!organization.planRenewsAt &&
      organization.planRenewsAt.getTime() > Date.now();

    const isUpgradeOverActive = !hasActivePaidPeriod || planTierIndex(payment.plan) > planTierIndex(organization!.planName);

    const orgUpdate = isUpgradeOverActive
      ? {
          planName: payment.plan,
          planRenewsAt: new Date(Date.now() + RENEWAL_PERIOD_DAYS * 24 * 60 * 60 * 1000),
          pendingPlanName: null,
        }
      : { pendingPlanName: payment.plan };

    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: new Date() } }),
      prisma.organization.update({ where: { id: payment.organizationId }, data: orgUpdate }),
    ]);
  } else if (status === "EXPIRED" || status === "CANCELLED") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } });
  }

  return prisma.payment.findUnique({ where: { id: payment.id } });
}

export async function syncCheckout(organizationId: string, linkId: string) {
  const payment = await prisma.payment.findUnique({ where: { cashfreeLinkId: linkId } });
  if (!payment || payment.organizationId !== organizationId) throw new HttpError(404, "Payment not found");

  await finalizeLink(linkId);
  return getBilling(organizationId);
}

export async function handleCashfreeWebhook(rawBody: string, signature: string | undefined, timestamp: string | undefined) {
  if (!signature || !timestamp || !verifyWebhookSignature(rawBody, signature, timestamp)) {
    throw new HttpError(401, "Invalid webhook signature");
  }

  const linkId = extractLinkIdFromWebhook(JSON.parse(rawBody));
  if (linkId) await finalizeLink(linkId);
}
