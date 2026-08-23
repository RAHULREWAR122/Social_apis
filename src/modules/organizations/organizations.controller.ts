import { Request, Response } from "express";
import * as organizationsService from "./organizations.service";
import { updateOrganizationSchema } from "./organizations.validation";

export async function getCurrentOrganization(req: Request, res: Response) {
  const organization = await organizationsService.getOrganization(req.auth!.organizationId);
  res.json({ organization });
}

export async function updateCurrentOrganization(req: Request, res: Response) {
  const input = updateOrganizationSchema.parse(req.body);
  const organization = await organizationsService.updateOrganization(req.auth!.organizationId, input);
  res.json({ organization });
}
