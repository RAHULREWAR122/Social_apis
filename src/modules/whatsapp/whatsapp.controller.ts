import { Request, Response } from "express";
import * as whatsappService from "./whatsapp.service";
import { connectAccountSchema, createTemplateSchema, updateTemplateSchema } from "./whatsapp.validation";

export async function connectAccount(req: Request, res: Response) {
  const input = connectAccountSchema.parse(req.body);
  const account = await whatsappService.connectAccount(req.auth!.organizationId, input);
  res.status(201).json({ account });
}

export async function listAccounts(req: Request, res: Response) {
  const accounts = await whatsappService.listAccounts(req.auth!.organizationId);
  res.json({ accounts });
}

export async function disconnectAccount(req: Request, res: Response) {
  await whatsappService.disconnectAccount(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}

export async function listTemplates(req: Request, res: Response) {
  const templates = await whatsappService.listTemplates(req.auth!.organizationId);
  res.json({ templates });
}

export async function createTemplate(req: Request, res: Response) {
  const input = createTemplateSchema.parse(req.body);
  const template = await whatsappService.createTemplate(req.auth!.organizationId, input);
  res.status(201).json({ template });
}

export async function updateTemplate(req: Request, res: Response) {
  const input = updateTemplateSchema.parse(req.body);
  const template = await whatsappService.updateTemplate(req.auth!.organizationId, req.params.id, input);
  res.json({ template });
}

export async function deleteTemplate(req: Request, res: Response) {
  await whatsappService.deleteTemplate(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}
