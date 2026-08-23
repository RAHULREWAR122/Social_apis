import { Router } from "express";
import { OrgRole } from "@prisma/client";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import * as integrationsController from "./integrations.controller";
import * as metaController from "./meta.controller";
import * as linkedinController from "./linkedin.controller";
import * as socialAccountsController from "./social-accounts.controller";

const router = Router();

// Public: the provider redirects the user's browser here directly, with no Authorization header.
router.get("/gmail/callback", asyncHandler(integrationsController.gmailCallback));
router.get("/meta/callback", asyncHandler(metaController.metaCallback));
router.get("/linkedin/callback", asyncHandler(linkedinController.linkedinCallback));

router.use(requireAuth);

const requireAdmin = requireRole(OrgRole.OWNER, OrgRole.ADMIN);

router.get("/email-accounts", asyncHandler(integrationsController.listEmailAccounts));
router.post("/gmail/connect", requireAdmin, asyncHandler(integrationsController.connectGmail));
router.delete("/email-accounts/:id", requireAdmin, asyncHandler(integrationsController.disconnectEmailAccount));

router.get("/social-accounts", asyncHandler(socialAccountsController.listSocialAccounts));
router.post("/meta/connect", requireAdmin, asyncHandler(metaController.connectMeta));
router.post("/linkedin/connect", requireAdmin, asyncHandler(linkedinController.connectLinkedIn));
router.delete("/social-accounts/:id", requireAdmin, asyncHandler(socialAccountsController.disconnectSocialAccount));

export default router;
