import { db } from "../prisma/db.js";
import * as cache from "./cache.service.js";
import type { TelemetrySample } from "./telemetry.service.js";
import {
  distancePointToRouteMeters,
  listRouteStops,
  routeTrackWkt,
  type RouteStopGeo,
} from "./spatial.service.js";
import { createIncident, type IncidentView } from "./incident.service.js";
import {
  decide,
  initialDeviceState,
  severityFor,
  type AnomalyType,
  type DeviceState,
  type Thresholds,
} from "./anomaly.rules.js";

const THRESHOLDS: Thresholds = {
  deviationMeters: Number(process.env["ANOMALY_DEVIATION_METERS"] ?? 300),
  stopSeconds: Number(process.env["ANOMALY_STOP_SECONDS"] ?? 180),
  stopSpeedKmh: Number(process.env["ANOMALY_STOP_SPEED_KMH"] ?? 2),
  accidentDecelKmh: Number(process.env["ANOMALY_ACCIDENT_DECEL_KMH"] ?? 40),
  accidentWindowMs: Number(process.env["ANOMALY_ACCIDENT_WINDOW_MS"] ?? 10000),
};

const EVAL_INTERVAL_MS = Number(process.env["ANOMALY_EVAL_MS"] ?? 3000);
const ROUTE_CACHE_TTL = Number(process.env["ROUTE_CACHE_TTL_SECONDS"] ?? 300);

interface EngineState {
  lastEvalAt: number;
  rules: DeviceState;
}

const devices = new Map<string, EngineState>();

async function cachedRouteStops(routeId: number): Promise<RouteStopGeo[]> {
  const key = `transit:route:stops:${routeId}`;
  const cached = await cache.getJSON<RouteStopGeo[]>(key);
  if (cached) return cached;
  const stops = await listRouteStops(routeId);
  await cache.setJSON(key, stops, ROUTE_CACHE_TTL);
  return stops;
}

async function cachedRouteTrack(routeId: number): Promise<void> {
  const key = `transit:route:track:${routeId}`;
  const cached = await cache.getJSON<string>(key);
  if (cached !== null) return;
  const wkt = await routeTrackWkt(routeId);
  await cache.setJSON(key, wkt ?? "", ROUTE_CACHE_TTL);
}

/**
 * Evaluate a telemetry sample for anomalies and persist an incident when found.
 */
export async function evaluateSample(sample: TelemetrySample): Promise<IncidentView | null> {
  try {
    const now = Date.now();
    const state =
      devices.get(sample.deviceId) ??
      ({ lastEvalAt: 0, rules: initialDeviceState(sample, now) } satisfies EngineState);
    devices.set(sample.deviceId, state);

    // Throttle: still track speed/halt between evaluations.
    if (now - state.lastEvalAt < EVAL_INTERVAL_MS) {
      state.rules.lastSpeed = sample.speed;
      state.rules.lastTimestamp = now;
      return null;
    }
    state.lastEvalAt = now;

    const bus = await db.orm.public.Bus.where({ plate_number: sample.deviceId }).first();
    if (!bus) return null;

    const journey = await db.orm.public.Journey.where({ bus_id: bus.id, status: "ACTIVE" }).first();
    if (!journey) return null;

    const routeId = journey.route_id;
    await cachedRouteTrack(routeId);
    const stops = await cachedRouteStops(routeId);

    // Only needed when the vehicle is moving; cheap enough under the throttle.
    const distanceToRouteMeters =
      sample.speed > THRESHOLDS.stopSpeedKmh
        ? await distancePointToRouteMeters(routeId, sample.lat, sample.lng)
        : null;

    const decision = decide({
      sample: { lat: sample.lat, lng: sample.lng, speed: sample.speed },
      state: state.rules,
      nowMs: now,
      stops,
      distanceToRouteMeters,
      thresholds: THRESHOLDS,
    });
    state.rules = decision.next;

    if (!decision.type) return null;

    const result = await createIncident({
      company_id: bus.company_id,
      bus_id: bus.id,
      route_id: routeId,
      type: decision.type as AnomalyType,
      severity: severityFor(decision.type),
      latitude: sample.lat,
      longitude: sample.lng,
      ...(decision.description ? { description: decision.description } : {}),
      ...(journey.id ? { journey_id: journey.id } : {}),
    });
    return result.incident;
  } catch {
    return null;
  }
}

export function resetAnomalyState(deviceId?: string): void {
  if (deviceId) devices.delete(deviceId);
  else devices.clear();
}
