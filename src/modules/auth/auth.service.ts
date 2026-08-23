import { OrgRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { signAccessToken } from "../../utils/jwt";
import { sendMail } from "../../lib/mailer";
import {
  generateOpaqueToken,
  generateOtp,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from "../../utils/password";

const REFRESH_TOKEN_TTL_DAYS = 30;
const RESET_TOKEN_TTL_MINUTES = 30;
const RESET_OTP_TTL_MINUTES = 10;
const RESET_OTP_MAX_ATTEMPTS = 5;
const VERIFICATION_TOKEN_TTL_HOURS = 24;

type SessionMeta = { userAgent?: string; ipAddress?: string };

async function createSession(userId: string, meta: SessionMeta) {
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt,
    },
  });

  return { refreshToken, expiresAt };
}

async function issueTokensForUser(userId: string, meta: SessionMeta) {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    throw new HttpError(403, "This account is not linked to any organization");
  }

  const accessToken = signAccessToken({
    sub: userId,
    organizationId: membership.organizationId,
    role: membership.role,
  });

  const { refreshToken, expiresAt } = await createSession(userId, meta);

  return { accessToken, refreshToken, refreshExpiresAt: expiresAt, organizationId: membership.organizationId };
}

export async function register(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  organizationName: string;
  meta: SessionMeta;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      },
    });

    const organization = await tx.organization.create({
      data: { name: input.organizationName },
    });

    await tx.organizationMember.create({
      data: {
        userId: createdUser.id,
        organizationId: organization.id,
        role: OrgRole.OWNER,
      },
    });

    return createdUser;
  });

  const verificationToken = generateOpaqueToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(verificationToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  // TODO(Phase 3+): send verification email via the transactional email provider once email sending infra exists.
  // For now the token is returned so it can be surfaced during local development.
  const tokens = await issueTokensForUser(user.id, input.meta);

  return { user, verificationToken, tokens };
}

export async function login(input: { email: string; password: string; meta: SessionMeta }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  if (!user.isActive) {
    throw new HttpError(403, "This account has been suspended");
  }

  const tokens = await issueTokensForUser(user.id, input.meta);
  return { user, tokens };
}

export async function refresh(refreshToken: string, meta: SessionMeta) {
  const tokenHash = hashOpaqueToken(refreshToken);
  const session = await prisma.userSession.findFirst({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new HttpError(401, "Session expired, please log in again");
  }

  await prisma.userSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  return issueTokensForUser(session.userId, meta);
}

export async function logout(refreshToken: string) {
  const tokenHash = hashOpaqueToken(refreshToken);
  await prisma.userSession.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Step 1 of password reset: emails a 6-digit code if the account exists. Always succeeds silently
 *  either way — never reveal to the caller whether an account exists for this email. */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }

  const otp = generateOtp();
  await prisma.passwordResetOtp.create({
    data: {
      userId: user.id,
      otpHash: hashOpaqueToken(otp),
      expiresAt: new Date(Date.now() + RESET_OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  await sendMail({
    to: user.email,
    subject: "Your password reset code",
    text: `Your password reset code is ${otp}. It expires in ${RESET_OTP_TTL_MINUTES} minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
  });
}

/** Step 2: verifies the emailed code and, on success, mints a short-lived PasswordResetToken —
 *  that token (not the OTP itself) is what actually authorizes the password change in step 3, so a
 *  guessed/leaked OTP alone is useless once its single verification attempt window has passed. */
export async function verifyPasswordResetOtp(email: string, otp: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const invalidError = () => new HttpError(400, "That code is invalid or has expired");
  if (!user) throw invalidError();

  const record = await prisma.passwordResetOtp.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt < new Date()) throw invalidError();
  if (record.attempts >= RESET_OTP_MAX_ATTEMPTS) {
    throw new HttpError(429, "Too many incorrect attempts. Request a new code.");
  }

  if (record.otpHash !== hashOpaqueToken(otp)) {
    await prisma.passwordResetOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw invalidError();
  }

  const resetToken = generateOpaqueToken();
  await prisma.$transaction([
    prisma.passwordResetOtp.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(resetToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  return resetToken;
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashOpaqueToken(token);
  const resetRecord = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null },
  });

  if (!resetRecord || resetRecord.expiresAt < new Date()) {
    throw new HttpError(400, "This reset link is invalid or has expired");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetRecord.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetRecord.id }, data: { usedAt: new Date() } }),
    prisma.userSession.updateMany({
      where: { userId: resetRecord.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function verifyEmail(token: string) {
  const tokenHash = hashOpaqueToken(token);
  const record = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash, usedAt: null },
  });

  if (!record || record.expiresAt < new Date()) {
    throw new HttpError(400, "This verification link is invalid or has expired");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(401, "Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { organization: true } } },
  });

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  const { passwordHash, ...safeUser } = user;
  return safeUser;
}
