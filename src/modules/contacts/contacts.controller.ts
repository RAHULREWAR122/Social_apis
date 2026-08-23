import { Request, Response } from "express";
import { HttpError } from "../../utils/http-error";
import * as contactsService from "./contacts.service";
import * as importService from "./contacts-import.service";
import { createContactSchema, listContactsQuerySchema, updateContactSchema } from "./contacts.validation";

export async function listContacts(req: Request, res: Response) {
  const query = listContactsQuerySchema.parse(req.query);
  const result = await contactsService.listContacts(req.auth!.organizationId, query);
  res.json(result);
}

export async function getContact(req: Request, res: Response) {
  const contact = await contactsService.getContact(req.auth!.organizationId, req.params.id);
  res.json({ contact });
}

export async function createContact(req: Request, res: Response) {
  const input = createContactSchema.parse(req.body);
  const contact = await contactsService.createContact(req.auth!.organizationId, input);
  res.status(201).json({ contact });
}

export async function updateContact(req: Request, res: Response) {
  const input = updateContactSchema.parse(req.body);
  const contact = await contactsService.updateContact(req.auth!.organizationId, req.params.id, input);
  res.json({ contact });
}

export async function deleteContact(req: Request, res: Response) {
  await contactsService.deleteContact(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}

export async function previewImport(req: Request, res: Response) {
  if (!req.file) {
    throw new HttpError(400, "No file uploaded");
  }
  const preview = importService.previewCsv(req.file.buffer);
  res.json(preview);
}

export async function confirmImport(req: Request, res: Response) {
  if (!req.file) {
    throw new HttpError(400, "No file uploaded");
  }
  let mapping: importService.ColumnMapping;
  try {
    mapping = JSON.parse(req.body.mapping ?? "{}");
  } catch {
    throw new HttpError(400, "Invalid mapping payload");
  }

  const report = await importService.importCsv(req.auth!.organizationId, req.file.buffer, mapping);
  res.json({ report });
}
