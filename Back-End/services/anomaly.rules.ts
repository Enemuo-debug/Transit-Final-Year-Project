// Pure, dependency-free anomaly rules (no DB / network), so they are unit-testable.

export type AnomalyType = "UNANTICIPATED_STOP" | "ROUTE_DEVIATION" | "ACCIDENT";
export type AnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface StopGeo {
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface SampleInput {
  lat: number;
  lng: number;
  speed: number;
}

export interface DeviceState {
  lastSpeed: number;
  lastTimestamp: number;
  stationarySince: number | null;
  stationaryLat: number | null;
  stationaryLng: number | null;
}

export interface Thresholds {
  deviationMeters: number;
  stopSeconds: number;
  stopSpeedKmh: number;
  accidentDecelKmh: number;
  accidentWindowMs: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  deviationMeters: 300,
  stopSeconds: 180,
  stopSpeedKmh: 2,
  accidentDecelKmh: 40,
  accidentWindowMs: 10000,
};

export function initialDeviceState(sample: SampleInput, nowMs: number): DeviceState {
  return {
    lastSpeed: sample.speed,
    lastTimestamp: nowMs,
    stationarySince: null,
    stationaryLat: null,
    stationaryLng: null,
  };
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearKnownStop(
  stops: StopGeo[],
  latitude: number,
  longitude: number,
): StopGeo | null {
  for (const stop of stops) {
    if (haversineMeters(latitude, longitude, stop.latitude, stop.longitude) <= stop.radius_meters) {
      return stop;
    }
  }
  return null;
}

export function severityFor(type: AnomalyType | "KIDNAPPING" | "DRIVER_SOS" | "BREAKDOWN"): AnomalySeverity {
  switch (type) {
    case "ACCIDENT":
    case "KIDNAPPING":
    case "DRIVER_SOS":
      return "CRITICAL";
    case "ROUTE_DEVIATION":
    case "BREAKDOWN":
    case "UNANTICIPATED_STOP":
      return "HIGH";
    default:
      return "MEDIUM";
  }
}

export interface DecideInput {
  sample: SampleInput;
  state: DeviceState;
  nowMs: number;
  stops: StopGeo[];
  distanceToRouteMeters: number | null;
  thresholds?: Partial<Thresholds>;
}

export interface Decision {
  type: AnomalyType | null;
  description: string | null;
  next: DeviceState;
}

export function decide(input: DecideInput): Decision {
  const t: Thresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const { sample, state, nowMs, stops } = input;
  const next: DeviceState = { ...state };
  const dt = nowMs - state.lastTimestamp;
  const stopped = sample.speed <= t.stopSpeedKmh;

  let type: AnomalyType | null = null;
  let description: string | null = null;

  if (stopped) {
    if (next.stationarySince === null) {
      next.stationarySince = nowMs;
      next.stationaryLat = sample.lat;
      next.stationaryLng = sample.lng;
    }
    const stationarySeconds = (nowMs - (next.stationarySince ?? nowMs)) / 1000;
    if (stationarySeconds >= t.stopSeconds) {
      const stop = nearKnownStop(stops, sample.lat, sample.lng);
      if (!stop) {
        type = "UNANTICIPATED_STOP";
        description = `Vehicle stationary for ${Math.round(stationarySeconds)}s at ${sample.lat.toFixed(
          5,
        )}, ${sample.lng.toFixed(5)} outside any designated stop.`;
        next.stationarySince = nowMs;
      }
    }
  } else {
    next.stationarySince = null;
    next.stationaryLat = null;
    next.stationaryLng = null;

    if (state.lastSpeed - sample.speed >= t.accidentDecelKmh && dt <= t.accidentWindowMs) {
      type = "ACCIDENT";
      description = `Sharp deceleration ${state.lastSpeed.toFixed(1)} -> ${sample.speed.toFixed(1)} km/h in ${Math.round(
        dt / 1000,
      )}s.`;
    } else if (
      input.distanceToRouteMeters !== null &&
      input.distanceToRouteMeters > t.deviationMeters
    ) {
      type = "ROUTE_DEVIATION";
      description = `Vehicle is ${Math.round(
        input.distanceToRouteMeters,
      )}m off the assigned route corridor (limit ${t.deviationMeters}m).`;
    }
  }

  next.lastSpeed = sample.speed;
  next.lastTimestamp = nowMs;
  return { type, description, next };
}
