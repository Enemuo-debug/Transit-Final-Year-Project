import type { Request, Response } from "express";
import { driverService, telemetryService, journeyService, routeService, BUS_STATUSES } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";
import type { DriverAuthUser } from "../middleware/auth.js";

export const driverLoginSchema: Schema = {
  session_code: { type: "string", required: true, minLength: 4, maxLength: 12 },
  plate_number: { type: "string", required: true, minLength: 1, maxLength: 20 },
  device_id: { type: "string", required: false, minLength: 4, maxLength: 120 },
};

export const positionSchema: Schema = {
  lat: { type: "number", required: true, min: -90, max: 90 },
  lng: { type: "number", required: true, min: -180, max: 180 },
  speed: { type: "number", required: false, min: 0 },
  heading: { type: "number", required: false, min: 0, max: 360 },
};

export const statusSchema: Schema = {
  status: { type: "string", required: true, oneOf: BUS_STATUSES as readonly string[] },
};

export const validateDriverLogin = validateBody(driverLoginSchema);
export const validatePosition = validateBody(positionSchema);
export const validateStatus = validateBody(statusSchema);

function requireDriver(req: Request): DriverAuthUser {
  const user = req.user;
  if (!user || user.role !== "DRIVER") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Driver access required." } });
  }
  return user;
}

export async function driverLogin(req: Request, res: Response) {
  const result = await driverService.driverLogin(req.body);
  return res.status(200).json(result);
}

export async function getMyBus(req: Request, res: Response) {
  const user = requireDriver(req);
  const bus = await driverService.getDriverBus(user);
  if (!bus) {
    throw httpError({ error: { code: "BUS_NOT_FOUND", message: "Bus not found." } });
  }
  return res.status(200).json(bus);
}

export async function getMyJourney(req: Request, res: Response) {
  const user = requireDriver(req);
  const journey = await journeyService.getJourneyForBus(user.busId);
  if (!journey) {
    return res.status(200).json({ journey: null, stops: [] });
  }
  const route = await routeService.getRouteById(user.companyId, journey.route_id);
  return res.status(200).json({ journey, stops: route?.stops ?? [] });
}

export async function startMyJourney(req: Request, res: Response) {
  const user = requireDriver(req);
  const journey = await journeyService.startJourneyByDriver(user.busId);
  return res.status(200).json(journey);
}

export async function endMyJourney(req: Request, res: Response) {
  const user = requireDriver(req);
  const journey = await journeyService.endJourneyByDriver(user.busId);
  return res.status(200).json(journey);
}

export async function submitPosition(req: Request, res: Response) {
  const user = requireDriver(req);
  const speed = typeof req.body.speed === "number" ? req.body.speed : 0;
  const heading = typeof req.body.heading === "number" ? req.body.heading : 0;
  const sample = telemetryService.recordPosition({
    deviceId: user.plate_number,
    lat: req.body.lat,
    lng: req.body.lng,
    speed,
    heading,
    timestamp: new Date().toISOString(),
    actor: `DRIVER:${user.sessionId}`,
  });
  return res.status(200).json({ ok: true, sample });
}

export async function updateStatus(req: Request, res: Response) {
  const user = requireDriver(req);
  const bus = await driverService.updateBusStatusFromDriver(user, req.body.status);
  if (!bus) {
    throw httpError({ error: { code: "BUS_NOT_FOUND", message: "Bus not found." } });
  }
  return res.status(200).json(bus);
}