import { Request, Response } from "express";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";

export function verifyWhatsAppWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
}

const STATUS_MAP: Record<string, "SENT" | "DELIVERED" | "FAILED"> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "DELIVERED",
  failed: "FAILED",
};

export async function handleWhatsAppWebhook(req: Request, res: Response) {
  // Acknowledge immediately — Meta expects a fast 200 and retries on failure/timeout.
  res.sendStatus(200);

  try {
    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          const mapped = STATUS_MAP[status.status as string];
          if (!mapped) continue;

          await prisma.campaignRecipient.updateMany({
            where: { providerMessageId: status.id },
            data: {
              status: mapped,
              deliveredAt: mapped === "DELIVERED" ? new Date() : undefined,
              errorMessage: mapped === "FAILED" ? JSON.stringify(status.errors ?? []) : undefined,
            },
          });
        }
      }
    }
  } catch (err) {
    console.error("Failed to process WhatsApp webhook event:", err);
  }
}
