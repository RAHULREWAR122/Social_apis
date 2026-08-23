import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as campaignsController from "./campaigns.controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(campaignsController.listCampaigns));
router.post("/", asyncHandler(campaignsController.createCampaign));
router.get("/:id", asyncHandler(campaignsController.getCampaign));
router.get("/:id/recipients", asyncHandler(campaignsController.listRecipients));
router.patch("/:id", asyncHandler(campaignsController.updateCampaign));
router.delete("/:id", asyncHandler(campaignsController.deleteCampaign));

router.post("/:id/test", asyncHandler(campaignsController.sendTest));
router.post("/:id/send", asyncHandler(campaignsController.sendNow));
router.post("/:id/schedule", asyncHandler(campaignsController.scheduleCampaign));
router.post("/:id/pause", asyncHandler(campaignsController.pauseCampaign));
router.post("/:id/resume", asyncHandler(campaignsController.resumeCampaign));
router.post("/:id/cancel", asyncHandler(campaignsController.cancelCampaign));

export default router;
