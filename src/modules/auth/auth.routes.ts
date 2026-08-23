import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as authController from "./auth.controller";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

// Separate from loginLimiter: sharing one bucket meant legitimate OTP retries (the 5-per-code cap
// enforced in auth.service) could get blocked by an unrelated login attempt eating the same quota.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

router.post("/register", asyncHandler(authController.register));
router.post("/login", loginLimiter, asyncHandler(authController.login));
router.post("/refresh", asyncHandler(authController.refresh));
router.post("/logout", asyncHandler(authController.logout));
router.post("/forgot-password", otpLimiter, asyncHandler(authController.forgotPassword));
router.post("/verify-reset-otp", otpLimiter, asyncHandler(authController.verifyResetOtp));
router.post("/reset-password", asyncHandler(authController.resetPassword));
router.post("/verify-email", asyncHandler(authController.verifyEmail));
router.get("/me", requireAuth, asyncHandler(authController.me));
router.post("/change-password", requireAuth, asyncHandler(authController.changePassword));

export default router;
