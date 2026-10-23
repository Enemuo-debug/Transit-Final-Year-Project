import { Router } from "express";
import { journeyController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.use(authenticate);

router.get("/", journeyController.validateListJourneys, journeyController.listJourneys);
router.post("/", journeyController.validateCreateJourney, journeyController.createJourney);
router.get("/:id", journeyController.getJourneyById);
router.patch("/:id/complete", journeyController.completeJourney);
router.delete("/:id", journeyController.deleteJourney);

export const journeyRoutes = router;
