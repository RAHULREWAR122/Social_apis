import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";

export async function listLists(organizationId: string) {
  return prisma.contactList.findMany({
    where: { organizationId },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });
}

async function assertOwnership(organizationId: string, listId: string) {
  const list = await prisma.contactList.findFirst({ where: { id: listId, organizationId } });
  if (!list) throw new HttpError(404, "List not found");
  return list;
}

export async function createList(organizationId: string, name: string) {
  const existing = await prisma.contactList.findFirst({ where: { organizationId, name } });
  if (existing) throw new HttpError(409, `A list named "${name}" already exists`);
  return prisma.contactList.create({ data: { organizationId, name } });
}

export async function updateList(organizationId: string, listId: string, name?: string) {
  await assertOwnership(organizationId, listId);
  if (!name) return prisma.contactList.findUniqueOrThrow({ where: { id: listId } });
  return prisma.contactList.update({ where: { id: listId }, data: { name } });
}

export async function deleteList(organizationId: string, listId: string) {
  await assertOwnership(organizationId, listId);
  await prisma.contactList.delete({ where: { id: listId } });
}

export async function addContactsToList(organizationId: string, listId: string, contactIds: string[]) {
  await assertOwnership(organizationId, listId);
  const validContacts = await prisma.contact.findMany({
    where: { organizationId, id: { in: contactIds } },
    select: { id: true },
  });

  await prisma.contactListMember.createMany({
    data: validContacts.map((contact) => ({ contactListId: listId, contactId: contact.id })),
    skipDuplicates: true,
  });
}

export async function removeContactFromList(organizationId: string, listId: string, contactId: string) {
  await assertOwnership(organizationId, listId);
  await prisma.contactListMember.deleteMany({ where: { contactListId: listId, contactId } });
}
