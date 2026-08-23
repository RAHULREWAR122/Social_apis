import { Router } from "express";
import { OrgRole } from "@prisma/client";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import * as billingController from "./billing.controller";

const router = Router();

// Public: Cashfree calls this directly, no Authorization header.
router.post("/webhook", asyncHandler(billingController.webhook));

router.use(requireAuth);

const requireAdmin = requireRole(OrgRole.OWNER, OrgRole.ADMIN);

router.get("/", asyncHandler(billingController.getBilling));
router.post("/change-plan", requireAdmin, asyncHandler(billingController.changePlan));
router.post("/checkout", requireAdmin, asyncHandler(billingController.checkout));
router.get("/checkout/:linkId/sync", requireAdmin, asyncHandler(billingController.syncCheckout));

export default router;
