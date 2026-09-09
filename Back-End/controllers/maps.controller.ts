import type { Request, Response } from "express";
import { mapsService } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateQuery, type Schema } from "../middleware/validate.js";

export const geocodeQuerySchema: Schema = {
  address: { type: "string", required: true, minLength: 1, maxLength: 500 },
};

export const reverseGeocodeQuerySchema: Schema = {
  lat: { type: "number", required: true, min: -90, max: 90 },
  lng: { type: "number", required: true, min: -180, max: 180 },
};

export const staticMapQuerySchema: Schema = {
  lat: { type: "number", required: true, min: -90, max: 90 },
  lng: { type: "number", required: true, min: -180, max: 180 },
  zoom: { type: "integer", required: false, min: 0, max: 21 },
  width: { type: "integer", required: false, min: 1, max: 2048 },
  height: { type: "integer", required: false, min: 1, max: 2048 },
};

export const validateGeocodeQuery = validateQuery(geocodeQuerySchema);
export const validateReverseGeocodeQuery = validateQuery(reverseGeocodeQuerySchema);
export const validateStaticMapQuery = validateQuery(staticMapQuerySchema);

export async function getMapsConfig(_req: Request, res: Response) {
  return res.status(200).json({ configured: mapsService.mapsConfigured() });
}

export async function geocode(req: Request, res: Response) {
  const results = await mapsService.geocode(String(req.query["address"] ?? ""));
  return res.status(200).json({ results });
}

export async function reverseGeocode(req: Request, res: Response) {
  const lat = Number(req.query["lat"]);
  const lng = Number(req.query["lng"]);
  const results = await mapsService.reverseGeocode(lat, lng);
  return res.status(200).json({ results });
}

export async function staticMap(req: Request, res: Response) {
  const lat = Number(req.query["lat"]);
  const lng = Number(req.query["lng"]);
  const zoom = req.query["zoom"] !== undefined ? Number(req.query["zoom"]) : 15;
  const width = req.query["width"] !== undefined ? Number(req.query["width"]) : 640;
  const height = req.query["height"] !== undefined ? Number(req.query["height"]) : 360;

  const url = mapsService.buildStaticMapUrl({
    center: { lat, lng },
    zoom,
    width,
    height,
    markers: [{ lat, lng, color: "0xc22229" }],
  });
  return res.redirect(url);
}