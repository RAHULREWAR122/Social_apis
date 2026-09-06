import { parse } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SYSTEM_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "company",
  "city",
  "country",
] as const;

type SystemField = (typeof SYSTEM_FIELDS)[number];
export type ColumnMapping = Partial<Record<SystemField, string>>;

export type ImportReport = {
  totalRows: number;
  imported: number;
  duplicatesInFile: number;
  duplicatesInDatabase: number;
  invalidEmail: number;
  invalidPhone: number;
  missingIdentifier: number;
};

function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email);
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function isValidPhone(phone: string) {
  const digitCount = phone.replace(/[^\d]/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}

export function previewCsv(buffer: Buffer) {
  const rows: Record<string, string>[] = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    to: 6,
  });

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  const suggestedMapping: ColumnMapping = {};
  for (const column of columns) {
    const normalized = column.toLowerCase().replace(/[^a-z]/g, "");
    const match = SYSTEM_FIELDS.find((field) => field.toLowerCase() === normalized);
    if (match) suggestedMapping[match] = column;
  }

  return { columns, suggestedMapping, sampleRows: rows.slice(0, 5) };
}

export async function importCsv(
  organizationId: string,
  buffer: Buffer,
  mapping: ColumnMapping,
  listId?: string,
): Promise<ImportReport> {
  const rows: Record<string, string>[] = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (rows.length === 0) {
    throw new HttpError(400, "The uploaded file has no data rows");
  }
  if (rows.length > 20000) {
    throw new HttpError(400, "CSV import is limited to 20,000 rows per file for now");
  }

  if (listId) {
    const list = await prisma.contactList.findFirst({ where: { id: listId, organizationId } });
    if (!list) throw new HttpError(404, "List not found");
  }

  const report: ImportReport = {
    totalRows: rows.length,
    imported: 0,
    duplicatesInFile: 0,
    duplicatesInDatabase: 0,
    invalidEmail: 0,
    invalidPhone: 0,
    missingIdentifier: 0,
  };

  const seenInFile = new Set<string>();
  const toInsert: Prisma.ContactUncheckedCreateInput[] = [];

  for (const row of rows) {
    const value = (field: SystemField) => {
      const column = mapping[field];
      return column ? row[column]?.trim() : undefined;
    };

    const email = value("email") || undefined;
    const phoneRaw = value("phone") || undefined;
    const phone = phoneRaw ? normalizePhone(phoneRaw) : undefined;

    if (!email && !phone) {
      report.missingIdentifier += 1;
      continue;
    }

    if (email && !isValidEmail(email)) {
      report.invalidEmail += 1;
      continue;
    }

    if (phone && !isValidPhone(phone)) {
      report.invalidPhone += 1;
      continue;
    }

    const dedupeKey = `${email ?? ""}|${phone ?? ""}`;
    if (seenInFile.has(dedupeKey)) {
      report.duplicatesInFile += 1;
      continue;
    }
    seenInFile.add(dedupeKey);

    toInsert.push({
      organizationId,
      firstName: value("firstName") || null,
      lastName: value("lastName") || null,
      email: email ?? null,
      phone: phone ?? null,
      company: value("company") || null,
      city: value("city") || null,
      country: value("country") || null,
      source: "csv_import",
    });
  }

  const listMemberContactIds: string[] = [];

  for (const record of toInsert) {
    const existing = await prisma.contact.findFirst({
      where: {
        organizationId,
        OR: [
          ...(record.email ? [{ email: record.email }] : []),
          ...(record.phone ? [{ phone: record.phone }] : []),
        ],
      },
    });

    if (existing) {
      report.duplicatesInDatabase += 1;
      if (listId) listMemberContactIds.push(existing.id);
      continue;
    }

    const created = await prisma.contact.create({ data: record });
    report.imported += 1;
    if (listId) listMemberContactIds.push(created.id);
  }

  if (listId && listMemberContactIds.length > 0) {
    await prisma.contactListMember.createMany({
      data: listMemberContactIds.map((contactId) => ({ contactListId: listId, contactId })),
      skipDuplicates: true,
    });
  }

  return report;
}
