import { z } from "zod";

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  businessType: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  onboardingStep: z
    .enum(["business_info", "connect_email", "connect_whatsapp", "import_contacts", "done"])
    .optional(),
});
