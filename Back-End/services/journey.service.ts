import { Temporal } from "temporal-polyfill";
import { db } from "../prisma/db.js";
import { archiveRecord } from "./archive.service.js";

const JOURNEY_STATUSES = ["SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export { JOURNEY_STATUSES };
export type { JourneyStatus };

export interface CreateJourneyInput {
  company_id: number;
  bus_id: number;
  route_id: number;
}

export interface JourneyView {
  id: number;
  company_id: number;
  bus_id: number;
  route_id: number;
  status: JourneyStatus;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
  plate_number: string | null;
  route_code: string | null;
  route_name: string | null;
}

type JourneyRow = {
  id: number;
  company_id: number;
  bus_id: number;
  route_id: number;
  session_id: number | null;
  status: JourneyStatus;
  started_at: Date | null;
  ended_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
};

function timeMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { epochMilliseconds?: unknown }).epochMilliseconds === "number") {
    return (value as { epochMilliseconds: number }).epochMilliseconds;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function decorate(journey: JourneyRow): Promise<JourneyView> {
  const bus = await db.orm.public.Bus.where({ id: journey.bus_id }).first();
  const route = await db.orm.public.Route.where({ id: journey.route_id }).first();
  return {
    id: journey.id,
    company_id: journey.company_id,
    bus_id: journey.bus_id,
    route_id: journey.route_id,
    status: journey.status,
    started_at: journey.started_at,
    ended_at: journey.ended_at,
    created_at: journey.created_at,
    plate_number: bus?.plate_number ?? null,
    route_code: route?.route_code ?? null,
    route_name: route?.name ?? null,
  };
}

async function releaseBus(bus_id: number): Promise<void> {
  const bus = await db.orm.public.Bus.where({ id: bus_id }).first();
  if (bus && bus.deleted_at === null) {
    await db.orm.public.Bus.where({ id: bus_id }).update({ status: "ACTIVE" });
  }
}

export async function listJourneys(
  company_id?: number,
  status?: JourneyStatus,
): Promise<JourneyView[]> {
  const base =
    company_id !== undefined
      ? await db.orm.public.Journey.where({ company_id }).all()
      : await db.orm.public.Journey.all();
  const visible = base.filter((row) => row.deleted_at === null);
  const filtered = status !== undefined ? visible.filter((row) => row.status === status) : visible;
  const sorted = filtered.sort((a, b) => timeMs(b.created_at) - timeMs(a.created_at));
  return Promise.all(sorted.map((row) => decorate(row)));
}

export async function getJourneyById(
  company_id: number,
  id: number,
): Promise<JourneyView | null> {
  const journey = await db.orm.public.Journey.where({ id }).first();
  if (!journey || journey.company_id !== company_id || journey.deleted_at !== null) return null;
  return decorate(journey);
}

export async function getActiveJourneyForBus(bus_id: number): Promise<JourneyView | null> {
  const journey = await db.orm.public.Journey.where({ bus_id, status: "ACTIVE" }).first();
  if (!journey || journey.deleted_at !== null) return null;
  return decorate(journey);
}

/**
 * The journey the driver should see: the newest SCHEDULED/ACTIVE journey,
 * otherwise the newest completed one (so the driver sees the auto-complete).
 */
export async function getJourneyForBus(bus_id: number): Promise<JourneyView | null> {
  const rows = (await db.orm.public.Journey.where({ bus_id }).all())
    .filter((row) => row.deleted_at === null)
    .sort((a, b) => timeMs(b.created_at) - timeMs(a.created_at));

  const current =
    rows.find((row) => row.status === "SCHEDULED" || row.status === "ACTIVE") ?? rows[0];
  return current ? decorate(current) : null;
}

/**
 * Organization assigns a bus to a route. The journey is created as SCHEDULED;
 * the driver starts it from their device. The bus is locked as ON_JOURNEY.
 */
export async function createJourney(input: CreateJourneyInput): Promise<JourneyView> {
  const company = await db.orm.public.Company.where({ id: input.company_id }).first();
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  const bus = await db.orm.public.Bus.where({ id: input.bus_id }).first();
  if (!bus || bus.company_id !== input.company_id || bus.deleted_at !== null) {
    throw new Error("BUS_NOT_FOUND");
  }
  if (bus.status === "MAINTENANCE") throw new Error("BUS_IN_MAINTENANCE");

  const route = await db.orm.public.Route.where({ id: input.route_id }).first();
  if (!route || route.company_id !== input.company_id || route.deleted_at !== null) {
    throw new Error("ROUTE_NOT_FOUND");
  }

  const existing = await db.orm.public.Journey.where({ bus_id: input.bus_id }).all();
  const assigned = existing.find(
    (r) => r.deleted_at === null && (r.status === "SCHEDULED" || r.status === "ACTIVE"),
  );
  if (assigned) throw new Error("BUS_ALREADY_ASSIGNED");

  const journey = await db.orm.public.Journey.create({
    company_id: input.company_id,
    bus_id: input.bus_id,
    route_id: input.route_id,
    status: "SCHEDULED",
  });

  await db.orm.public.Bus.where({ id: input.bus_id }).update({ status: "ON_JOURNEY" });
  return decorate(journey);
}

/** Driver starts the SCHEDULED journey assigned to their bus. */
export async function startJourney(bus_id: number): Promise<JourneyView> {
  const rows = await db.orm.public.Journey.where({ bus_id }).all();
  const active = rows.find((row) => row.deleted_at === null && row.status === "ACTIVE");
  if (active) return decorate(active);

  const scheduled = rows
    .filter((row) => row.deleted_at === null && row.status === "SCHEDULED")
    .sort((a, b) => timeMs(a.created_at) - timeMs(b.created_at))[0];
  if (!scheduled) throw new Error("JOURNEY_NOT_FOUND");

  const updated = await db.orm.public.Journey.where({ id: scheduled.id }).update({
    status: "ACTIVE",
    started_at: Temporal.Now.instant(),
  });
  return decorate(updated ?? scheduled);
}

/** Organization marks an ACTIVE journey as COMPLETED. */
export async function completeJourney(
  company_id: number,
  id: number,
): Promise<JourneyView | null> {
  const existing = await db.orm.public.Journey.where({ id }).first();
  if (!existing || existing.company_id !== company_id || existing.deleted_at !== null) return null;
  if (existing.status !== "ACTIVE") throw new Error("JOURNEY_NOT_ACTIVE");

  const updated = await db.orm.public.Journey.where({ id }).update({
    status: "COMPLETED",
    ended_at: Temporal.Now.instant(),
  });
  if (!updated) return null;

  await releaseBus(existing.bus_id);
  return decorate(updated);
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

/**
 * If the bus is inside the destination stop's radius, complete the journey.
 * Destination = the stop with the highest stop_order on the journey's route.
 */
export async function completeAtDestination(
  bus_id: number,
  lat: number,
  lng: number,
): Promise<JourneyView | null> {
  const journey = await getActiveJourneyForBus(bus_id);
  if (!journey) return null;

  const links = await db.orm.public.RouteStop.where({ route_id: journey.route_id }).all();
  if (links.length === 0) return null;

  const last = links.reduce((a, b) => (b.stop_order > a.stop_order ? b : a));
  const stop = await db.orm.public.Stop.where({ id: last.stop_id }).first();
  if (!stop) return null;

  if (distanceMeters(lat, lng, stop.latitude, stop.longitude) > stop.radius_meters) {
    return null;
  }

  try {
    return await completeJourney(journey.company_id, journey.id);
  } catch {
    // A concurrent request may already have completed it.
    return null;
  }
}

/**
 * Hard delete + audit archive. The live tables stay clean (no orphaned/stale
 * rows); a full snapshot is written to `archivedRecord` for intelligence review.
 */
export async function deleteJourney(
  company_id: number,
  id: number,
  deletedBy = "COMPANY",
): Promise<boolean> {
  const existing = await db.orm.public.Journey.where({ id }).first();
  if (!existing || existing.company_id !== company_id || existing.deleted_at !== null) return false;
  if (existing.status !== "COMPLETED") throw new Error("JOURNEY_NOT_COMPLETED");

  const view = await decorate(existing);
  await archiveRecord({
    entity_type: "JOURNEY",
    entity_id: existing.id,
    company_id: existing.company_id,
    snapshot: { journey: view, raw: existing },
    deleted_by: deletedBy,
  });

  await db.orm.public.Journey.where({ id }).delete();
  await releaseBus(existing.bus_id);
  return true;
}
