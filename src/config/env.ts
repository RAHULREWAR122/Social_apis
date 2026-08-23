import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ override: true });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  WEB_APP_URL: z.string().default("https://social-marketing-software.vercel.app"),
  API_BASE_URL: z.string().default("http://localhost:4100/api/v1"),

  // 32-byte (64 hex char) key used to encrypt OAuth tokens at rest. Generate with:
  // node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be a 64-character hex string"),

  // Optional until a Google Cloud OAuth client is configured — Gmail connect routes
  // check these explicitly and return a clear error rather than failing app startup.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Set on Meta's WhatsApp webhook subscription config to verify the GET handshake.
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default("change-me-webhook-verify-token"),
  WHATSAPP_GRAPH_API_VERSION: z.string().default("v20.0"),

  // Optional until a Cashfree merchant account is configured — billing checkout routes check
  // these explicitly and return a clear error rather than failing app startup.
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  CASHFREE_API_VERSION: z.string().default("2023-08-01"),

  // Optional until a Meta app is configured — Facebook/Instagram connect routes check these
  // explicitly and return a clear error rather than failing app startup. One Meta app covers
  // both Facebook Page and linked Instagram Business Account publishing (same Graph API).
  META_CLIENT_ID: z.string().optional(),
  META_CLIENT_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v21.0"),

  // Optional until a LinkedIn app is configured. Personal-profile posting works with a standard
  // app; organization/company-page posting additionally requires LinkedIn to approve the app for
  // their Marketing Developer Platform partner program — a manual business process, not something
  // these keys alone unlock.
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_API_VERSION: z.string().default("202405"),

  // Local disk storage for uploaded post media (images/videos), served at /uploads. Real
  // publishing to Instagram/Facebook/LinkedIn requires this to be reachable over the public
  // internet (production deploy, or a tunnel for local testing) — see storage.ts.
  UPLOADS_DIR: z.string().default("uploads"),
  API_ORIGIN: z.string().default("http://localhost:4100"),

  // Optional until an SMTP provider is configured — the platform's own transactional emails
  // (password reset codes, etc; see lib/mailer.ts) log to the server console instead of failing
  // when these are unset, so local dev/testing works without a real mail provider.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('"Marketing SaaS" <no-reply@example.com>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
