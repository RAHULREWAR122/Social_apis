import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import * as listsController from "./lists.controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(listsController.listLists));
router.post("/", asyncHandler(listsController.createList));
router.patch("/:id", asyncHandler(listsController.updateList));
router.delete("/:id", asyncHandler(listsController.deleteList));
router.post("/:id/contacts", asyncHandler(listsController.addContacts));
router.delete("/:id/contacts/:contactId", asyncHandler(listsController.removeContact));

export default router;
