import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";

type ContactInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
  country?: string;
  source?: string;
  emailOptIn?: boolean;
  whatsappOptIn?: boolean;
  tagIds?: string[];
};

function normalizePhone(phone?: string) {
  if (!phone) return phone;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits;
}

async function assertUniqueWithinOrg(
  organizationId: string,
  input: { email?: string; phone?: string },
  excludeContactId?: string,
) {
  if (input.email) {
    const existing = await prisma.contact.findFirst({
      where: { organizationId, email: input.email, id: { not: excludeContactId } },
    });
    if (existing) throw new HttpError(409, `A contact with email ${input.email} already exists`);
  }
  if (input.phone) {
    const existing = await prisma.contact.findFirst({
      where: { organizationId, phone: input.phone, id: { not: excludeContactId } },
    });
    if (existing) throw new HttpError(409, `A contact with phone ${input.phone} already exists`);
  }
}

export async function listContacts(
  organizationId: string,
  filters: {
    page: number;
    limit: number;
    search?: string;
    status?: "ACTIVE" | "ARCHIVED";
    listId?: string;
    tagId?: string;
    emailOptIn?: boolean;
    whatsappOptIn?: boolean;
  },
) {
  const where: Prisma.ContactWhereInput = {
    organizationId,
    status: filters.status ?? "ACTIVE",
    ...(filters.emailOptIn !== undefined ? { emailOptIn: filters.emailOptIn } : {}),
    ...(filters.whatsappOptIn !== undefined ? { whatsappOptIn: filters.whatsappOptIn } : {}),
    ...(filters.listId ? { listMemberships: { some: { contactListId: filters.listId } } } : {}),
    ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
    ...(filters.search
      ? {
          OR: [
            { firstName: { contains: filters.search, mode: "insensitive" } },
            { lastName: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
            { phone: { contains: filters.search, mode: "insensitive" } },
            { company: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [contacts, total] = await prisma.$transaction([
    prisma.contact.findMany({
      where,
      include: { tags: { include: { tag: true } } },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.contact.count({ where }),
  ]);

  return { contacts, total, page: filters.page, limit: filters.limit };
}

export async function getContact(organizationId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    include: { tags: { include: { tag: true } }, listMemberships: { include: { contactList: true } } },
  });
  if (!contact) throw new HttpError(404, "Contact not found");
  return contact;
}

export async function createContact(organizationId: string, input: ContactInput) {
  const normalized = { ...input, phone: normalizePhone(input.phone) };
  await assertUniqueWithinOrg(organizationId, normalized);

  return prisma.contact.create({
    data: {
      organizationId,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      email: normalized.email,
      phone: normalized.phone,
      company: normalized.company,
      city: normalized.city,
      country: normalized.country,
      source: normalized.source,
      emailOptIn: normalized.emailOptIn ?? true,
      whatsappOptIn: normalized.whatsappOptIn ?? true,
      tags: normalized.tagIds
        ? { create: normalized.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: { tags: { include: { tag: true } } },
  });
}

export async function updateContact(
  organizationId: string,
  contactId: string,
  input: ContactInput & { status?: "ACTIVE" | "ARCHIVED" },
) {
  await getContact(organizationId, contactId);
  const normalized = { ...input, phone: normalizePhone(input.phone) };
  await assertUniqueWithinOrg(organizationId, normalized, contactId);

  return prisma.contact.update({
    where: { id: contactId },
    data: {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      email: normalized.email,
      phone: normalized.phone,
      company: normalized.company,
      city: normalized.city,
      country: normalized.country,
      source: normalized.source,
      emailOptIn: normalized.emailOptIn,
      whatsappOptIn: normalized.whatsappOptIn,
      status: normalized.status,
      ...(normalized.tagIds
        ? { tags: { deleteMany: {}, create: normalized.tagIds.map((tagId) => ({ tagId })) } }
        : {}),
    },
    include: { tags: { include: { tag: true } } },
  });
}

export async function deleteContact(organizationId: string, contactId: string) {
  await getContact(organizationId, contactId);
  await prisma.contact.delete({ where: { id: contactId } });
}

export async function setOptIn(
  organizationId: string,
  contactId: string,
  optIns: { emailOptIn?: boolean; whatsappOptIn?: boolean },
) {
  await getContact(organizationId, contactId);
  return prisma.contact.update({ where: { id: contactId }, data: optIns });
}
