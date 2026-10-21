import type { Request, Response } from "express";
import { incidentService, journeyService, INCIDENT_TYPES, INCIDENT_STATUSES } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, validateQuery, type Schema } from "../middleware/validate.js";
import type { CompanyAuthUser, DriverAuthUser } from "../middleware/auth.js";

export const sosSchema: Schema = {
  latitude: { type: "number", required: true, min: -90, max: 90 },
  longitude: { type: "number", required: true, min: -180, max: 180 },
  description: { type: "string", required: false, maxLength: 500 },
};

export const updateStatusSchema: Schema = {
  status: { type: "string", required: true, oneOf: INCIDENT_STATUSES as readonly string[] },
};

export const listIncidentsQuerySchema: Schema = {
  status: { type: "string", required: false, oneOf: INCIDENT_STATUSES as readonly string[] },
  type: { type: "string", required: false, oneOf: INCIDENT_TYPES as readonly string[] },
  bus_id: { type: "integer", required: false, min: 1 },
  limit: { type: "integer", required: false, min: 1, max: 200 },
};

export const validateSos = validateBody(sosSchema);
export const validateUpdateStatus = validateBody(updateStatusSchema);
export const validateListIncidents = validateQuery(listIncidentsQuerySchema);

function requireCompany(req: Request): CompanyAuthUser {
  const user = req.user;
  if (!user || user.role !== "COMPANY") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Company access required." } });
  }
  return user;
}

function requireDriver(req: Request): DriverAuthUser {
  const user = req.user;
  if (!user || user.role !== "DRIVER") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Driver access required." } });
  }
  return user;
}

function parseIncidentId(req: Request): number {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid incident id." } });
  }
  return id;
}

export async function listIncidents(req: Request, res: Response) {
  const company = requireCompany(req);
  const query = req.query as Record<string, string>;
  const incidents = await incidentService.listIncidents(company.id, {
    ...(query["status"] ? { status: query["status"] as never } : {}),
    ...(query["type"] ? { type: query["type"] as never } : {}),
    ...(query["bus_id"] ? { bus_id: Number(query["bus_id"]) } : {}),
    ...(query["limit"] ? { limit: Number(query["limit"]) } : {}),
  });
  return res.status(200).json(incidents);
}

export async function getIncidentById(req: Request, res: Response) {
  const company = requireCompany(req);
  const incident = await incidentService.getIncidentById(company.id, parseIncidentId(req));
  if (!incident) {
    throw httpError({ error: { code: "INCIDENT_NOT_FOUND", message: "Incident not found." } });
  }
  return res.status(200).json(incident);
}

export async function updateIncidentStatus(req: Request, res: Response) {
  const company = requireCompany(req);
  const incident = await incidentService.updateIncidentStatus(
    company.id,
    parseIncidentId(req),
    req.body.status,
  );
  if (!incident) {
    throw httpError({ error: { code: "INCIDENT_NOT_FOUND", message: "Incident not found." } });
  }
  return res.status(200).json(incident);
}

export async function raiseSos(req: Request, res: Response) {
  const driver = requireDriver(req);
  const journey = await journeyService.getActiveJourneyForBus(driver.busId);
  const result = await incidentService.createIncident({
    company_id: driver.companyId,
    bus_id: driver.busId,
    type: "DRIVER_SOS",
    severity: "CRITICAL",
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    description: req.body.description ?? `Emergency SOS from driver of ${driver.plate_number}.`,
    ...(journey ? { route_id: journey.route_id } : {}),
    ...(journey ? { journey_id: journey.id } : {}),
  });
  return res.status(201).json({ ...result.incident, deduplicated: !result.created });
}
