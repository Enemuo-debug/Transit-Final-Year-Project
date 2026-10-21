import { db } from "../prisma/db.js";
import type { AgencyType } from "./responder.service.js";
import { findNearestResponderLocationsSpatial } from "./spatial.service.js";

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export interface CreateResponderLocationInput {
  responder_id: number;
  branch_name: string;
  latitude: number;
  longitude: number;
  is_active?: boolean;
}

export interface UpdateResponderLocationInput {
  branch_name?: string;
  latitude?: number;
  longitude?: number;
  is_active?: boolean;
}

export async function getLocationsByResponder(responder_id: number) {
  const rows = await db.orm.public.ResponderLocation.where({ responder_id }).all();
  return rows.sort(
    (a, b) =>
      Number(b.is_active) - Number(a.is_active) || a.branch_name.localeCompare(b.branch_name),
  );
}

export async function getLocationById(id: number) {
  return db.orm.public.ResponderLocation.where({ id }).first();
}

export async function createResponderLocation(input: CreateResponderLocationInput) {
  const branch_name = input.branch_name.trim();
  const existing = await db.orm.public.ResponderLocation.where({
    responder_id: input.responder_id,
    branch_name,
  }).first();
  if (existing) throw new Error("BRANCH_NAME_IN_USE");

  return db.orm.public.ResponderLocation.create({
    responder_id: input.responder_id,
    branch_name,
    latitude: input.latitude,
    longitude: input.longitude,
    is_active: input.is_active ?? true,
  });
}

export async function updateResponderLocation(
  responder_id: number,
  id: number,
  input: UpdateResponderLocationInput,
) {
  const existing = await db.orm.public.ResponderLocation.where({ id }).first();
  if (!existing || existing.responder_id !== responder_id) return null;

  const data: Record<string, unknown> = {};
  if (input.branch_name !== undefined && input.branch_name.trim().length > 0) {
    data.branch_name = input.branch_name.trim();
  }
  if (input.latitude !== undefined) data.latitude = input.latitude;
  if (input.longitude !== undefined) data.longitude = input.longitude;
  if (input.is_active !== undefined) data.is_active = input.is_active;

  if (Object.keys(data).length === 0) return existing;
  return db.orm.public.ResponderLocation.where({ id }).update(data);
}

export async function deleteResponderLocation(responder_id: number, id: number) {
  const existing = await db.orm.public.ResponderLocation.where({ id }).first();
  if (!existing || existing.responder_id !== responder_id) return false;
  await db.orm.public.ResponderLocation.where({ id }).delete();
  return true;
}

export interface NearestResponderLocation {
  location: {
    id: number;
    responder_id: number;
    branch_name: string;
    latitude: number;
    longitude: number;
    is_active: boolean;
    created_at: Date;
  };
  responder: {
    id: number;
    name: string;
    email: string;
    agency_type: AgencyType;
  };
  distance_km: number;
}

export interface FindNearestInput {
  latitude: number;
  longitude: number;
  agency_type?: AgencyType;
  limit?: number;
}

export async function findNearestResponderLocations(
  input: FindNearestInput,
): Promise<NearestResponderLocation[]> {
  return findNearestResponderLocationsSpatial(input);
}