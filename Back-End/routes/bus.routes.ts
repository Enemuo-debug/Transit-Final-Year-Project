import { Router } from "express";
import { busController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.use(authenticate);

router.get("/", busController.getAllBuses);
router.post("/", busController.validateCreateBus, busController.createBus);
router.get("/:id", busController.getBusById);
router.put("/:id", busController.validateUpdateBus, busController.updateBus);
router.delete("/:id", busController.deleteBus);

export const busRoutes = router;