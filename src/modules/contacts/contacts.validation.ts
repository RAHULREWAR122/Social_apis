import { z } from "zod";

export const createContactSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  company: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  source: z.string().optional(),
  emailOptIn: z.boolean().optional(),
  whatsappOptIn: z.boolean().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export const updateContactSchema = createContactSchema.partial().extend({
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  listId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  emailOptIn: z.coerce.boolean().optional(),
  whatsappOptIn: z.coerce.boolean().optional(),
});
