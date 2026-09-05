import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { validationErrorHandler } from "./middleware/validation-error";
import authRoutes from "./modules/auth/auth.routes";
import organizationsRoutes from "./modules/organizations/organizations.routes";
import contactsRoutes from "./modules/contacts/contacts.routes";
import listsRoutes from "./modules/lists/lists.routes";
import tagsRoutes from "./modules/tags/tags.routes";
import integrationsRoutes from "./modules/integrations/integrations.routes";
import templatesRoutes from "./modules/templates/templates.routes";
import whatsappRoutes from "./modules/whatsapp/whatsapp.routes";
import campaignsRoutes from "./modules/campaigns/campaigns.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import teamRoutes from "./modules/team/team.routes";
import billingRoutes from "./modules/billing/billing.routes";
import webhooksRoutes from "./modules/webhooks/webhooks.routes";
import mediaRoutes from "./modules/media/media.routes";
import socialPostsRoutes from "./modules/social/social-post.routes";

export function createApp() {
  const app = express();

  // Render (like most hosts) puts the app behind a reverse proxy. Without this, Express can't
  // read the real client IP from X-Forwarded-For, so every request looks like it comes from the
  // same proxy IP — collapsing IP-keyed rate limits (e.g. the login limiter) into one shared
  // bucket for the entire app instead of one per real visitor.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.WEB_APP_URL, credentials: true }));
  app.use(
    express.json({
      // Cashfree signs the exact raw request bytes for webhook verification — express.json()
      // consumes the stream, so this is the only chance to keep a copy.
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Uploaded post media (images/videos) — Instagram/Facebook/LinkedIn fetch from these URLs when
  // publishing, so the marketing-support frontend (a different origin) must also be able to load
  // them directly in <img>/<video> tags. helmet()'s default Cross-Origin-Resource-Policy:
  // same-origin would silently block that, so it's relaxed for this route only.
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.resolve(process.cwd(), env.UPLOADS_DIR)),
  );

  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/organizations", organizationsRoutes);
  app.use("/api/v1/contacts", contactsRoutes);
  app.use("/api/v1/lists", listsRoutes);
  app.use("/api/v1/tags", tagsRoutes);
  app.use("/api/v1/integrations", integrationsRoutes);
  app.use("/api/v1/templates", templatesRoutes);
  app.use("/api/v1/whatsapp", whatsappRoutes);
  app.use("/api/v1/campaigns", campaignsRoutes);
  app.use("/api/v1/analytics", analyticsRoutes);
  app.use("/api/v1/team", teamRoutes);
  app.use("/api/v1/billing", billingRoutes);
  app.use("/api/v1/webhooks", webhooksRoutes);
  app.use("/api/v1/media", mediaRoutes);
  app.use("/api/v1/social-posts", socialPostsRoutes);

  app.use(notFoundHandler);
  app.use(validationErrorHandler);
  app.use(errorHandler);

  return app;
}
