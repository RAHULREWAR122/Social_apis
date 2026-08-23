import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

function isConfigured() {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

/** Sends the platform's own transactional email (password reset, etc) — separate from the
 *  per-organization Gmail/WhatsApp integrations, which send on behalf of tenants, not us.
 *  Falls back to logging the message when no SMTP provider is configured yet, so local dev and
 *  testing work without one — callers must never surface configuration state to the end user
 *  (that would leak whether an account exists), so this never throws. */
export async function sendMail(input: { to: string; subject: string; text: string }) {
  if (!isConfigured()) {
    console.log(`[mailer] SMTP not configured — logging instead of sending.\nTo: ${input.to}\nSubject: ${input.subject}\n${input.text}`);
    return;
  }

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
