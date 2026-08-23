import { z } from "zod";

const baseCampaignFields = z.object({
  name: z.string().min(1, "Campaign name is required"),
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  listId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),

  emailAccountId: z.string().uuid().optional(),
  emailTemplateId: z.string().uuid().optional(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),

  whatsappAccountId: z.string().uuid().optional(),
  whatsappTemplateId: z.string().uuid().optional(),
  templateVariableMap: z.record(z.string(), z.string()).optional(),
});

function validateChannelFields(input: z.infer<typeof baseCampaignFields>, ctx: z.RefinementCtx) {
  if (!input.listId && !input.tagId) {
    ctx.addIssue({ code: "custom", message: "Select an audience: a contact list or a tag", path: ["listId"] });
  }
  if (input.listId && input.tagId) {
    ctx.addIssue({ code: "custom", message: "Choose either a list or a tag, not both", path: ["tagId"] });
  }

  if (input.channel === "EMAIL") {
    if (!input.emailAccountId) {
      ctx.addIssue({ code: "custom", message: "Select a sending email account", path: ["emailAccountId"] });
    }
    if (!input.emailTemplateId && (!input.subject || !input.bodyHtml)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide a subject and content, or select a template",
        path: ["bodyHtml"],
      });
    }
  }

  if (input.channel === "WHATSAPP") {
    if (!input.whatsappAccountId) {
      ctx.addIssue({ code: "custom", message: "Select a WhatsApp business account", path: ["whatsappAccountId"] });
    }
    if (!input.whatsappTemplateId) {
      ctx.addIssue({ code: "custom", message: "Select an approved WhatsApp template", path: ["whatsappTemplateId"] });
    }
  }
}

export const createCampaignSchema = baseCampaignFields.superRefine(validateChannelFields);

export const updateCampaignSchema = baseCampaignFields.partial().extend({ channel: z.enum(["EMAIL", "WHATSAPP"]) });

export const scheduleCampaignSchema = z.object({
  scheduledAt: z.string().datetime({ message: "scheduledAt must be an ISO datetime" }),
});

export const testCampaignSchema = z
  .object({
    toEmail: z.string().email().optional(),
    toPhone: z.string().optional(),
  })
  .refine((v) => v.toEmail || v.toPhone, { message: "Provide toEmail or toPhone" });
