import { Router } from "express";
import { OrgRole } from "@prisma/client";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import * as whatsappController from "./whatsapp.controller";

const router = Router();

router.use(requireAuth);

const requireAdmin = requireRole(OrgRole.OWNER, OrgRole.ADMIN);

router.get("/accounts", asyncHandler(whatsappController.listAccounts));
router.post("/accounts/connect", requireAdmin, asyncHandler(whatsappController.connectAccount));
router.delete("/accounts/:id", requireAdmin, asyncHandler(whatsappController.disconnectAccount));

router.get("/templates", asyncHandler(whatsappController.listTemplates));
router.post("/templates", asyncHandler(whatsappController.createTemplate));
router.patch("/templates/:id", asyncHandler(whatsappController.updateTemplate));
router.delete("/templates/:id", asyncHandler(whatsappController.deleteTemplate));

export default router;
