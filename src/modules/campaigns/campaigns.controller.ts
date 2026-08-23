import { Request, Response } from "express";
import * as campaignsService from "./campaigns.service";
import {
  createCampaignSchema,
  scheduleCampaignSchema,
  testCampaignSchema,
  updateCampaignSchema,
} from "./campaigns.validation";

export async function listCampaigns(req: Request, res: Response) {
  const { channel, status } = req.query as { channel?: "EMAIL" | "WHATSAPP"; status?: string };
  const campaigns = await campaignsService.listCampaigns(req.auth!.organizationId, { channel, status });
  res.json({ campaigns });
}

export async function getCampaign(req: Request, res: Response) {
  const campaign = await campaignsService.getCampaign(req.auth!.organizationId, req.params.id);
  res.json({ campaign });
}

export async function listRecipients(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: string };
  const result = await campaignsService.listCampaignRecipients(req.auth!.organizationId, req.params.id, {
    cursor,
    limit: limit ? Number(limit) : undefined,
  });
  res.json(result);
}

export async function createCampaign(req: Request, res: Response) {
  const input = createCampaignSchema.parse(req.body);
  const campaign = await campaignsService.createCampaign(req.auth!.organizationId, input);
  res.status(201).json({ campaign });
}

export async function updateCampaign(req: Request, res: Response) {
  const input = updateCampaignSchema.parse(req.body);
  const campaign = await campaignsService.updateCampaign(req.auth!.organizationId, req.params.id, input);
  res.json({ campaign });
}

export async function deleteCampaign(req: Request, res: Response) {
  await campaignsService.deleteCampaign(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}

export async function sendNow(req: Request, res: Response) {
  const campaign = await campaignsService.sendNow(req.auth!.organizationId, req.params.id);
  res.json({ campaign });
}

export async function scheduleCampaign(req: Request, res: Response) {
  const { scheduledAt } = scheduleCampaignSchema.parse(req.body);
  const campaign = await campaignsService.scheduleCampaign(req.auth!.organizationId, req.params.id, scheduledAt);
  res.json({ campaign });
}

export async function pauseCampaign(req: Request, res: Response) {
  const campaign = await campaignsService.pauseCampaign(req.auth!.organizationId, req.params.id);
  res.json({ campaign });
}

export async function resumeCampaign(req: Request, res: Response) {
  const campaign = await campaignsService.resumeCampaign(req.auth!.organizationId, req.params.id);
  res.json({ campaign });
}

export async function cancelCampaign(req: Request, res: Response) {
  const campaign = await campaignsService.cancelCampaign(req.auth!.organizationId, req.params.id);
  res.json({ campaign });
}

export async function sendTest(req: Request, res: Response) {
  const input = testCampaignSchema.parse(req.body);
  const result = await campaignsService.sendTest(req.auth!.organizationId, req.params.id, input);
  res.json(result);
}
