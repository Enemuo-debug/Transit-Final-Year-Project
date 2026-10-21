import type { Request, Response } from "express";
import { routeService } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";
import type { CompanyAuthUser } from "../middleware/auth.js";

export const createRouteSchema: Schema = {
  route_code: { type: "string", required: true, minLength: 1, maxLength: 20 },
  name: { type: "string", required: true, minLength: 1, maxLength: 150 },
  polyline: { type: "string", required: false, minLength: 1, maxLength: 100000 },
  is_active: { type: "boolean", required: false },
};

export const updateRouteSchema: Schema = {
  route_code: { type: "string", required: false, minLength: 1, maxLength: 20 },
  name: { type: "string", required: false, minLength: 1, maxLength: 150 },
  polyline: { type: "string", required: false, minLength: 1, maxLength: 100000 },
  is_active: { type: "boolean", required: false },
};

export const validateCreateRoute = validateBody(createRouteSchema);
export const validateUpdateRoute = validateBody(updateRouteSchema);

interface ParsedStop {
  name: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
}

export function parseStops(raw: unknown): ParsedStop[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw httpError({ error: { code: "VALIDATION_FAILED", message: "stops must be an array." } });
  }
  return raw.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw httpError({ error: { code: "VALIDATION_FAILED", message: "Invalid stop entry." } });
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record["name"] === "string" ? record["name"].trim() : "";
    const latitude = Number(record["latitude"]);
    const longitude = Number(record["longitude"]);
    if (name.length === 0) {
      throw httpError({ error: { code: "VALIDATION_FAILED", message: "Each stop needs a name." } });
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw httpError({ error: { code: "VALIDATION_FAILED", message: "Invalid stop latitude." } });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw httpError({ error: { code: "VALIDATION_FAILED", message: "Invalid stop longitude." } });
    }
    const radiusRaw = record["radius_meters"];
    const radius =
      radiusRaw === undefined ? undefined : Math.trunc(Number(radiusRaw));
    if (radius !== undefined && (!Number.isFinite(radius) || radius <= 0)) {
      throw httpError({ error: { code: "VALIDATION_FAILED", message: "Invalid stop radius." } });
    }
    return {
      name,
      latitude,
      longitude,
      ...(radius !== undefined ? { radius_meters: radius } : {}),
    };
  });
}

function requireCompany(req: Request): CompanyAuthUser {
  const user = req.user;
  if (!user || user.role !== "COMPANY") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Company access required." } });
  }
  return user;
}

export function parseRouteId(req: Request): number {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid route id." } });
  }
  return id;
}

export async function listRoutes(req: Request, res: Response) {
  const user = req.user;
  const company_id = user && user.role === "COMPANY" ? user.id : undefined;
  const routes = await routeService.listRoutes(company_id);
  return res.status(200).json(routes);
}

export async function getRouteById(req: Request, res: Response) {
  const company = requireCompany(req);
  const route = await routeService.getRouteById(company.id, parseRouteId(req));
  if (!route) throw httpError({ error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } });
  return res.status(200).json(route);
}

export async function createRoute(req: Request, res: Response) {
  const company = requireCompany(req);
  const stops = parseStops(req.body.stops);
  const route = await routeService.createRoute({
    company_id: company.id,
    route_code: req.body.route_code,
    name: req.body.name,
    ...(req.body.polyline !== undefined ? { polyline: req.body.polyline } : {}),
    ...(req.body.is_active !== undefined ? { is_active: req.body.is_active } : {}),
    stops,
  });
  return res.status(201).json(route);
}

export async function updateRoute(req: Request, res: Response) {
  const company = requireCompany(req);
  const stops = req.body.stops !== undefined ? parseStops(req.body.stops) : undefined;
  const route = await routeService.updateRoute(company.id, parseRouteId(req), {
    ...(req.body.route_code !== undefined ? { route_code: req.body.route_code } : {}),
    ...(req.body.name !== undefined ? { name: req.body.name } : {}),
    ...(req.body.polyline !== undefined ? { polyline: req.body.polyline } : {}),
    ...(req.body.is_active !== undefined ? { is_active: req.body.is_active } : {}),
    ...(stops !== undefined ? { stops } : {}),
  });
  if (!route) throw httpError({ error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } });
  return res.status(200).json(route);
}

export async function deleteRoute(req: Request, res: Response) {
  const company = requireCompany(req);
  const deleted = await routeService.deleteRoute(company.id, parseRouteId(req));
  if (!deleted) throw httpError({ error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } });
  return res.status(204).send();
}
