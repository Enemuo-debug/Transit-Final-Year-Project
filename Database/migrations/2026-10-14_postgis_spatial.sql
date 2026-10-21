-- TRANSIT — PostGIS spatial layer
-- Applied outside Prisma's contract-based migrations because the Prisma Next
-- contract has no geometry codec. Safe to re-run (idempotent).
--
-- Apply with:
--   docker exec -i fyp-postgres psql -U postgres -d fyp_db < Database/migrations/2026-10-14_postgis_spatial.sql

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Geometry columns (generated: always kept in sync with lat/lng or polyline)
-- ---------------------------------------------------------------------------
ALTER TABLE "stop"
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

ALTER TABLE "responderLocation"
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

ALTER TABLE "incident"
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

ALTER TABLE "telemetryPoint"
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

ALTER TABLE "route"
  ADD COLUMN IF NOT EXISTS geom geometry(LineString, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN polyline IS NULL OR length(polyline) = 0 THEN NULL
      ELSE ST_GeomFromText(polyline, 4326)
    END
  ) STORED;

-- ---------------------------------------------------------------------------
-- GiST spatial indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS stop_geom_gist ON "stop" USING GIST (geom);
CREATE INDEX IF NOT EXISTS responder_location_geom_gist ON "responderLocation" USING GIST (geom);
CREATE INDEX IF NOT EXISTS incident_geom_gist ON "incident" USING GIST (geom);
CREATE INDEX IF NOT EXISTS route_geom_gist ON "route" USING GIST (geom);
CREATE INDEX IF NOT EXISTS telemetry_point_geom_gist ON "telemetryPoint" USING GIST (geom);

-- ---------------------------------------------------------------------------
-- Nearest-responder query (PostGIS, uses the GiST index via <->)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS nearest_responders(double precision, double precision, text, integer);

CREATE FUNCTION nearest_responders(
  in_lat      double precision,
  in_lng      double precision,
  in_agency   text DEFAULT NULL,
  in_limit    int  DEFAULT 10
)
RETURNS TABLE (
  location_id       int,
  responder_id      int,
  branch_name       text,
  latitude          double precision,
  longitude         double precision,
  is_active         boolean,
  created_at        timestamptz,
  organization_name text,
  email             text,
  agency_type       text,
  distance_m        double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    l.id,
    l.responder_id,
    l.branch_name,
    l.latitude,
    l.longitude,
    l.is_active,
    l.created_at,
    r.name,
    r.email,
    r.agency_type,
    ST_Distance(
      l.geom::geography,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
    ) AS distance_m
  FROM "responderLocation" l
  JOIN "emergencyResponders" r ON r.id = l.responder_id
  WHERE l.is_active
    AND (in_agency IS NULL OR r.agency_type = in_agency)
  ORDER BY l.geom <-> ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)
  LIMIT in_limit;
$$;
