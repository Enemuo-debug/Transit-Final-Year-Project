import { Router } from "express";
import { responderController, responderLocationController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.use(authenticate);

router.get(
  "/nearest",
  responderLocationController.validateNearestQuery,
  responderLocationController.findNearestResponderLocations,
);
router.get("/me/locations", responderLocationController.getMyLocations);
router.post(
  "/me/locations",
  responderLocationController.validateCreateResponderLocation,
  responderLocationController.createMyLocation,
);
router.patch(
  "/me/locations/:locationId",
  responderLocationController.validateUpdateResponderLocation,
  responderLocationController.updateMyLocation,
);
router.delete("/me/locations/:locationId", responderLocationController.deleteMyLocation);

router.get("/", responderController.getAllResponders);
router.post("/", responderController.validateCreateResponder, responderController.createResponder);
router.get("/:id/locations", responderLocationController.getResponderLocations);
router.get("/:id", responderController.getResponderById);
router.put("/:id", responderController.validateUpdateResponder, responderController.updateResponder);
router.delete("/:id", responderController.deleteResponder);

export const responderRoutes = router;