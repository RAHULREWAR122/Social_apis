import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as organizationsController from "./organizations.controller";

const router = Router();

router.use(requireAuth);
router.get("/me", asyncHandler(organizationsController.getCurrentOrganization));
router.patch("/me", asyncHandler(organizationsController.updateCurrentOrganization));

export default router;
