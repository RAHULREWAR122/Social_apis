import { z } from "zod";

export const createSocialPostSchema = z.object({
  caption: z.string().min(1, "Caption is required"),
  mediaIds: z.array(z.string().uuid()).min(1, "At least one image or video is required").max(10, "At most 10 media items are allowed"),
  socialAccountIds: z.array(z.string().uuid()).min(1, "Select at least one connected account to post to"),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be an ISO datetime" }).optional(),
});
