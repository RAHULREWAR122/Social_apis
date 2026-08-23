import { Request, Response } from "express";
import { env } from "../../config/env";
import { HttpError } from "../../utils/http-error";
import * as authService from "./auth.service";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyResetOtpSchema,
} from "./auth.validation";

const REFRESH_COOKIE_NAME = "refresh_token";

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  // Must be "/" (not scoped to /api/v1/auth) so the Next.js frontend's proxy.ts
  // can detect session presence via request.cookies on any path.
  path: "/",
};

function sessionMeta(req: Request) {
  return { userAgent: req.headers["user-agent"], ipAddress: req.ip };
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const { user, tokens } = await authService.register({ ...input, meta: sessionMeta(req) });

  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...refreshCookieOptions,
    expires: tokens.refreshExpiresAt,
  });

  res.status(201).json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    accessToken: tokens.accessToken,
    organizationId: tokens.organizationId,
  });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { user, tokens } = await authService.login({ ...input, meta: sessionMeta(req) });

  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...refreshCookieOptions,
    expires: tokens.refreshExpiresAt,
  });

  res.json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    accessToken: tokens.accessToken,
    organizationId: tokens.organizationId,
  });
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    throw new HttpError(401, "Missing refresh token");
  }

  const tokens = await authService.refresh(refreshToken, sessionMeta(req));

  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...refreshCookieOptions,
    expires: tokens.refreshExpiresAt,
  });

  res.json({ accessToken: tokens.accessToken, organizationId: tokens.organizationId });
}

export async function logout(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
  res.status(204).send();
}

export async function forgotPassword(req: Request, res: Response) {
  const input = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(input.email);
  res.json({ message: "If an account exists for this email, a 6-digit code has been sent." });
}

export async function verifyResetOtp(req: Request, res: Response) {
  const input = verifyResetOtpSchema.parse(req.body);
  const resetToken = await authService.verifyPasswordResetOtp(input.email, input.otp);
  res.json({ resetToken });
}

export async function resetPassword(req: Request, res: Response) {
  const input = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(input.token, input.newPassword);
  res.json({ message: "Password updated successfully. Please log in again." });
}

export async function verifyEmail(req: Request, res: Response) {
  const input = verifyEmailSchema.parse(req.body);
  await authService.verifyEmail(input.token);
  res.json({ message: "Email verified successfully." });
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(req.auth!.userId);
  res.json({ user });
}

export async function changePassword(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.auth!.userId, input.currentPassword, input.newPassword);
  res.json({ message: "Password updated successfully." });
}
