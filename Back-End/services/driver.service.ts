import { randomUUID } from "node:crypto";
import { db } from "../prisma/db.js";
import { validateDriverCredentials, consumeSession } from "./session.service.js";
import { signToken, type DriverAuthUser } from "../middleware/auth.js";
import { BUS_STATUSES, type BusStatus } from "./bus.service.js";

export interface DriverLoginInput {
  session_code: string;
  plate_number: string;
  device_id?: string;
}

export interface DriverLoginResult {
  token: string;
  user: DriverAuthUser;
  session: {
    id: number;
    session_code: string;
    plate_number: string;
    is_active: boolean;
  };
}

export async function driverLogin(input: DriverLoginInput): Promise<DriverLoginResult> {
  const match = await validateDriverCredentials(input.session_code, input.plate_number);
  if (!match) throw new Error("INVALID_DRIVER_CREDENTIALS");

  const { session, bus } = match;
  const deviceId = input.device_id ?? session.device_id ?? randomUUID();

  // Consume the code on first successful login (single-use), pinning the device.
  if (!session.consumed_at) {
    await consumeSession(session.id, deviceId);
  }

  const user: DriverAuthUser = {
    role: "DRIVER",
    sessionId: session.id,
    companyId: session.company_id,
    plate_number: bus.plate_number,
    busId: bus.id,
    session_code: session.session_code,
    deviceId,
  };

  return {
    token: signToken(user),
    user,
    session: {
      id: session.id,
      session_code: session.session_code,
      plate_number: session.plate_number,
      is_active: session.is_active,
    },
  };
}

export async function getDriverBus(user: DriverAuthUser) {
  const bus = await db.orm.public.Bus.where({ id: user.busId }).first();
  if (!bus || bus.deleted_at !== null) return null;
  return {
    id: bus.id,
    plate_number: bus.plate_number,
    capacity: bus.capacity,
    status: bus.status,
  };
}

export async function updateBusStatusFromDriver(
  user: DriverAuthUser,
  status: BusStatus,
): Promise<{ id: number; plate_number: string; status: BusStatus } | null> {
  const bus = await db.orm.public.Bus.where({ id: user.busId }).first();
  if (!bus || bus.deleted_at !== null) return null;

  // While a journey is assigned/active, the journey owns the bus state.
  const journeys = await db.orm.public.Journey.where({ bus_id: bus.id }).all();
  const onJourney = journeys.some(
    (j) =>
      j.deleted_at === null && (j.status === "SCHEDULED" || j.status === "ACTIVE"),
  );
  if (onJourney) throw new Error("BUS_ON_JOURNEY");

  const updated = await db.orm.public.Bus.where({ id: bus.id }).update({ status });
  if (!updated) return null;
  return { id: updated.id, plate_number: updated.plate_number, status: updated.status };
}

export { BUS_STATUSES };