import { Temporal } from "temporal-polyfill";
import { db } from "../prisma/db.js";
import { archiveRecord } from "./archive.service.js";

function timeMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { epochMilliseconds?: unknown }).epochMilliseconds === "number") {
    return (value as { epochMilliseconds: number }).epochMilliseconds;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export interface StopInput {
  name: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
}

export interface CreateRouteInput {
  company_id: number;
  route_code: string;
  name: string;
  polyline?: string;
  is_active?: boolean;
  stops?: StopInput[];
}

export interface UpdateRouteInput {
  route_code?: string;
  name?: string;
  polyline?: string;
  is_active?: boolean;
  stops?: StopInput[];
}

export interface RouteStopView {
  stop_id: number;
  stop_order: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface RouteView {
  id: number;
  company_id: number;
  route_code: string;
  name: string;
  polyline: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  stops: RouteStopView[];
}

type RouteRow = {
  id: number;
  company_id: number;
  route_code: string;
  name: string;
  polyline: string | null;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

async function attachStops(route: RouteRow): Promise<RouteView> {
  const links = await db.orm.public.RouteStop.where({ route_id: route.id }).all();
  const ordered = links.sort((a, b) => a.stop_order - b.stop_order);
  const stops: RouteStopView[] = [];
  for (const link of ordered) {
    const stop = await db.orm.public.Stop.where({ id: link.stop_id }).first();
    if (!stop) continue;
    stops.push({
      stop_id: stop.id,
      stop_order: link.stop_order,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      radius_meters: stop.radius_meters,
    });
  }
  return {
    id: route.id,
    company_id: route.company_id,
    route_code: route.route_code,
    name: route.name,
    polyline: route.polyline,
    is_active: route.is_active,
    created_at: route.created_at,
    updated_at: route.updated_at,
    stops,
  };
}

async function replaceStops(route_id: number, stops: StopInput[]): Promise<void> {
  const existing = await db.orm.public.RouteStop.where({ route_id }).all();
  for (const link of existing) {
    await db.orm.public.RouteStop.where({ route_id, stop_id: link.stop_id }).delete();
    await db.orm.public.Stop.where({ id: link.stop_id }).delete();
  }

  let order = 1;
  for (const stop of stops) {
    const created = await db.orm.public.Stop.create({
      name: stop.name.trim(),
      latitude: stop.latitude,
      longitude: stop.longitude,
      ...(stop.radius_meters !== undefined ? { radius_meters: stop.radius_meters } : {}),
    });
    await db.orm.public.RouteStop.create({
      route_id,
      stop_id: created.id,
      stop_order: order,
    });
    order += 1;
  }
}

export async function listRoutes(company_id?: number): Promise<RouteView[]> {
  const rows =
    company_id !== undefined
      ? await db.orm.public.Route.where({ company_id }).all()
      : await db.orm.public.Route.all();
  const visible = rows.filter((row) => row.deleted_at === null);
  const sorted = visible.sort((a, b) => timeMs(b.created_at) - timeMs(a.created_at));
  return Promise.all(sorted.map((row) => attachStops(row)));
}

export async function getRouteById(company_id: number, id: number): Promise<RouteView | null> {
  const route = await db.orm.public.Route.where({ id }).first();
  if (!route || route.company_id !== company_id || route.deleted_at !== null) return null;
  return attachStops(route);
}

export async function createRoute(input: CreateRouteInput): Promise<RouteView> {
  const company = await db.orm.public.Company.where({ id: input.company_id }).first();
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  const route_code = input.route_code.trim().toUpperCase();
  const duplicate = await db.orm.public.Route.where({
    company_id: input.company_id,
    route_code,
  }).first();
  if (duplicate && duplicate.deleted_at === null) throw new Error("ROUTE_CODE_IN_USE");

  const route = await db.orm.public.Route.create({
    company_id: input.company_id,
    route_code,
    name: input.name.trim(),
    ...(input.polyline !== undefined ? { polyline: input.polyline } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
  });

  await replaceStops(route.id, input.stops ?? []);
  return (await attachStops(route)) as RouteView;
}

export async function updateRoute(
  company_id: number,
  id: number,
  input: UpdateRouteInput,
): Promise<RouteView | null> {
  const existing = await db.orm.public.Route.where({ id }).first();
  if (!existing || existing.company_id !== company_id || existing.deleted_at !== null) return null;

  const data: Record<string, unknown> = { updated_at: Temporal.Now.instant() };
  if (input.route_code !== undefined && input.route_code.trim().length > 0) {
    const route_code = input.route_code.trim().toUpperCase();
    const duplicate = await db.orm.public.Route.where({ company_id, route_code }).first();
    if (duplicate && duplicate.id !== id && duplicate.deleted_at === null) {
      throw new Error("ROUTE_CODE_IN_USE");
    }
    data.route_code = route_code;
  }
  if (input.name !== undefined && input.name.trim().length > 0) data.name = input.name.trim();
  if (input.polyline !== undefined) data.polyline = input.polyline;
  if (input.is_active !== undefined) data.is_active = input.is_active;

  const updated = await db.orm.public.Route.where({ id }).update(data);
  if (!updated) return null;

  if (input.stops !== undefined) await replaceStops(id, input.stops);
  return attachStops(updated);
}

/**
 * Hard delete + archive. Blocked while any journey still references the route
 * (archive those journeys first). The route, its RouteStop links and its stops
 * are removed from the live tables; a full snapshot goes to `archivedRecord`.
 */
export async function deleteRoute(
  company_id: number,
  id: number,
  deletedBy = "COMPANY",
): Promise<boolean> {
  const existing = await db.orm.public.Route.where({ id }).first();
  if (!existing || existing.company_id !== company_id || existing.deleted_at !== null) return false;

  const journeys = await db.orm.public.Journey.where({ route_id: id }).all();
  if (journeys.some((j) => j.deleted_at === null)) throw new Error("ROUTE_IN_USE");

  const links = await db.orm.public.RouteStop.where({ route_id: id }).all();
  const stops = [];
  for (const link of links) {
    const stop = await db.orm.public.Stop.where({ id: link.stop_id }).first();
    if (stop) stops.push(stop);
  }

  await archiveRecord({
    entity_type: "ROUTE",
    entity_id: id,
    company_id: existing.company_id,
    snapshot: { route: existing, stops },
    deleted_by: deletedBy,
  });

  for (const link of links) {
    await db.orm.public.RouteStop.where({ route_id: id, stop_id: link.stop_id }).delete();
  }
  await db.orm.public.Route.where({ id }).delete();
  for (const stop of stops) {
    await db.orm.public.Stop.where({ id: stop.id }).delete();
  }
  return true;
}
