import { Worker } from "bullmq";
import { prisma } from "../lib/prisma";
import { queueConnection, type WhatsAppSendJob } from "../lib/queue";
import { maybeCompleteCampaign } from "../modules/campaigns/campaigns.dispatch";
import { recordUsage } from "../modules/billing/usage.service";
import { resolveWhatsAppVariables } from "../utils/personalize";
import { sendWhatsAppTemplate } from "../modules/campaigns/adapters/whatsapp-adapter";

export function startWhatsAppSendWorker() {
  const worker = new Worker<WhatsAppSendJob>(
    "whatsapp-send",
    async (job) => {
      const { campaignId, campaignRecipientId } = job.data;

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { whatsappTemplate: true },
      });
      if (!campaign || campaign.status === "PAUSED" || campaign.status === "CANCELLED") return;

      const recipient = await prisma.campaignRecipient.findUnique({
        where: { id: campaignRecipientId },
        include: { contact: true },
      });
      if (!recipient || !campaign.whatsappAccountId || !campaign.whatsappTemplate) return;

      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "PROCESSING" } });

      const variables = resolveWhatsAppVariables(
        (campaign.templateVariableMap as Record<string, string>) ?? {},
        recipient.contact,
      );

      try {
        const { providerMessageId } = await sendWhatsAppTemplate({
          whatsappAccountId: campaign.whatsappAccountId,
          to: recipient.contact.phone!,
          templateName: campaign.whatsappTemplate.name,
          language: campaign.whatsappTemplate.language,
          variables,
        });

        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SENT", providerMessageId, sentAt: new Date() },
        });
        await recordUsage(campaign.organizationId, "WHATSAPP");
      } catch (err) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : "Send failed" },
        });
      }

      await maybeCompleteCampaign(campaignId);
    },
    { connection: queueConnection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error(`whatsapp-send job ${job?.id} failed:`, err.message);
  });

  return worker;
}
