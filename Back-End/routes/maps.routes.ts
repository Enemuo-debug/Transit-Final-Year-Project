import { Router } from "express";
import { mapsController } from "../controllers/index.js";

const router = Router();

router.get("/config", mapsController.getMapsConfig);
router.post("/resolve-link", mapsController.validateResolveLink, mapsController.resolveLink);
router.get("/geocode", mapsController.validateGeocodeQuery, mapsController.geocode);
router.get(
  "/reverse-geocode",
  mapsController.validateReverseGeocodeQuery,
  mapsController.reverseGeocode,
);
router.get("/static", mapsController.validateStaticMapQuery, mapsController.staticMap);

export const mapsRoutes = router;