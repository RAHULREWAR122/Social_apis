import { Request, Response } from "express";
import { env } from "../../config/env";
import { HttpError } from "../../utils/http-error";
import * as linkedinService from "./linkedin.service";
import type { LinkedInVariant } from "./linkedin.service";

export async function connectLinkedIn(req: Request, res: Response) {
  const variant = (req.query.variant as LinkedInVariant) === "organization" ? "organization" : "personal";
  const url = await linkedinService.buildAuthUrl(req.auth!.organizationId, variant);
  res.json({ url });
}

export async function linkedinCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error || !code || !state) {
    return res.redirect(`${env.WEB_APP_URL}/app/social?linkedin=error`);
  }

  try {
    await linkedinService.handleCallback(code, state);
    res.redirect(`${env.WEB_APP_URL}/app/social?linkedin=connected`);
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "connection_failed";
    res.redirect(`${env.WEB_APP_URL}/app/social?linkedin=error&reason=${encodeURIComponent(message)}`);
  }
}
