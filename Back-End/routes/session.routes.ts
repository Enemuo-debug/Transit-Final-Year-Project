import { Router } from "express";
import { sessionController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.use(authenticate);

router.get("/", sessionController.listSessions);
router.post("/", sessionController.validateCreateSession, sessionController.createSession);
router.delete("/:id", sessionController.deactivateSession);

export const sessionRoutes = router;