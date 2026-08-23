import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as analyticsController from "./analytics.controller";

const router = Router();

router.use(requireAuth);
router.get("/dashboard", asyncHandler(analyticsController.getDashboardAnalytics));

export default router;
