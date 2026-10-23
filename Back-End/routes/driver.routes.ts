import { Router } from "express";
import { driverController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

// Public: exchange a dispatcher code + plate for a driver JWT.
router.post("/login", driverController.validateDriverLogin, driverController.driverLogin);

router.use(authenticate);

router.get("/journey", driverController.getMyJourney);
router.post("/journey/start", driverController.startMyJourney);
router.post("/position", driverController.validatePosition, driverController.submitPosition);

export const driverRoutes = router;
