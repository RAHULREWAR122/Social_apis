import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as tagsController from "./tags.controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(tagsController.listTags));
router.post("/", asyncHandler(tagsController.createTag));
router.delete("/:id", asyncHandler(tagsController.deleteTag));

export default router;
