import type { Request, Response } from "express";
import { responderLocationService, AGENCY_TYPES } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, validateQuery, type Schema } from "../middleware/validate.js";

export const createResponderLocationSchema: Schema = {
  branch_name: { type: "string", required: true, minLength: 1, maxLength: 120 },
  latitude: { type: "number", required: true, min: -90, max: 90 },
  longitude: { type: "number", required: true, min: -180, max: 180 },
  is_active: { type: "boolean", required: false },
};

export const updateResponderLocationSchema: Schema = {
  branch_name: { type: "string", required: false, minLength: 1, maxLength: 120 },
  latitude: { type: "number", required: false, min: -90, max: 90 },
  longitude: { type: "number", required: false, min: -180, max: 180 },
  is_active: { type: "boolean", required: false },
};

export const nearestQuerySchema: Schema = {
  latitude: { type: "number", required: true, min: -90, max: 90 },
  longitude: { type: "number", required: true, min: -180, max: 180 },
  agency_type: { type: "string", required: false, oneOf: AGENCY_TYPES as readonly string[] },
  limit: { type: "integer", required: false, min: 1, max: 50 },
};

export const validateCreateResponderLocation = validateBody(createResponderLocationSchema);
export const validateUpdateResponderLocation = validateBody(updateResponderLocationSchema);
export const validateNearestQuery = validateQuery(nearestQuerySchema);

function requireSelfResponder(req: Request): { id: number } {
  const user = req.user;
  if (!user || user.role !== "RESPONDER") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Responder access required." } });
  }
  return { id: user.id };
}

function parseLocationId(req: Request): number {
  const id = Number(req.params["locationId"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid location id." } });
  }
  return id;
}

export async function getMyLocations(req: Request, res: Response) {
  const responder = requireSelfResponder(req);
  const locations = await responderLocationService.getLocationsByResponder(responder.id);
  return res.status(200).json(locations);
}

export async function createMyLocation(req: Request, res: Response) {
  const responder = requireSelfResponder(req);
  const location = await responderLocationService.createResponderLocation({
    responder_id: responder.id,
    ...req.body,
  });
  return res.status(201).json(location);
}

export async function updateMyLocation(req: Request, res: Response) {
  const responder = requireSelfResponder(req);
  const location = await responderLocationService.updateResponderLocation(
    responder.id,
    parseLocationId(req),
    req.body,
  );
  if (!location) {
    throw httpError({ error: { code: "LOCATION_NOT_FOUND", message: "Responder location not found." } });
  }
  return res.status(200).json(location);
}

export async function deleteMyLocation(req: Request, res: Response) {
  const responder = requireSelfResponder(req);
  const deleted = await responderLocationService.deleteResponderLocation(
    responder.id,
    parseLocationId(req),
  );
  if (!deleted) {
    throw httpError({ error: { code: "LOCATION_NOT_FOUND", message: "Responder location not found." } });
  }
  return res.status(204).send();
}

export async function getResponderLocations(req: Request, res: Response) {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid responder id." } });
  }
  const locations = await responderLocationService.getLocationsByResponder(id);
  return res.status(200).json(locations);
}

export async function findNearestResponderLocations(req: Request, res: Response) {
  const query = req.query as Record<string, string>;
  const input: {
    latitude: number;
    longitude: number;
    agency_type?: (typeof AGENCY_TYPES)[number];
    limit?: number;
  } = {
    latitude: Number(query["latitude"]),
    longitude: Number(query["longitude"]),
  };
  if (query["agency_type"] !== undefined) {
    input.agency_type = query["agency_type"] as (typeof AGENCY_TYPES)[number];
  }
  if (query["limit"] !== undefined) {
    input.limit = Number(query["limit"]);
  }
  const ranked = await responderLocationService.findNearestResponderLocations(input);
  return res.status(200).json(ranked);
}