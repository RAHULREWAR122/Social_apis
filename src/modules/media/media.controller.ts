import { Request, Response } from "express";
import { HttpError } from "../../utils/http-error";
import * as mediaService from "./media.service";

export async function uploadMedia(req: Request, res: Response) {
  if (!req.file) {
    throw new HttpError(400, "No file uploaded");
  }
  const media = await mediaService.createMedia(req.auth!.organizationId, req.file);
  res.status(201).json({ media });
}

export async function listMedia(req: Request, res: Response) {
  const media = await mediaService.listMedia(req.auth!.organizationId);
  res.json({ media });
}

export async function deleteMedia(req: Request, res: Response) {
  await mediaService.deleteMedia(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}
