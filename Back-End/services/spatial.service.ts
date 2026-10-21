import "dotenv/config";
import postgres from "postgres";
import type { AgencyType } from "./responder.service.js";
import type { FindNearestInput, NearestResponderLocation } from "./responder-location.service.js";

export type { NearestResponderLocation } from "./responder-location.service.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL_MISSING");

const sql = postgres(connectionString, { max: 5, idle_timeout: 20 });

interface NearestRow {
  location_id: number;
  responder_id: number;
  branch_name: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
  created_at: Date;
  organization_name: string;
  email: string;
  agency_type: string;
  distance_m: number;
}

export async function findNearestResponderLocationsSpatial(
  input: FindNearestInput,
): Promise<NearestResponderLocation[]> {
  const rows = await sql<NearestRow[]>`
    SELECT location_id, responder_id, branch_name, latitude, longitude,
           is_active, created_at, organization_name, email, agency_type, distance_m
    FROM nearest_responders(
      ${input.latitude},
      ${input.longitude},
      ${input.agency_type ?? null},
      ${input.limit ?? 10}
    )
  `;

  return rows.map((row) => ({
    location: {
      id: row.location_id,
      responder_id: row.responder_id,
      branch_name: row.branch_name,
      latitude: row.latitude,
      longitude: row.longitude,
      is_active: row.is_active,
      created_at: row.created_at,
    },
    responder: {
      id: row.responder_id,
      name: row.organization_name,
      email: row.email,
      agency_type: row.agency_type as AgencyType,
    },
    distance_km: row.distance_m / 1000,
  }));
}

export interface RouteStopGeo {
  stop_id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  stop_order: number;
}

export async function listRouteStops(routeId: number): Promise<RouteStopGeo[]> {
  return sql<RouteStopGeo[]>`
    SELECT s.id AS stop_id, s.name, s.latitude, s.longitude, s.radius_meters, rs.stop_order
    FROM "routeStop" rs
    JOIN "stop" s ON s.id = rs.stop_id
    WHERE rs.route_id = ${routeId}
    ORDER BY rs.stop_order ASC
  `;
}

export async function routeTrackWkt(routeId: number): Promise<string | null> {
  const rows = await sql<{ wkt: string | null }[]>`
    SELECT ST_AsText(geom) AS wkt FROM "route" WHERE id = ${routeId} LIMIT 1
  `;
  return rows[0]?.wkt ?? null;
}

/**
 * Distance in metres from a point to the route's allowed corridor (LineString).
 * Returns null when the route has no geometry.
 */
export async function distancePointToRouteMeters(
  routeId: number,
  latitude: number,
  longitude: number,
): Promise<number | null> {
  const rows = await sql<{ distance_m: number | null }[]>`
    SELECT ST_Distance(
             r.geom::geography,
             ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
           ) AS distance_m
    FROM "route" r
    WHERE r.id = ${routeId} AND r.geom IS NOT NULL
    LIMIT 1
  `;
  const value = rows[0]?.distance_m;
  return value === undefined || value === null ? null : Number(value);
}

export interface StopProximity {
  stop_id: number;
  name: string;
  distance_m: number;
  radius_meters: number;
}

/**
 * Returns the nearest route stop whose geofence contains the point, else null.
 */
export async function stopContainingPoint(
  routeId: number,
  latitude: number,
  longitude: number,
): Promise<StopProximity | null> {
  const rows = await sql<StopProximity[]>`
    SELECT s.id AS stop_id, s.name,
           ST_Distance(s.geom::geography, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography) AS distance_m,
           s.radius_meters
    FROM "routeStop" rs
    JOIN "stop" s ON s.id = rs.stop_id
    WHERE rs.route_id = ${routeId}
      AND ST_DWithin(
            s.geom::geography,
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
            s.radius_meters
          )
    ORDER BY distance_m ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export interface SpatialHealth {
  postgisVersion: string | null;
}

export async function spatialHealth(): Promise<SpatialHealth> {
  const rows = await sql<{ postgis_version: string | null }[]>`
    SELECT postgis_full_version() AS postgis_version
  `;
  return { postgisVersion: rows[0]?.postgis_version ?? null };
}
