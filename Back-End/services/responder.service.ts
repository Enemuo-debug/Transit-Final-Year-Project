import bcrypt from "bcrypt";
import { db } from "../prisma/db.js";

const SALT_ROUNDS = 10;
const AGENCY_TYPES = ["POLICE", "FRSC", "NEMA", "MEDICAL"] as const;
type AgencyType = (typeof AGENCY_TYPES)[number];

export { AGENCY_TYPES };
export type { AgencyType };

function stripPassword(user: any) {
  const cleanUser = { ...user }; // 1. Create a copy (no mutation)
  delete cleanUser.password;      // 2. Completely remove the key
  return cleanUser;               // 3. Return the sanitized copy
}

export interface CreateResponderInput {
  name: string;
  email: string;
  password: string;
  agency_type: AgencyType;
}

export interface UpdateResponderInput {
  name?: string;
  email?: string;
  password?: string;
  agency_type?: AgencyType;
}

export async function getAllResponders() {
  const responders = await db.orm.public.EmergencyResponders.all();
  return responders.map(stripPassword);
}

export async function getResponderById(id: number) {
  const responder = await db.orm.public.EmergencyResponders.where({ id }).first();
  if (!responder) return null;
  return stripPassword(responder);
}

export async function createResponder(input: CreateResponderInput) {
  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  const responder = await db.orm.public.EmergencyResponders.create({
    name: input.name.trim(),
    email: input.email.trim(),
    password: hashed,
    agency_type: input.agency_type,
  });
  return stripPassword(responder);
}

export async function updateResponder(id: number, input: UpdateResponderInput) {
  const existing = await db.orm.public.EmergencyResponders.where({ id }).first();
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (input.name !== undefined && input.name.trim().length > 0) data.name = input.name.trim();
  if (input.email !== undefined && input.email.trim().length > 0) data.email = input.email.trim();
  if (input.password !== undefined && input.password.trim().length > 0) {
    data.password = await bcrypt.hash(input.password, SALT_ROUNDS);
  }
  if (input.agency_type !== undefined) data.agency_type = input.agency_type;

  if (Object.keys(data).length === 0) return stripPassword(existing);

  const updated = await db.orm.public.EmergencyResponders.where({ id }).update(data);
  if (!updated) return null;
  return stripPassword(updated);
}

export async function deleteResponder(id: number) {
  const deleted = await db.orm.public.EmergencyResponders.where({ id }).delete();
  return deleted !== null;
}