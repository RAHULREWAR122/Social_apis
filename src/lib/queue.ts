import { Queue } from "bullmq";
import { env } from "../config/env";

// BullMQ manages its own Redis connections; each Queue/Worker gets a dedicated one
// per BullMQ's recommendation rather than sharing the app's general-purpose `redis` client.
const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null };

export type CampaignDispatchJob = { campaignId: string };
export type EmailSendJob = { campaignId: string; campaignRecipientId: string };
export type WhatsAppSendJob = { campaignId: string; campaignRecipientId: string };
export type SocialPublishJob = { socialPostTargetId: string };

export const campaignDispatchQueue = new Queue<CampaignDispatchJob>("campaign-dispatch", { connection });
export const emailSendQueue = new Queue<EmailSendJob>("email-send", { connection });
export const whatsappSendQueue = new Queue<WhatsAppSendJob>("whatsapp-send", { connection });
// One shared queue for all three social platforms — the worker dispatches to the right adapter
// internally based on the target's connected account platform, so there's no need for a
// per-platform queue the way email/whatsapp have (their job payloads actually differ; this one doesn't).
export const socialPublishQueue = new Queue<SocialPublishJob>("social-publish", { connection });

export { connection as queueConnection };
