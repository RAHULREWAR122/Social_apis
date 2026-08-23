import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import * as webhooksController from "./webhooks.controller";

const router = Router();

// Public: called directly by Meta, no Authorization header.
router.get("/whatsapp", webhooksController.verifyWhatsAppWebhook);
router.post("/whatsapp", asyncHandler(webhooksController.handleWhatsAppWebhook));

export default router;
