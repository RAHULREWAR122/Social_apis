import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as socialPostController from "./social-post.controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(socialPostController.listPosts));
router.post("/", asyncHandler(socialPostController.createPost));
router.get("/:id", asyncHandler(socialPostController.getPost));
router.post("/:id/cancel", asyncHandler(socialPostController.cancelPost));
router.delete("/:id", asyncHandler(socialPostController.deletePost));

export default router;
