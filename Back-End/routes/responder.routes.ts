import { Router } from "express";
import { responderController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.use(authenticate);

router.get("/", responderController.getAllResponders);
router.post("/", responderController.validateCreateResponder, responderController.createResponder);
router.get("/:id", responderController.getResponderById);
router.put("/:id", responderController.validateUpdateResponder, responderController.updateResponder);
router.delete("/:id", responderController.deleteResponder);

export const responderRoutes = router;