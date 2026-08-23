import { z } from "zod";

export const createListSchema = z.object({
  name: z.string().min(1, "List name is required"),
});

export const updateListSchema = createListSchema.partial();

export const listMembershipSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1),
});
