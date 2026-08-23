import bcrypt from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const generateOpaqueToken = () => crypto.randomBytes(32).toString("hex");

export const hashOpaqueToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

/** A 6-digit numeric code, suitable for emailing (short enough to type by hand). Security against
 *  brute force comes from a short expiry + a low attempts cap enforced where it's verified, not
 *  from the code space itself. */
export const generateOtp = () => crypto.randomInt(100_000, 1_000_000).toString();
