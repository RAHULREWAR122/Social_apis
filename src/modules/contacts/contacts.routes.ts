import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as contactsController from "./contacts.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(contactsController.listContacts));
router.post("/", asyncHandler(contactsController.createContact));
router.get("/:id", asyncHandler(contactsController.getContact));
router.patch("/:id", asyncHandler(contactsController.updateContact));
router.delete("/:id", asyncHandler(contactsController.deleteContact));

router.post("/import/preview", upload.single("file"), asyncHandler(contactsController.previewImport));
router.post("/import/confirm", upload.single("file"), asyncHandler(contactsController.confirmImport));

export default router;
