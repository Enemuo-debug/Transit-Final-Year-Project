import * as cache from "./cache.service.js";
import {
  distancePointToRouteMeters,
  routeProgress,
} from "./spatial.service.js";

const CORRIDOR_METERS = Number(process.env["CORRIDOR_WIDTH_METERS"] ?? 300);
const PINGS_BEFORE_DEVIATION = Number(process.env["DEVIATION_CONSECUTIVE_PINGS"] ?? 3);
const BACKTRACK_STEP = Number(process.env["PROGRESS_BACKTRACK_THRESHOLD"] ?? 0.01);
const TRACK_TTL_SECONDS = 120;

interface TrackState {
  outside: number;
  backwards: number;
  lastProgress: number | null;
  reported: boolean;
}

export interface TrackingStatus {
  distance_m: number | null;
  progress: number | null;
  deviation: boolean;
  just_deviated: boolean;
  corridor_meters: number;
}

/**
 * Simple deviation rule:
 *   - outside the corridor for 3 consecutive pings, OR
 *   - progress goes backwards 3 times,
 * then `deviation` is true. `just_deviated` is true only on the first ping,
 * which is when the caller creates one ROUTE_DEVIATION incident.
 */
export async function evaluateTracking(
  plateNumber: string,
  journeyId: number,
  routeId: number,
  latitude: number,
  longitude: number,
): Promise<TrackingStatus> {
  const [distance, progress] = await Promise.all([
    distancePointToRouteMeters(routeId, latitude, longitude),
    routeProgress(routeId, latitude, longitude),
  ]);

  const key = `transit:track:${plateNumber}:${journeyId}`;
  const previous =
    (await cache.getJSON<TrackState>(key)) ?? {
      outside: 0,
      backwards: 0,
      lastProgress: null,
      reported: false,
    };

  const outside = distance !== null && distance > CORRIDOR_METERS;
  const outsideCount = outside ? previous.outside + 1 : 0;

  const movedBackwards =
    progress !== null &&
    previous.lastProgress !== null &&
    progress < previous.lastProgress - BACKTRACK_STEP;
  const backwardsCount = movedBackwards ? previous.backwards + 1 : 0;

  const deviation =
    outsideCount >= PINGS_BEFORE_DEVIATION ||
    backwardsCount >= PINGS_BEFORE_DEVIATION;
  const justDeviated = deviation && !previous.reported;

  await cache.setJSON(
    key,
    {
      outside: outsideCount,
      backwards: backwardsCount,
      lastProgress: progress ?? previous.lastProgress,
      reported: deviation,
    } satisfies TrackState,
    TRACK_TTL_SECONDS,
  );

  return {
    distance_m: distance,
    progress,
    deviation,
    just_deviated: justDeviated,
    corridor_meters: CORRIDOR_METERS,
  };
}
