import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER", "ANALYST"]),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER", "ANALYST"]),
});
