import type { Campaign } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { emailSendQueue, whatsappSendQueue } from "../../lib/queue";
import { assertQuotaAvailable } from "../billing/usage.service";
import { resolveAudienceContacts } from "./campaigns.service";

async function enqueueRecipients(campaign: Campaign, campaignRecipientIds: string[]) {
  const queue = campaign.channel === "EMAIL" ? emailSendQueue : whatsappSendQueue;
  await queue.addBulk(
    campaignRecipientIds.map((campaignRecipientId) => ({
      name: "send",
      data: { campaignId: campaign.id, campaignRecipientId },
    })),
  );
}

/** Expands a campaign into recipient rows and enqueues one send job per recipient. Runs inside the campaign-dispatch worker. */
export async function dispatchCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;
  if (campaign.status !== "QUEUED" && campaign.status !== "SCHEDULED") return; // already cancelled/paused before dispatch ran

  const contacts = await resolveAudienceContacts(campaign.organizationId, campaign.channel, {
    listId: campaign.listId,
    tagId: campaign.tagId,
  });

  if (contacts.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "FAILED" } });
    return;
  }

  // Re-verify quota at dispatch time too — for scheduled campaigns, usage may have changed (or the
  // plan may have lapsed) in the gap between "Schedule" and the scheduled time actually arriving.
  try {
    await assertQuotaAvailable(campaign.organizationId, campaign.channel, contacts.length);
  } catch {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "FAILED" } });
    return;
  }

  await prisma.campaignRecipient.createMany({
    data: contacts.map((contact) => ({ campaignId, contactId: contact.id })),
    skipDuplicates: true,
  });

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
    select: { id: true },
  });

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING", sentAt: new Date() } });
  await enqueueRecipients(campaign, recipients.map((r) => r.id));
}

/** Re-enqueues recipients still PENDING after a campaign is resumed from PAUSED. */
export async function requeuePendingRecipients(campaign: Campaign) {
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: campaign.id, status: "PENDING" },
    select: { id: true },
  });
  if (recipients.length > 0) {
    await enqueueRecipients(campaign, recipients.map((r) => r.id));
  }
}

/** Marks a campaign COMPLETED once every recipient has left PENDING/PROCESSING — called after each send attempt. */
export async function maybeCompleteCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === "CANCELLED" || campaign.status === "PAUSED") return;

  const remaining = await prisma.campaignRecipient.count({
    where: { campaignId, status: { in: ["PENDING", "PROCESSING"] } },
  });
  if (remaining === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
  }
}
