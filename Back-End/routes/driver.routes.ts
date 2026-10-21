import { Router } from "express";
import { driverController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.post("/login", driverController.validateDriverLogin, driverController.driverLogin);

router.use(authenticate);

router.get("/bus", driverController.getMyBus);
router.get("/journey", driverController.getMyJourney);
router.post("/journey/start", driverController.startMyJourney);
router.post("/journey/end", driverController.endMyJourney);
router.post("/position", driverController.validatePosition, driverController.submitPosition);
router.patch("/status", driverController.validateStatus, driverController.updateStatus);

export const driverRoutes = router;