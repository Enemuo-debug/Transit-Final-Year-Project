import { Router } from "express";
import { incidentController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.use(authenticate);

router.post("/sos", incidentController.validateSos, incidentController.raiseSos);
router.get("/", incidentController.validateListIncidents, incidentController.listIncidents);
router.get("/:id", incidentController.getIncidentById);
router.patch("/:id/status", incidentController.validateUpdateStatus, incidentController.updateIncidentStatus);

export const incidentRoutes = router;
