import { Worker } from "bullmq";
import { prisma } from "../lib/prisma";
import { queueConnection, type EmailSendJob } from "../lib/queue";
import { maybeCompleteCampaign } from "../modules/campaigns/campaigns.dispatch";
import { recordUsage } from "../modules/billing/usage.service";
import { personalize } from "../utils/personalize";
import { sendEmail } from "../modules/campaigns/adapters/email-adapter";

export function startEmailSendWorker() {
  const worker = new Worker<EmailSendJob>(
    "email-send",
    async (job) => {
      const { campaignId, campaignRecipientId } = job.data;

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { emailAccount: true, emailTemplate: true },
      });
      if (!campaign || campaign.status === "PAUSED" || campaign.status === "CANCELLED") return;

      const recipient = await prisma.campaignRecipient.findUnique({
        where: { id: campaignRecipientId },
        include: { contact: true },
      });
      if (!recipient || !campaign.emailAccount) return;

      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "PROCESSING" } });

      const subject = campaign.subject ?? campaign.emailTemplate?.subject ?? "";
      const bodyHtml = campaign.bodyHtml ?? campaign.emailTemplate?.bodyHtml ?? "";

      try {
        const { providerMessageId } = await sendEmail({
          emailAccountId: campaign.emailAccountId!,
          fromAddress: campaign.emailAccount.emailAddress,
          to: recipient.contact.email!,
          subject: personalize(subject, recipient.contact),
          bodyHtml: personalize(bodyHtml, recipient.contact),
        });

        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SENT", providerMessageId, sentAt: new Date() },
        });
        await recordUsage(campaign.organizationId, "EMAIL");
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
    console.error(`email-send job ${job?.id} failed:`, err.message);
  });

  return worker;
}
