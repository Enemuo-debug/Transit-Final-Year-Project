import { randomBytes } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { db } from "../prisma/db.js";
import * as cache from "./cache.service.js";

export interface CreateSessionInput {
  company_id: number;
  plate_number: string;
}

export interface SessionView {
  id: number;
  session_code: string;
  plate_number: string;
  is_active: boolean;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

const ttlMinutes = Number(process.env["SESSION_TTL_MINUTES"] ?? 10);
const TTL_MS = (Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 10) * 60_000;
const sweepMs = Number(process.env["SESSION_SWEEP_MS"] ?? 60_000);
const SWEEP_MS = Number.isFinite(sweepMs) && sweepMs > 0 ? sweepMs : 60_000;

type Instant = { epochMilliseconds: number; toString(): string };
type SessionRow = {
  id: number;
  session_code: string;
  plate_number: string;
  is_active: boolean;
  created_at: Instant;
  consumed_at: Instant | null;
};

// The database stores everything except expiry; expiry is always created_at + TTL.
function toView(row: SessionRow): SessionView {
  return {
    id: row.id,
    session_code: row.session_code,
    plate_number: row.plate_number,
    is_active: row.is_active,
    created_at: row.created_at.toString(),
    expires_at: new Date(row.created_at.epochMilliseconds + TTL_MS).toISOString(),
    consumed_at: row.consumed_at?.toString() ?? null,
  };
}

function newCode(taken: Set<string>): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(6);
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[bytes[i]! % alphabet.length];
    if (!taken.has(code)) return code;
  }
  throw new Error("SESSION_CODE_EXHAUSTED");
}

export async function createSession(input: CreateSessionInput): Promise<SessionView> {
  const bus = await db.orm.public.Bus.where({
    plate_number: input.plate_number.trim().toUpperCase(),
  }).first();
  if (!bus || bus.company_id !== input.company_id) throw new Error("BUS_NOT_FOUND");

  const rows = await db.orm.public.DriverSession.all();
  const now = Date.now();

  // One bus = one linked driver or one outstanding code.
  const linked = rows.find(
    (row) => row.plate_number === bus.plate_number && row.is_active && row.consumed_at,
  );
  if (linked) throw new Error("BUS_ALREADY_LINKED");

  const activeCode = rows.find(
    (row) =>
      row.plate_number === bus.plate_number &&
      row.is_active &&
      !row.consumed_at &&
      row.created_at.epochMilliseconds + TTL_MS > now,
  );
  if (activeCode) throw new Error("SESSION_CODE_ACTIVE");

  const taken = new Set(rows.map((row) => row.session_code));

  // A new code starts a clean streaming claim for this bus.
  await cache.deleteJSON(cache.streamKey(bus.plate_number));
  await cache.deleteLive(bus.plate_number);

  const created = await db.orm.public.DriverSession.create({
    session_code: newCode(taken),
    plate_number: bus.plate_number,
    company_id: input.company_id,
    is_active: true,
  });
  return toView(created);
}

export async function getSessionsByCompany(company_id: number): Promise<SessionView[]> {
  const rows = await db.orm.public.DriverSession.where({ company_id }).all();
  return rows
    .sort((a, b) => b.created_at.epochMilliseconds - a.created_at.epochMilliseconds)
    .map(toView);
}

export async function deactivateSession(
  company_id: number,
  id: number,
): Promise<SessionView | null> {
  const row = await db.orm.public.DriverSession.where({ id }).first();
  if (!row || row.company_id !== company_id) return null;
  const updated = await db.orm.public.DriverSession.where({ id }).update({ is_active: false });
  await cache.deleteJSON(cache.streamKey(row.plate_number));
  await cache.deleteLive(row.plate_number);
  return updated ? toView(updated) : null;
}

/** Revoke every session for a plate after a streaming conflict. */
export async function invalidateSessionsForPlate(plate_number: string): Promise<number> {
  const rows = await db.orm.public.DriverSession.where({ plate_number }).all();
  let revoked = 0;

  for (const row of rows) {
    if (row.is_active) {
      await db.orm.public.DriverSession.where({ id: row.id }).update({ is_active: false });
      revoked += 1;
    }
  }

  await cache.deleteJSON(cache.streamKey(plate_number));
  await cache.deleteLive(plate_number);
  return revoked;
}

/** A code must exist, be active, match the plate, be unused, and be under 10 minutes old. */
export async function validateDriverCredentials(session_code: string, plate_number: string) {
  const session = await db.orm.public.DriverSession.where({
    session_code: session_code.trim().toUpperCase(),
  }).first();

  if (!session) return { ok: false as const, error: "INVALID_DRIVER_CREDENTIALS" };
  if (!session.is_active) return { ok: false as const, error: "SESSION_CODE_REVOKED" };
  if (session.plate_number.toLowerCase() !== plate_number.trim().toLowerCase()) {
    return { ok: false as const, error: "INVALID_DRIVER_CREDENTIALS" };
  }
  if (session.consumed_at) return { ok: false as const, error: "SESSION_CODE_USED" };
  if (Date.now() >= session.created_at.epochMilliseconds + TTL_MS) {
    return { ok: false as const, error: "SESSION_CODE_EXPIRED" };
  }

  const bus = await db.orm.public.Bus.where({ plate_number: session.plate_number }).first();
  if (!bus || bus.deleted_at !== null) {
    return { ok: false as const, error: "INVALID_DRIVER_CREDENTIALS" };
  }
  return { ok: true as const, session, bus };
}

export async function consumeSession(id: number, device_id: string) {
  const row = await db.orm.public.DriverSession.where({ id }).first();
  if (!row || row.consumed_at) return row;
  return db.orm.public.DriverSession.where({ id }).update({
    consumed_at: Temporal.Now.instant(),
    device_id,
  });
}

/** Delete unused codes once their 10-minute window has passed. */
export async function sweepExpiredSessions(now = Date.now()): Promise<number> {
  const cutoff = now - TTL_MS;
  const rows = await db.orm.public.DriverSession.all();
  const stale = rows.filter(
    (row) => !row.consumed_at && row.created_at.epochMilliseconds <= cutoff,
  );
  for (const row of stale) {
    await db.orm.public.DriverSession.where({ id: row.id }).delete();
  }
  return stale.length;
}

let timer: NodeJS.Timeout | null = null;

export function startSessionSweeper(): void {
  if (timer) return;
  const run = () => {
    void sweepExpiredSessions()
      .then((count) => {
        if (count > 0) console.log(`[sessions] removed ${count} expired code(s)`);
      })
      .catch(() => undefined);
  };
  run();
  timer = setInterval(run, SWEEP_MS);
  timer.unref();
}
