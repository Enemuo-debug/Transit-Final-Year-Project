import { db } from "../prisma/db.js";

const BUS_STATUSES = ["ACTIVE", "MAINTENANCE", "OFFLINE"] as const;
type BusStatus = typeof BUS_STATUSES[number];

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

export async function getAllBuses() {
  return db.orm.public.Bus
    .include("company", (c) => c.select("id", "email", "company_name"))
    .all();
}

export async function getBusById(id: number) {
  const bus = await db.orm.public.Bus
    .include("company", (c) => c.select("id", "email", "company_name"))
    .where({ id })
    .first();
  if (!bus) return null;
  return bus;
}

export async function createBus(input: CreateBusInput) {
  const company = await db.orm.public.Company.where({ id: input.company_id }).first();
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  return db.orm.public.Bus.create({
    company_id: input.company_id,
    plate_number: input.plate_number.trim(),
    capacity: input.capacity,
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
}

export async function updateBus(id: number, input: UpdateBusInput) {
  const existing = await db.orm.public.Bus.where({ id }).first();
  if (!existing) return null;

  if (input.company_id !== undefined) {
    const company = await db.orm.public.Company.where({ id: input.company_id }).first();
    if (!company) throw new Error("COMPANY_NOT_FOUND");
  }

  const data: Record<string, unknown> = {};
  if (input.company_id !== undefined) data.company_id = input.company_id;
  if (input.plate_number !== undefined && input.plate_number.trim().length > 0) {
    data.plate_number = input.plate_number.trim();
  }
  if (input.capacity !== undefined) data.capacity = input.capacity;
  if (input.status !== undefined) data.status = input.status;

  if (Object.keys(data).length === 0) return existing;

  return db.orm.public.Bus.where({ id }).update(data);
}

export async function deleteBus(id: number) {
  const deleted = await db.orm.public.Bus.where({ id }).delete();
  return deleted !== null;
}
