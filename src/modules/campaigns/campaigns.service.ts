import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { personalize, resolveWhatsAppVariables } from "../../utils/personalize";
import { campaignDispatchQueue } from "../../lib/queue";
import { assertQuotaAvailable } from "../billing/usage.service";
import { sendEmail } from "./adapters/email-adapter";
import { sendWhatsAppTemplate } from "./adapters/whatsapp-adapter";

type CampaignInput = {
  name: string;
  channel: "EMAIL" | "WHATSAPP";
  listId?: string;
  tagId?: string;
  emailAccountId?: string;
  emailTemplateId?: string;
  subject?: string;
  bodyHtml?: string;
  whatsappAccountId?: string;
  whatsappTemplateId?: string;
  templateVariableMap?: Record<string, string>;
};

const RECIPIENT_STATUS_VALUES = ["PENDING", "PROCESSING", "SENT", "DELIVERED", "FAILED", "BOUNCED", "UNSUBSCRIBED"] as const;

export async function listCampaigns(
  organizationId: string,
  filters: { channel?: "EMAIL" | "WHATSAPP"; status?: string },
) {
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId, channel: filters.channel, status: filters.status as never },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true } } },
  });
  return campaigns;
}

async function getRecipientStatusCounts(campaignId: string) {
  const counts = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: true,
  });
  const result: Record<string, number> = {};
  for (const status of RECIPIENT_STATUS_VALUES) result[status] = 0;
  for (const row of counts) result[row.status] = row._count;
  return result;
}

export async function getCampaign(organizationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: {
      emailAccount: { select: { emailAddress: true } },
      emailTemplate: { select: { name: true } },
      whatsappAccount: { select: { displayPhoneNumber: true } },
      whatsappTemplate: { select: { name: true } },
      list: { select: { name: true } },
      tag: { select: { name: true } },
    },
  });
  if (!campaign) throw new HttpError(404, "Campaign not found");

  const recipientCounts = await getRecipientStatusCounts(campaignId);
  return { ...campaign, recipientCounts };
}

export async function listCampaignRecipients(
  organizationId: string,
  campaignId: string,
  params: { cursor?: string; limit?: number },
) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true } });
  if (!campaign) throw new HttpError(404, "Campaign not found");

  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    take: limit,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      errorMessage: true,
      sentAt: true,
      deliveredAt: true,
      contact: { select: { firstName: true, lastName: true, email: true, phone: true } },
    },
  });

  const nextCursor = recipients.length === limit ? recipients[recipients.length - 1].id : null;
  return { recipients, nextCursor };
}

export async function createCampaign(organizationId: string, input: CampaignInput) {
  return prisma.campaign.create({ data: { organizationId, status: "DRAFT", ...input } });
}

async function getEditableCampaign(organizationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
  if (!campaign) throw new HttpError(404, "Campaign not found");
  return campaign;
}

export async function updateCampaign(organizationId: string, campaignId: string, input: Partial<CampaignInput>) {
  const campaign = await getEditableCampaign(organizationId, campaignId);
  if (campaign.status !== "DRAFT") {
    throw new HttpError(409, "Only draft campaigns can be edited");
  }
  return prisma.campaign.update({ where: { id: campaignId }, data: input });
}

export async function deleteCampaign(organizationId: string, campaignId: string) {
  const campaign = await getEditableCampaign(organizationId, campaignId);
  if (campaign.status === "RUNNING" || campaign.status === "QUEUED") {
    throw new HttpError(409, "Cancel the campaign before deleting it");
  }
  await prisma.campaign.delete({ where: { id: campaignId } });
}

async function getSuppressedSets(organizationId: string) {
  const entries = await prisma.suppressionListEntry.findMany({
    where: { organizationId },
    select: { email: true, phone: true },
  });
  return {
    emails: new Set(entries.filter((e) => e.email).map((e) => e.email!.toLowerCase())),
    phones: new Set(entries.filter((e) => e.phone).map((e) => e.phone!)),
  };
}

export async function resolveAudienceContacts(
  organizationId: string,
  channel: "EMAIL" | "WHATSAPP",
  audience: { listId?: string | null; tagId?: string | null },
) {
  const suppressed = await getSuppressedSets(organizationId);

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      ...(channel === "EMAIL" ? { emailOptIn: true, email: { not: null } } : { whatsappOptIn: true, phone: { not: null } }),
      ...(audience.listId ? { listMemberships: { some: { contactListId: audience.listId } } } : {}),
      ...(audience.tagId ? { tags: { some: { tagId: audience.tagId } } } : {}),
    },
  });

  return contacts.filter((contact) => {
    if (channel === "EMAIL") return !suppressed.emails.has(contact.email!.toLowerCase());
    return !suppressed.phones.has(contact.phone!);
  });
}

async function assertSendable(organizationId: string, campaignId: string) {
  const campaign = await getEditableCampaign(organizationId, campaignId);
  if (campaign.status !== "DRAFT") {
    throw new HttpError(409, `Campaign is already ${campaign.status.toLowerCase()}`);
  }
  return campaign;
}

export async function sendNow(organizationId: string, campaignId: string) {
  const campaign = await assertSendable(organizationId, campaignId);
  const contacts = await resolveAudienceContacts(organizationId, campaign.channel, {
    listId: campaign.listId,
    tagId: campaign.tagId,
  });
  await assertQuotaAvailable(organizationId, campaign.channel, contacts.length);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "QUEUED" } });
  await campaignDispatchQueue.add("dispatch", { campaignId }, { jobId: `dispatch-${campaignId}` });
  return getCampaign(organizationId, campaignId);
}

export async function scheduleCampaign(organizationId: string, campaignId: string, scheduledAtIso: string) {
  const campaign = await assertSendable(organizationId, campaignId);
  const scheduledAt = new Date(scheduledAtIso);
  const delay = scheduledAt.getTime() - Date.now();
  if (delay <= 0) throw new HttpError(400, "scheduledAt must be in the future");

  const contacts = await resolveAudienceContacts(organizationId, campaign.channel, {
    listId: campaign.listId,
    tagId: campaign.tagId,
  });
  await assertQuotaAvailable(organizationId, campaign.channel, contacts.length);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "SCHEDULED", scheduledAt } });
  await campaignDispatchQueue.add("dispatch", { campaignId }, { delay, jobId: `dispatch-${campaignId}` });
  return getCampaign(organizationId, campaignId);
}

export async function pauseCampaign(organizationId: string, campaignId: string) {
  const campaign = await getEditableCampaign(organizationId, campaignId);
  if (!["QUEUED", "RUNNING", "SCHEDULED"].includes(campaign.status)) {
    throw new HttpError(409, `Cannot pause a campaign that is ${campaign.status.toLowerCase()}`);
  }
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
}

export async function resumeCampaign(organizationId: string, campaignId: string) {
  const campaign = await getEditableCampaign(organizationId, campaignId);
  if (campaign.status !== "PAUSED") throw new HttpError(409, "Only paused campaigns can be resumed");

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  const { requeuePendingRecipients } = await import("./campaigns.dispatch");
  await requeuePendingRecipients(campaign);
  return getCampaign(organizationId, campaignId);
}

export async function cancelCampaign(organizationId: string, campaignId: string) {
  const campaign = await getEditableCampaign(organizationId, campaignId);
  if (["COMPLETED", "CANCELLED", "FAILED"].includes(campaign.status)) {
    throw new HttpError(409, `Campaign is already ${campaign.status.toLowerCase()}`);
  }
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "CANCELLED" } });
}

const SAMPLE_CONTACT = {
  firstName: "Test",
  lastName: "Contact",
  email: null as string | null,
  phone: null as string | null,
  company: "Your Company",
  city: "Your City",
  country: "Your Country",
  customFields: {},
};

export async function sendTest(
  organizationId: string,
  campaignId: string,
  input: { toEmail?: string; toPhone?: string },
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { emailAccount: true, emailTemplate: true, whatsappAccount: true, whatsappTemplate: true },
  });
  if (!campaign) throw new HttpError(404, "Campaign not found");

  if (campaign.channel === "EMAIL") {
    if (!input.toEmail) throw new HttpError(400, "toEmail is required for an email campaign test");
    if (!campaign.emailAccountId || !campaign.emailAccount) throw new HttpError(400, "Campaign has no sending account");

    const subject = campaign.subject ?? campaign.emailTemplate?.subject ?? "";
    const bodyHtml = campaign.bodyHtml ?? campaign.emailTemplate?.bodyHtml ?? "";
    const sample = { ...SAMPLE_CONTACT, email: input.toEmail };

    await sendEmail({
      emailAccountId: campaign.emailAccountId,
      fromAddress: campaign.emailAccount.emailAddress,
      to: input.toEmail,
      subject: `[TEST] ${personalize(subject, sample)}`,
      bodyHtml: personalize(bodyHtml, sample),
    });
    return { sent: true };
  }

  if (!input.toPhone) throw new HttpError(400, "toPhone is required for a WhatsApp campaign test");
  if (!campaign.whatsappAccountId || !campaign.whatsappTemplate) {
    throw new HttpError(400, "Campaign has no WhatsApp account or template");
  }

  const sample = { ...SAMPLE_CONTACT, phone: input.toPhone };
  const variables = resolveWhatsAppVariables(
    (campaign.templateVariableMap as Record<string, string>) ?? {},
    sample,
  );

  await sendWhatsAppTemplate({
    whatsappAccountId: campaign.whatsappAccountId,
    to: input.toPhone,
    templateName: campaign.whatsappTemplate.name,
    language: campaign.whatsappTemplate.language,
    variables,
  });
  return { sent: true };
}
