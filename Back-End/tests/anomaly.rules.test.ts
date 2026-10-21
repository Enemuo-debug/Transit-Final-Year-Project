import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decide,
  haversineMeters,
  initialDeviceState,
  nearKnownStop,
  severityFor,
  DEFAULT_THRESHOLDS,
  type DeviceState,
  type StopGeo,
} from "../services/anomaly.rules.js";

const STOP_LAGOS: StopGeo = { latitude: 6.5244, longitude: 3.3792, radius_meters: 150 };

function stateAt(nowMs: number, overrides: Partial<DeviceState> = {}): DeviceState {
  return { ...initialDeviceState({ lat: 6.5, lng: 3.4, speed: 0 }, nowMs), ...overrides };
}

test("haversine: identical points are 0 m", () => {
  assert.equal(haversineMeters(6.5244, 3.3792, 6.5244, 3.3792), 0);
});

test("haversine: Lagos→Ibadan is roughly 100–120 km", () => {
  const d = haversineMeters(6.5244, 3.3792, 7.3775, 3.947);
  assert.ok(d > 100000 && d < 120000, `got ${d}`);
});

test("nearKnownStop: inside radius returns the stop", () => {
  assert.equal(nearKnownStop([STOP_LAGOS], 6.5245, 3.3793), STOP_LAGOS);
});

test("nearKnownStop: outside radius returns null", () => {
  assert.equal(nearKnownStop([STOP_LAGOS], 6.6, 3.5), null);
});

test("decide: normal travel on corridor raises nothing", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.5244, lng: 3.3792, speed: 50 },
    state: stateAt(now, { lastSpeed: 48, lastTimestamp: now - 3000 }),
    nowMs: now,
    stops: [STOP_LAGOS],
    distanceToRouteMeters: 50,
  });
  assert.equal(d.type, null);
});

test("decide: far off corridor is ROUTE_DEVIATION", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.9, lng: 6.0, speed: 50 },
    state: stateAt(now, { lastSpeed: 52, lastTimestamp: now - 3000 }),
    nowMs: now,
    stops: [],
    distanceToRouteMeters: 5000,
  });
  assert.equal(d.type, "ROUTE_DEVIATION");
});

test("decide: sharp deceleration is ACCIDENT (priority over deviation)", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.6, lng: 3.45, speed: 5 },
    state: stateAt(now, { lastSpeed: 60, lastTimestamp: now - 2000 }),
    nowMs: now,
    stops: [],
    distanceToRouteMeters: 0,
  });
  assert.equal(d.type, "ACCIDENT");
});

test("decide: no ACCIDENT when deceleration window is exceeded", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.6, lng: 3.45, speed: 5 },
    state: stateAt(now, { lastSpeed: 60, lastTimestamp: now - 60000 }),
    nowMs: now,
    stops: [],
    distanceToRouteMeters: 0,
  });
  assert.equal(d.type, null);
});

test("decide: first stationary sample sets stationarySince and raises nothing", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.6, lng: 3.5, speed: 0 },
    state: stateAt(now, { lastSpeed: 0, lastTimestamp: now }),
    nowMs: now,
    stops: [],
    distanceToRouteMeters: null,
  });
  assert.equal(d.type, null);
  assert.equal(d.next.stationarySince, now);
});

test("decide: stationary past threshold off-stop is UNANTICIPATED_STOP", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.6, lng: 3.5, speed: 0 },
    state: stateAt(now, { lastSpeed: 0, lastTimestamp: now, stationarySince: now - 200_000 }),
    nowMs: now,
    stops: [],
    distanceToRouteMeters: null,
  });
  assert.equal(d.type, "UNANTICIPATED_STOP");
});

test("decide: stationary past threshold INSIDE a stop geofence is fine", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.5244, lng: 3.3792, speed: 0 },
    state: stateAt(now, { lastSpeed: 0, lastTimestamp: now, stationarySince: now - 200_000 }),
    nowMs: now,
    stops: [STOP_LAGOS],
    distanceToRouteMeters: null,
  });
  assert.equal(d.type, null);
});

test("decide: moving again clears the stationary flag", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.5244, lng: 3.3792, speed: 40 },
    state: stateAt(now, { lastSpeed: 35, lastTimestamp: now - 3000, stationarySince: now - 5000 }),
    nowMs: now,
    stops: [STOP_LAGOS],
    distanceToRouteMeters: 20,
  });
  assert.equal(d.type, null);
  assert.equal(d.next.stationarySince, null);
});

test("decide: thresholds can be overridden", () => {
  const now = 1_000_000;
  const d = decide({
    sample: { lat: 6.9, lng: 6.0, speed: 50 },
    state: stateAt(now, { lastSpeed: 50, lastTimestamp: now - 3000 }),
    nowMs: now,
    stops: [],
    distanceToRouteMeters: 250,
    thresholds: { ...DEFAULT_THRESHOLDS, deviationMeters: 100 },
  });
  assert.equal(d.type, "ROUTE_DEVIATION");
});

test("severityFor maps types to severities", () => {
  assert.equal(severityFor("ACCIDENT"), "CRITICAL");
  assert.equal(severityFor("DRIVER_SOS"), "CRITICAL");
  assert.equal(severityFor("KIDNAPPING"), "CRITICAL");
  assert.equal(severityFor("ROUTE_DEVIATION"), "HIGH");
  assert.equal(severityFor("UNANTICIPATED_STOP"), "HIGH");
  assert.equal(severityFor("BREAKDOWN"), "HIGH");
});
