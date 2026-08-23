import { z } from "zod";

export const checkoutSchema = z.object({
  plan: z.enum(["starter", "business", "pro"]),
  customerPhone: z.string().regex(/^\+?\d{10,15}$/, "Enter a valid phone number"),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
});
