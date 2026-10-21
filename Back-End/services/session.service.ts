import { randomBytes } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { db } from "../prisma/db.js";

export interface CreateSessionInput {
  company_id: number;
  plate_number: string;
}

function generateSessionCode(existing: Set<string>): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(6);
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += alphabet[bytes[i]! % alphabet.length];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error("SESSION_CODE_EXHAUSTED");
}

export async function createSession(input: CreateSessionInput) {
  const bus = await db.orm.public.Bus.where({
    plate_number: input.plate_number.trim().toUpperCase(),
  }).first();
  if (!bus) throw new Error("BUS_NOT_FOUND");
  if (bus.company_id !== input.company_id) throw new Error("BUS_NOT_FOUND");

  const existingCodes = new Set(
    (
      await db.orm.public.DriverSession
        .all()
    ).map((row) => row.session_code),
  );

  const session_code = generateSessionCode(existingCodes);

  return db.orm.public.DriverSession.create({
    session_code,
    plate_number: bus.plate_number,
    company_id: input.company_id,
    is_active: true,
  });
}

export async function getSessionsByCompany(company_id: number) {
  const rows = await db.orm.public.DriverSession.where({ company_id }).all();
  return rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

export async function getSessionById(id: number) {
  return db.orm.public.DriverSession.where({ id }).first();
}

export async function deactivateSession(company_id: number, id: number) {
  const session = await db.orm.public.DriverSession.where({ id }).first();
  if (!session || session.company_id !== company_id) return null;
  return db.orm.public.DriverSession.where({ id }).update({ is_active: false });
}

const SINGLE_USE = process.env["SESSION_SINGLE_USE"] !== "false";

export async function validateDriverCredentials(session_code: string, plate_number: string) {
  const session = await db.orm.public.DriverSession.where({
    session_code: session_code.trim().toUpperCase(),
  }).first();
  if (!session) return null;
  if (!session.is_active) return null;
  if (SINGLE_USE && session.consumed_at) return null;
  if (session.plate_number.toLowerCase() !== plate_number.trim().toLowerCase()) return null;

  const bus = await db.orm.public.Bus.where({ plate_number: session.plate_number }).first();
  if (!bus || bus.deleted_at !== null) return null;

  return { session, bus };
}

export async function consumeSession(id: number, device_id: string): Promise<void> {
  await db.orm.public.DriverSession.where({ id }).update({
    consumed_at: Temporal.Now.instant(),
    device_id,
  });
}