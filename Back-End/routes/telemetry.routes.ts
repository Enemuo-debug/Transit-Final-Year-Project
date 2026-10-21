import { Router } from "express";
import { telemetryController } from "../controllers/index.js";

const router = Router();

router.get("/status", telemetryController.getInfraStatus);
router.get("/live", telemetryController.validateLiveQuery, telemetryController.getLivePositions);
router.get("/live/:deviceId", telemetryController.getLivePositionById);

export const telemetryRoutes = router;