import { Request, Response } from "express";
import { env } from "../../config/env";
import { HttpError } from "../../utils/http-error";
import * as metaService from "./meta.service";
import type { MetaVariant } from "./meta.service";

export async function connectMeta(req: Request, res: Response) {
  const variant = (req.query.variant as MetaVariant) === "instagram" ? "instagram" : "facebook";
  const url = await metaService.buildAuthUrl(req.auth!.organizationId, variant);
  res.json({ url });
}

export async function metaCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error || !code || !state) {
    return res.redirect(`${env.WEB_APP_URL}/app/social?meta=error`);
  }

  try {
    await metaService.handleCallback(code, state);
    res.redirect(`${env.WEB_APP_URL}/app/social?meta=connected`);
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "connection_failed";
    res.redirect(`${env.WEB_APP_URL}/app/social?meta=error&reason=${encodeURIComponent(message)}`);
  }
}
