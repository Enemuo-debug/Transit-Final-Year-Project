import type { Request, Response } from "express";
import {
  driverService,
  journeyService,
  telemetryService,
  trackingService,
  incidentService,
  companyService,
  mailerService,
} from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";
import type { DriverAuthUser } from "../middleware/auth.js";

export const driverLoginSchema: Schema = {
  session_code: { type: "string", required: true, minLength: 4, maxLength: 12 },
  plate_number: { type: "string", required: true, minLength: 1, maxLength: 20 },
  device_id: { type: "string", required: false, minLength: 4, maxLength: 120 },
};

export const validateDriverLogin = validateBody(driverLoginSchema);

export const positionSchema: Schema = {
  lat: { type: "number", required: true, min: -90, max: 90 },
  lng: { type: "number", required: true, min: -180, max: 180 },
  accuracy: { type: "number", required: false, min: 0 },
};

export const validatePosition = validateBody(positionSchema);

export async function driverLogin(req: Request, res: Response) {
  const result = await driverService.driverLogin(req.body);
  return res.status(200).json(result);
}

function requireDriver(req: Request): DriverAuthUser {
  const user = req.user;
  if (!user || user.role !== "DRIVER") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Driver access required." } });
  }
  return user;
}

export async function getMyJourney(req: Request, res: Response) {
  const user = requireDriver(req);
  const journey = await journeyService.getJourneyForBus(user.busId);
  return res.status(200).json({ journey });
}

export async function startMyJourney(req: Request, res: Response) {
  const user = requireDriver(req);
  const journey = await journeyService.startJourney(user.busId);
  return res.status(200).json(journey);
}

export async function submitPosition(req: Request, res: Response) {
  const user = requireDriver(req);

  const active = await journeyService.getActiveJourneyForBus(user.busId);
  if (!active) throw new Error("NO_ACTIVE_JOURNEY");

  const allowed = await telemetryService.claimStream(
    user.plate_number,
    user.sessionId,
    user.deviceId ?? "unknown",
  );
  if (!allowed) throw new Error("STREAM_CONFLICT");

  const position = await telemetryService.recordPosition({
    deviceId: user.plate_number,
    lat: req.body.lat,
    lng: req.body.lng,
    ...(typeof req.body.accuracy === "number" ? { accuracy: req.body.accuracy } : {}),
  });

  const tracking = await trackingService.evaluateTracking(
    user.plate_number,
    active.id,
    active.route_id,
    req.body.lat,
    req.body.lng,
  );

  // Record one ROUTE_DEVIATION incident per deviation episode. No dispatch yet.
  let incidentId: number | null = null;
  if (tracking.just_deviated) {
    const result = await incidentService.createIncident(
      {
        company_id: user.companyId,
        bus_id: user.busId,
        route_id: active.route_id,
        journey_id: active.id,
        type: "ROUTE_DEVIATION",
        severity: "HIGH",
        latitude: req.body.lat,
        longitude: req.body.lng,
        description:
          tracking.distance_m !== null &&
          tracking.distance_m > tracking.corridor_meters
            ? `Vehicle is ${Math.round(tracking.distance_m)}m off the ${Math.round(
                tracking.corridor_meters,
              )}m route corridor.`
            : "Vehicle is moving backwards along the assigned route.",
      },
      { dispatch: false },
    );
    incidentId = result.incident.id;
  }

  const journey = await journeyService.completeAtDestination(
    user.busId,
    req.body.lat,
    req.body.lng,
  );

  if (journey?.status === "COMPLETED") {
    const completed = journey;
    void (async () => {
      const company = await companyService.getCompanyById(user.companyId);
      if (!company) return;
      const sent = await mailerService.sendJourneyCompletedEmail({
        recipients: [company.email],
        companyName: company.company_name,
        plateNumber: completed.plate_number ?? user.plate_number,
        routeCode: completed.route_code,
        routeName: completed.route_name,
        journeyId: completed.id,
        completedAt: new Date(),
      });
      if (sent) {
        console.log(`[mailer] journey #${completed.id} completion email sent`);
      }
    })().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[mailer] journey completion email failed: ${message}`);
    });
  }

  return res.status(200).json({
    ok: true,
    position,
    journey,
    tracking,
    incident_id: incidentId,
  });
}
