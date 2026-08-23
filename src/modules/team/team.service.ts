import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { hashPassword } from "../../utils/password";

export async function listMembers(organizationId: string) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members;
}

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, URL-safe
}

export async function inviteMember(
  organizationId: string,
  input: {
    email: string;
    firstName?: string;
    lastName?: string;
    role: "ADMIN" | "MANAGER" | "MEMBER" | "ANALYST";
    password?: string;
  },
) {
  let user = await prisma.user.findUnique({ where: { email: input.email } });
  let temporaryPassword: string | undefined;

  if (!user) {
    // Admin-supplied password is used as-is; otherwise generate one and surface it once in the response.
    const passwordToUse = input.password ?? generateTemporaryPassword();
    if (!input.password) temporaryPassword = passwordToUse;

    user = await prisma.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash: await hashPassword(passwordToUse),
      },
    });
  }

  const existingMembership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
  });
  if (existingMembership) throw new HttpError(409, "This person is already a member of your team");

  const member = await prisma.organizationMember.create({
    data: { organizationId, userId: user.id, role: input.role },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } } },
  });

  return { member, temporaryPassword };
}

async function getMember(organizationId: string, memberId: string) {
  const member = await prisma.organizationMember.findFirst({ where: { id: memberId, organizationId } });
  if (!member) throw new HttpError(404, "Team member not found");
  return member;
}

async function countOwners(organizationId: string) {
  return prisma.organizationMember.count({ where: { organizationId, role: "OWNER" } });
}

export async function updateMemberRole(organizationId: string, memberId: string, role: string) {
  const member = await getMember(organizationId, memberId);

  if (member.role === "OWNER" && role !== "OWNER" && (await countOwners(organizationId)) <= 1) {
    throw new HttpError(409, "An organization must have at least one owner");
  }

  return prisma.organizationMember.update({
    where: { id: memberId },
    data: { role: role as never },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } } },
  });
}

export async function removeMember(organizationId: string, memberId: string) {
  const member = await getMember(organizationId, memberId);

  if (member.role === "OWNER" && (await countOwners(organizationId)) <= 1) {
    throw new HttpError(409, "An organization must have at least one owner");
  }

  await prisma.organizationMember.delete({ where: { id: memberId } });
}
