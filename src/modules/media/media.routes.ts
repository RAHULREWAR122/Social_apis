import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as mediaController from "./media.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(mediaController.listMedia));
router.post("/upload", upload.single("file"), asyncHandler(mediaController.uploadMedia));
router.delete("/:id", asyncHandler(mediaController.deleteMedia));

export default router;
