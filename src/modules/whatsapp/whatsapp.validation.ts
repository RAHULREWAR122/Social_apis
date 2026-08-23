import { z } from "zod";

export const connectAccountSchema = z.object({
  businessAccountId: z.string().min(1, "Business account ID is required"),
  phoneNumberId: z.string().min(1, "Phone number ID is required"),
  displayPhoneNumber: z.string().min(1, "Display phone number is required"),
  businessName: z.string().optional(),
  accessToken: z.string().min(1, "Access token is required"),
});

export const createTemplateSchema = z.object({
  whatsappAccountId: z.string().uuid(),
  name: z.string().min(1, "Template name is required"),
  language: z.string().min(1).default("en_US"),
  bodyText: z.string().min(1, "Template body is required"),
});

export const updateTemplateSchema = z.object({
  bodyText: z.string().min(1).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "DISABLED"]).optional(),
});
