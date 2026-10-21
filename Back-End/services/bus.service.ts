import { db } from "../prisma/db.js";
import { archiveRecord } from "./archive.service.js";

const BUS_STATUSES = ["ACTIVE", "ON_JOURNEY", "MAINTENANCE", "OFFLINE"] as const;
type BusStatus = (typeof BUS_STATUSES)[number];

export { BUS_STATUSES };
export type { BusStatus };

export interface CreateBusInput {
  company_id: number;
  plate_number: string;
  capacity: number;
  status?: BusStatus;
}

export interface UpdateBusInput {
  company_id?: number;
  plate_number?: string;
  capacity?: number;
  status?: BusStatus;
}

export async function getAllBuses(company_id?: number) {
  const query = db.orm.public.Bus.include("company", (c) => c.select("id", "email", "company_name"));
  const rows = company_id !== undefined ? await query.where({ company_id }).all() : await query.all();
  return rows.filter((row) => row.deleted_at === null);
}

export async function getBusById(id: number) {
  const bus = await db.orm.public.Bus
    .include("company", (c) => c.select("id", "email", "company_name"))
    .where({ id })
    .first();
  if (!bus || bus.deleted_at !== null) return null;
  return bus;
}

export async function createBus(input: CreateBusInput) {
  const company = await db.orm.public.Company.where({ id: input.company_id }).first();
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  const plate_number = input.plate_number.trim();
  const existing = await db.orm.public.Bus.where({ plate_number }).first();
  if (existing) throw new Error("PLATE_IN_USE");

  return db.orm.public.Bus.create({
    company_id: input.company_id,
    plate_number,
    capacity: input.capacity,
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
}

export async function updateBus(id: number, input: UpdateBusInput) {
  const existing = await db.orm.public.Bus.where({ id }).first();
  if (!existing || existing.deleted_at !== null) return null;

  if (input.company_id !== undefined) {
    const company = await db.orm.public.Company.where({ id: input.company_id }).first();
    if (!company) throw new Error("COMPANY_NOT_FOUND");
  }

  const data: Record<string, unknown> = {};
  if (input.company_id !== undefined) data.company_id = input.company_id;
  if (input.plate_number !== undefined && input.plate_number.trim().length > 0) {
    const plate_number = input.plate_number.trim();
    if (plate_number !== existing.plate_number) {
      const clash = await db.orm.public.Bus.where({ plate_number }).first();
      if (clash) throw new Error("PLATE_IN_USE");
    }
    data.plate_number = plate_number;
  }
  if (input.capacity !== undefined) data.capacity = input.capacity;
  if (input.status !== undefined) data.status = input.status;

  if (Object.keys(data).length === 0) return existing;

  return db.orm.public.Bus.where({ id }).update(data);
}

/**
 * Hard delete + archive. Blocked while the bus has journeys (delete/archive
 * those first) or incidents (incidents are permanent evidence). Sessions are
 * removed and the plate becomes reusable.
 */
export async function deleteBus(id: number, deletedBy = "COMPANY") {
  const existing = await db.orm.public.Bus.where({ id }).first();
  if (!existing || existing.deleted_at !== null) return false;

  const journeys = await db.orm.public.Journey.where({ bus_id: id }).all();
  if (journeys.some((j) => j.deleted_at === null)) throw new Error("BUS_IN_USE");

  const incidents = await db.orm.public.Incident.where({ bus_id: id }).all();
  if (incidents.length > 0) throw new Error("BUS_HAS_INCIDENTS");

  const sessions = await db.orm.public.DriverSession.where({
    plate_number: existing.plate_number,
  }).all();

  await archiveRecord({
    entity_type: "BUS",
    entity_id: id,
    company_id: existing.company_id,
    snapshot: { bus: existing, sessions },
    deleted_by: deletedBy,
  });

  for (const session of sessions) {
    await db.orm.public.DriverSession.where({ id: session.id }).delete();
  }
  await db.orm.public.Bus.where({ id }).delete();
  return true;
}
