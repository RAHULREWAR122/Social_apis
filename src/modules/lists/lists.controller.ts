import { Request, Response } from "express";
import * as listsService from "./lists.service";
import { createListSchema, listMembershipSchema, updateListSchema } from "./lists.validation";

export async function listLists(req: Request, res: Response) {
  const lists = await listsService.listLists(req.auth!.organizationId);
  res.json({ lists });
}

export async function createList(req: Request, res: Response) {
  const input = createListSchema.parse(req.body);
  const list = await listsService.createList(req.auth!.organizationId, input.name);
  res.status(201).json({ list });
}

export async function updateList(req: Request, res: Response) {
  const input = updateListSchema.parse(req.body);
  const list = await listsService.updateList(req.auth!.organizationId, req.params.id, input.name);
  res.json({ list });
}

export async function deleteList(req: Request, res: Response) {
  await listsService.deleteList(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}

export async function addContacts(req: Request, res: Response) {
  const input = listMembershipSchema.parse(req.body);
  await listsService.addContactsToList(req.auth!.organizationId, req.params.id, input.contactIds);
  res.status(204).send();
}

export async function removeContact(req: Request, res: Response) {
  await listsService.removeContactFromList(req.auth!.organizationId, req.params.id, req.params.contactId);
  res.status(204).send();
}
