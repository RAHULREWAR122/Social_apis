import { Request, Response } from "express";
import * as templatesService from "./templates.service";
import { createTemplateSchema, updateTemplateSchema } from "./templates.validation";

export async function listTemplates(req: Request, res: Response) {
  const templates = await templatesService.listTemplates(req.auth!.organizationId);
  res.json({ templates });
}

export async function getTemplate(req: Request, res: Response) {
  const template = await templatesService.getTemplate(req.auth!.organizationId, req.params.id);
  res.json({ template });
}

export async function createTemplate(req: Request, res: Response) {
  const input = createTemplateSchema.parse(req.body);
  const template = await templatesService.createTemplate(req.auth!.organizationId, input);
  res.status(201).json({ template });
}

export async function updateTemplate(req: Request, res: Response) {
  const input = updateTemplateSchema.parse(req.body);
  const template = await templatesService.updateTemplate(req.auth!.organizationId, req.params.id, input);
  res.json({ template });
}

export async function deleteTemplate(req: Request, res: Response) {
  await templatesService.deleteTemplate(req.auth!.organizationId, req.params.id);
  res.status(204).send();
  
}

export async function duplicateTemplate(req: Request, res: Response) {
  const template = await templatesService.duplicateTemplate(req.auth!.organizationId, req.params.id);
  res.status(201).json({ template });
}
