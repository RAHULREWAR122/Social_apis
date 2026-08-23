import { Request, Response } from "express";
import { z } from "zod";
import * as billingService from "./billing.service";
import { checkoutSchema } from "./billing.validation";

export async function getBilling(req: Request, res: Response) {
  const billing = await billingService.getBilling(req.auth!.organizationId);
  res.json(billing);
}

export async function changePlan(req: Request, res: Response) {
  const { plan } = z.object({ plan: z.string() }).parse(req.body);
  const billing = await billingService.changePlan(req.auth!.organizationId, plan);
  res.json(billing);
}

export async function checkout(req: Request, res: Response) {
  const input = checkoutSchema.parse(req.body);
  const result = await billingService.createCheckout(req.auth!.organizationId, input);
  res.status(201).json(result);
}

export async function syncCheckout(req: Request, res: Response) {
  const { linkId } = z.object({ linkId: z.string().min(1) }).parse(req.params);
  const billing = await billingService.syncCheckout(req.auth!.organizationId, linkId);
  res.json(billing);
}

export async function webhook(req: Request, res: Response) {
  const signature = req.header("x-webhook-signature");
  const timestamp = req.header("x-webhook-timestamp");
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? JSON.stringify(req.body);

  await billingService.handleCashfreeWebhook(rawBody, signature, timestamp);
  res.status(200).json({ received: true });
}
