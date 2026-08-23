import { Request, Response } from "express";
import * as analyticsService from "./analytics.service";

export async function getDashboardAnalytics(req: Request, res: Response) {
  const analytics = await analyticsService.getDashboardAnalytics(req.auth!.organizationId);
  res.json({ analytics });
}
