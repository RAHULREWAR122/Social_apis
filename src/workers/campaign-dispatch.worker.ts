import { Worker } from "bullmq";
import { queueConnection, type CampaignDispatchJob } from "../lib/queue";
import { dispatchCampaign } from "../modules/campaigns/campaigns.dispatch";

export function startCampaignDispatchWorker() {
  const worker = new Worker<CampaignDispatchJob>(
    "campaign-dispatch",
    async (job) => {
      await dispatchCampaign(job.data.campaignId);
    },
    { connection: queueConnection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error(`campaign-dispatch job ${job?.id} failed:`, err.message);
  });

  return worker;
}
