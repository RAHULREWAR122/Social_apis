import { Request, Response } from "express";
import * as tagsService from "./tags.service";
import { createTagSchema } from "./tags.validation";

export async function listTags(req: Request, res: Response) {
  const tags = await tagsService.listTags(req.auth!.organizationId);
  res.json({ tags });
}

export async function createTag(req: Request, res: Response) {
  const input = createTagSchema.parse(req.body);
  const tag = await tagsService.createTag(req.auth!.organizationId, input.name);
  res.status(201).json({ tag });
}

export async function deleteTag(req: Request, res: Response) {
  await tagsService.deleteTag(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}
