-- New WhatsApp templates start out PENDING instead of APPROVED: creating a template row here
-- has never meant Meta actually approved it, so defaulting to APPROVED let unapproved/test
-- templates (e.g. "hello_world") get attached to real campaigns and sent to production numbers.
ALTER TABLE "whatsapp_templates" ALTER COLUMN "status" SET DEFAULT 'PENDING';
