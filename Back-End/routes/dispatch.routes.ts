import { Router } from "express";
import { dispatchController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.use(authenticate);

router.get("/incident/:incidentId", dispatchController.getIncidentDispatches);
router.get("/", dispatchController.listMyDispatches);
router.patch("/:id/status", dispatchController.validateUpdateDispatch, dispatchController.updateDispatchStatus);

export const dispatchRoutes = router;
