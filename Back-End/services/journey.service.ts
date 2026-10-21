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
  session_id?: number;
}

export interface EndJourneyInput {
  status: "COMPLETED" | "CANCELLED";
}

export interface JourneyView {
  id: number;
  company_id: number;
  bus_id: number;
  route_id: number;
  session_id: number | null;
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
    session_id: journey.session_id,
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

/** The journey currently assigned to a bus (scheduled or active), newest first. */
export async function getJourneyForBus(bus_id: number): Promise<JourneyView | null> {
  const rows = await db.orm.public.Journey.where({ bus_id }).all();
  const assigned = rows
    .filter((r) => r.deleted_at === null && (r.status === "SCHEDULED" || r.status === "ACTIVE"))
    .sort((a, b) => timeMs(b.created_at) - timeMs(a.created_at));
  const latest = assigned[0];
  return latest ? decorate(latest) : null;
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

  if (input.session_id !== undefined) {
    const session = await db.orm.public.DriverSession.where({ id: input.session_id }).first();
    if (!session || session.company_id !== input.company_id) {
      throw new Error("SESSION_NOT_FOUND");
    }
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
    ...(input.session_id !== undefined ? { session_id: input.session_id } : {}),
  });

  await db.orm.public.Bus.where({ id: input.bus_id }).update({ status: "ON_JOURNEY" });
  return decorate(journey);
}

/** Driver starts the assigned journey from the mobile/web driver console. */
export async function startJourneyByDriver(bus_id: number): Promise<JourneyView> {
  const rows = await db.orm.public.Journey.where({ bus_id }).all();
  const active = rows.find((r) => r.deleted_at === null && r.status === "ACTIVE");
  if (active) return decorate(active);

  const scheduled = rows
    .filter((r) => r.deleted_at === null && r.status === "SCHEDULED")
    .sort((a, b) => timeMs(a.created_at) - timeMs(b.created_at))[0];
  if (!scheduled) throw new Error("JOURNEY_NOT_FOUND");

  const updated = await db.orm.public.Journey.where({ id: scheduled.id }).update({
    status: "ACTIVE",
    started_at: Temporal.Now.instant(),
  });
  await db.orm.public.Bus.where({ id: bus_id }).update({ status: "ON_JOURNEY" });
  return decorate(updated ?? scheduled);
}

/** Driver ends the active journey; the bus returns to ACTIVE (available). */
export async function endJourneyByDriver(bus_id: number): Promise<JourneyView> {
  const rows = await db.orm.public.Journey.where({ bus_id }).all();
  const active = rows.find((r) => r.deleted_at === null && r.status === "ACTIVE");
  if (!active) throw new Error("JOURNEY_NOT_FOUND");

  const updated = await db.orm.public.Journey.where({ id: active.id }).update({
    status: "COMPLETED",
    ended_at: Temporal.Now.instant(),
  });
  await releaseBus(bus_id);
  return decorate(updated ?? active);
}

export async function endJourney(
  company_id: number,
  id: number,
  input: EndJourneyInput,
): Promise<JourneyView | null> {
  const existing = await db.orm.public.Journey.where({ id }).first();
  if (!existing || existing.company_id !== company_id || existing.deleted_at !== null) return null;

  const updated = await db.orm.public.Journey.where({ id }).update({
    status: input.status,
    ended_at: Temporal.Now.instant(),
  });
  if (!updated) return null;

  await releaseBus(existing.bus_id);
  return decorate(updated);
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
