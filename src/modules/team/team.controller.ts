import { Request, Response } from "express";
import * as teamService from "./team.service";
import { inviteMemberSchema, updateMemberRoleSchema } from "./team.validation";

export async function listMembers(req: Request, res: Response) {
  const members = await teamService.listMembers(req.auth!.organizationId);
  res.json({ members });
}

export async function inviteMember(req: Request, res: Response) {
  const input = inviteMemberSchema.parse(req.body);
  const result = await teamService.inviteMember(req.auth!.organizationId, input);
  res.status(201).json(result);
}

export async function updateMemberRole(req: Request, res: Response) {
  const { role } = updateMemberRoleSchema.parse(req.body);
  const member = await teamService.updateMemberRole(req.auth!.organizationId, req.params.id, role);
  res.json({ member });
}

export async function removeMember(req: Request, res: Response) {
  await teamService.removeMember(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}
