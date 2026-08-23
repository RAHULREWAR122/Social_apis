import { CampaignChannel } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { PLAN_CATALOG } from "./billing.service";

const RENEWAL_PERIOD_DAYS = 30;

export function currentPeriodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Lazily applies a lapsed paid plan's expiry — called before every quota check and billing read.
 *  Moves to `pendingPlanName` if one was scheduled — either a self-serve downgrade to Free requested
 *  while paid time remained, or another paid plan bought while a higher one was still active — with
 *  its own fresh renewal date if it's a paid plan. Falls back to Free (no further renewal) only if
 *  nothing was queued: the plan the org actually paid for always runs its full course first. */
export async function ensurePlanCurrent(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planName: true, planRenewsAt: true, pendingPlanName: true },
  });
  if (!organization) throw new HttpError(404, "Organization not found");

  if (organization.planName !== "free" && organization.planRenewsAt && organization.planRenewsAt.getTime() < Date.now()) {
    const nextPlan = organization.pendingPlanName ?? "free";
    const nextRenewsAt = nextPlan === "free" ? null : new Date(Date.now() + RENEWAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { planName: nextPlan, planRenewsAt: nextRenewsAt, pendingPlanName: null },
    });
    return { planName: nextPlan, planRenewsAt: nextRenewsAt, pendingPlanName: null as string | null };
  }
  return organization;
}

export async function getUsageSnapshot(organizationId: string) {
  const organization = await ensurePlanCurrent(organizationId);
  const plan = PLAN_CATALOG.find((p) => p.key === organization.planName) ?? PLAN_CATALOG[0];
  const periodKey = currentPeriodKey();

  const counters = await prisma.usageCounter.findMany({ where: { organizationId, periodKey } });
  const usedByChannel: Record<CampaignChannel, number> = { EMAIL: 0, WHATSAPP: 0 };
  for (const counter of counters) usedByChannel[counter.channel] = counter.count;

  return {
    plan,
    periodKey,
    renewsAt: organization.planRenewsAt,
    pendingPlanName: organization.pendingPlanName,
    usage: {
      email: { used: usedByChannel.EMAIL, limit: plan.emailLimit },
      whatsapp: { used: usedByChannel.WHATSAPP, limit: plan.whatsappLimit },
    },
  };
}

const CHANNEL_LABEL: Record<CampaignChannel, string> = { EMAIL: "email", WHATSAPP: "WhatsApp" };

/** Throws HttpError(402, ..., {code:"QUOTA_EXCEEDED", ...}) if sending `additional` more messages
 *  this month would exceed the plan's limit. Call before enqueuing sends, not after. */
export async function assertQuotaAvailable(organizationId: string, channel: CampaignChannel, additional: number) {
  if (additional <= 0) return;
  const snapshot = await getUsageSnapshot(organizationId);
  const bucket = channel === "EMAIL" ? snapshot.usage.email : snapshot.usage.whatsapp;

  if (bucket.used + additional > bucket.limit) {
    throw new HttpError(
      402,
      `Sending ${additional} ${CHANNEL_LABEL[channel]} message${additional === 1 ? "" : "s"} would exceed your ${snapshot.plan.name} plan's monthly limit of ${bucket.limit.toLocaleString()} (${bucket.used.toLocaleString()} already used). Upgrade your plan to send more.`,
      { code: "QUOTA_EXCEEDED", channel, limit: bucket.limit, used: bucket.used, plan: snapshot.plan.key },
    );
  }
}

/** Throws HttpError(402, ..., {code:"UPGRADE_REQUIRED"}) if the org's current plan doesn't include
 *  social publishing (Instagram/Facebook/LinkedIn) — Free plan is email/WhatsApp only. Call before
 *  connecting a social account or creating a post, never trust the frontend to hide these actions. */
export async function assertSocialFeatureAvailable(organizationId: string) {
  const snapshot = await getUsageSnapshot(organizationId);
  if (!snapshot.plan.socialEnabled) {
    throw new HttpError(
      402,
      `Instagram, Facebook and LinkedIn publishing requires a paid plan. Upgrade from ${snapshot.plan.name} to unlock this feature.`,
      { code: "UPGRADE_REQUIRED", feature: "social", plan: snapshot.plan.key },
    );
  }
}

export async function recordUsage(organizationId: string, channel: CampaignChannel, amount = 1) {
  const periodKey = currentPeriodKey();
  await prisma.usageCounter.upsert({
    where: { organizationId_periodKey_channel: { organizationId, periodKey, channel } },
    create: { organizationId, periodKey, channel, count: amount },
    update: { count: { increment: amount } },
  });
}
