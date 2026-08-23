import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";

export async function listTags(organizationId: string) {
  return prisma.tag.findMany({
    where: { organizationId },
    include: { _count: { select: { contacts: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createTag(organizationId: string, name: string) {
  const existing = await prisma.tag.findFirst({ where: { organizationId, name } });
  if (existing) throw new HttpError(409, `A tag named "${name}" already exists`);
  return prisma.tag.create({ data: { organizationId, name } });
}

export async function deleteTag(organizationId: string, tagId: string) {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, organizationId } });
  if (!tag) throw new HttpError(404, "Tag not found");
  await prisma.tag.delete({ where: { id: tagId } });
}
