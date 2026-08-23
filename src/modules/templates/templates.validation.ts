import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  subject: z.string().min(1, "Subject is required"),
  bodyHtml: z.string().min(1, "Email content is required"),
});

export const updateTemplateSchema = createTemplateSchema.partial();
