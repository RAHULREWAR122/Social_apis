import { startCampaignDispatchWorker } from "./campaign-dispatch.worker";
import { startEmailSendWorker } from "./email-send.worker";
import { startWhatsAppSendWorker } from "./whatsapp-send.worker";
import { startSocialPublishWorker } from "./social-publish.worker";

export function startWorkers() {
  const workers = [
    startCampaignDispatchWorker(),
    startEmailSendWorker(),
    startWhatsAppSendWorker(),
    startSocialPublishWorker(),
  ];
  console.log(`Started ${workers.length} campaign workers`);
  return workers;
}
