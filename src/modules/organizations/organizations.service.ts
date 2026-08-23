import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";

export async function getOrganization(organizationId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new HttpError(404, "Organization not found");
  }
  return organization;
}

export async function updateOrganization(
  organizationId: string,
  data: Partial<{
    name: string;
    businessType: string;
    country: string;
    timezone: string;
    onboardingStep: string;
  }>,
) {
  return prisma.organization.update({ where: { id: organizationId }, data });
}
