import { Request, Response } from "express";
import { env } from "../../config/env";
import { HttpError } from "../../utils/http-error";
import * as gmailService from "./gmail.service";

export async function connectGmail(req: Request, res: Response) {
  const url = gmailService.buildAuthUrl(req.auth!.organizationId);
  res.json({ url });
}

export async function gmailCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error || !code || !state) {
    return res.redirect(`${env.WEB_APP_URL}/app/integrations?gmail=error`);
  }

  try {
    await gmailService.handleCallback(code, state);
    res.redirect(`${env.WEB_APP_URL}/app/integrations?gmail=connected`);
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "connection_failed";
    res.redirect(`${env.WEB_APP_URL}/app/integrations?gmail=error&reason=${encodeURIComponent(message)}`);
  }
}

export async function listEmailAccounts(req: Request, res: Response) {
  const accounts = await gmailService.listEmailAccounts(req.auth!.organizationId);
  res.json({ accounts });
}

export async function disconnectEmailAccount(req: Request, res: Response) {
  await gmailService.disconnectEmailAccount(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}
