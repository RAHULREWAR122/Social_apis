import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";

export async function listTemplates(organizationId: string) {
  return prisma.emailTemplate.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" } });
}

export async function getTemplate(organizationId: string, templateId: string) {
  const template = await prisma.emailTemplate.findFirst({ where: { id: templateId, organizationId } });
  if (!template) throw new HttpError(404, "Template not found");
  return template;
}

export async function createTemplate(
  organizationId: string,
  input: { name: string; subject: string; bodyHtml: string },
) {
  const existing = await prisma.emailTemplate.findFirst({
    where: { organizationId, name: input.name },
  });
  if (existing) throw new HttpError(409, `A template named "${input.name}" already exists`);

  return prisma.emailTemplate.create({ data: { organizationId, ...input } });
}

export async function updateTemplate(
  organizationId: string,
  templateId: string,
  input: Partial<{ name: string; subject: string; bodyHtml: string }>,
) {
  await getTemplate(organizationId, templateId);
  return prisma.emailTemplate.update({ where: { id: templateId }, data: input });
}

export async function deleteTemplate(organizationId: string, templateId: string) {
  await getTemplate(organizationId, templateId);
  await prisma.emailTemplate.delete({ where: { id: templateId } });
}

export async function duplicateTemplate(organizationId: string, templateId: string) {
  const template = await getTemplate(organizationId, templateId);
  let name = `${template.name} (copy)`;
  let suffix = 2;
  while (await prisma.emailTemplate.findFirst({ where: { organizationId, name } })) {
    name = `${template.name} (copy ${suffix})`;
    suffix += 1;
  }

  return prisma.emailTemplate.create({
    data: { organizationId, name, subject: template.subject, bodyHtml: template.bodyHtml },
  });
}
