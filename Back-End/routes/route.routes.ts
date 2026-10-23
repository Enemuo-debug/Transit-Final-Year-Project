import { Router } from "express";
import { routeController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.use(authenticate);

router.get("/", routeController.listRoutes);
router.post("/", routeController.validateCreateRoute, routeController.createRoute);
router.get("/:id/corridor", routeController.getRouteCorridor);
router.get("/:id", routeController.getRouteById);
router.put("/:id", routeController.validateUpdateRoute, routeController.updateRoute);
router.delete("/:id", routeController.deleteRoute);

export const routeRoutes = router;
