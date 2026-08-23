import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as templatesController from "./templates.controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(templatesController.listTemplates));
router.post("/", asyncHandler(templatesController.createTemplate));
router.get("/:id", asyncHandler(templatesController.getTemplate));
router.patch("/:id", asyncHandler(templatesController.updateTemplate));
router.delete("/:id", asyncHandler(templatesController.deleteTemplate));
router.post("/:id/duplicate", asyncHandler(templatesController.duplicateTemplate));

export default router;
