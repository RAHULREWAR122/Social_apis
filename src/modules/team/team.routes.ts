import { Router } from "express";
import { OrgRole } from "@prisma/client";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import * as teamController from "./team.controller";

const router = Router();

router.use(requireAuth);

const requireAdmin = requireRole(OrgRole.OWNER, OrgRole.ADMIN);

router.get("/members", asyncHandler(teamController.listMembers));
router.post("/members", requireAdmin, asyncHandler(teamController.inviteMember));
router.patch("/members/:id", requireAdmin, asyncHandler(teamController.updateMemberRole));
router.delete("/members/:id", requireAdmin, asyncHandler(teamController.removeMember));

export default router;
