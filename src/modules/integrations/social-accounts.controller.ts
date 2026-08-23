import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";

export async function listSocialAccounts(req: Request, res: Response) {
  const accounts = await prisma.socialAccount.findMany({
    where: { organizationId: req.auth!.organizationId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ accounts });
}

export async function disconnectSocialAccount(req: Request, res: Response) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!account) throw new HttpError(404, "Social account not found");
  await prisma.socialAccount.delete({ where: { id: account.id } });
  res.status(204).send();
}
