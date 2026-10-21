import { Temporal } from "temporal-polyfill";
import { db } from "../prisma/db.js";
import { dispatchIncident } from "./dispatch.service.js";

const INCIDENT_TYPES = [
  "UNANTICIPATED_STOP",
  "ROUTE_DEVIATION",
  "ACCIDENT",
  "BREAKDOWN",
  "KIDNAPPING",
  "DRIVER_SOS",
] as const;
const INCIDENT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const INCIDENT_STATUSES = ["OPEN", "DISPATCHED", "IN_PROGRESS", "RESOLVED", "FALSE_ALARM"] as const;

export { INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_STATUSES };
export type IncidentType = (typeof INCIDENT_TYPES)[number];
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

const DEDUP_COOLDOWN_MS = Number(process.env["INCIDENT_COOLDOWN_MS"] ?? 120000);

export interface CreateIncidentInput {
  company_id: number;
  bus_id: number;
  route_id?: number;
  journey_id?: number;
  type: IncidentType;
  severity?: IncidentSeverity;
  latitude: number;
  longitude: number;
  description?: string;
}

export interface IncidentView {
  id: number;
  company_id: number;
  bus_id: number;
  route_id: number | null;
  journey_id: number | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  latitude: number;
  longitude: number;
  description: string | null;
  detected_at: Date;
  resolved_at: Date | null;
  plate_number: string | null;
}

type IncidentRow = {
  id: number;
  company_id: number;
  bus_id: number;
  route_id: number | null;
  journey_id: number | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  latitude: number;
  longitude: number;
  description: string | null;
  detected_at: Date;
  resolved_at: Date | null;
};

function timeMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { epochMilliseconds?: unknown }).epochMilliseconds === "number") {
    return (value as { epochMilliseconds: number }).epochMilliseconds;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function decorate(incident: IncidentRow): Promise<IncidentView> {
  const bus = await db.orm.public.Bus.where({ id: incident.bus_id }).first();
  return { ...incident, plate_number: bus?.plate_number ?? null };
}

export interface CreateIncidentResult {
  incident: IncidentView;
  created: boolean;
}

export async function createIncident(input: CreateIncidentInput): Promise<CreateIncidentResult> {
  const cutoff = Date.now() - DEDUP_COOLDOWN_MS;
  const candidates = await db.orm.public.Incident.where({
    bus_id: input.bus_id,
    type: input.type,
  }).all();
  const activeStatuses = new Set(["OPEN", "DISPATCHED", "IN_PROGRESS"]);
  const recent = candidates.find(
    (row) => activeStatuses.has(row.status) && timeMs(row.detected_at) >= cutoff,
  );
  if (recent) {
    return { incident: await decorate(recent), created: false };
  }

  const created = await db.orm.public.Incident.create({
    company_id: input.company_id,
    bus_id: input.bus_id,
    type: input.type,
    severity: input.severity ?? "MEDIUM",
    status: "OPEN",
    latitude: input.latitude,
    longitude: input.longitude,
    detected_at: Temporal.Now.instant(),
    ...(input.route_id !== undefined ? { route_id: input.route_id } : {}),
    ...(input.journey_id !== undefined ? { journey_id: input.journey_id } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  });
  const view = await decorate(created);
  void dispatchIncident(view).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[incident] auto-dispatch failed: ${message}`);
  });
  return { incident: view, created: true };
}

export interface ListIncidentsFilter {
  status?: IncidentStatus;
  type?: IncidentType;
  bus_id?: number;
  limit?: number;
}

export async function listIncidents(
  company_id: number,
  filter: ListIncidentsFilter = {},
): Promise<IncidentView[]> {
  let rows = await db.orm.public.Incident.where({ company_id }).all();
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.type) rows = rows.filter((r) => r.type === filter.type);
  if (filter.bus_id !== undefined) rows = rows.filter((r) => r.bus_id === filter.bus_id);
  rows.sort((a, b) => timeMs(b.detected_at) - timeMs(a.detected_at));
  const limited = filter.limit && filter.limit > 0 ? rows.slice(0, filter.limit) : rows;
  return Promise.all(limited.map((row) => decorate(row)));
}

export async function getIncidentById(
  company_id: number,
  id: number,
): Promise<IncidentView | null> {
  const incident = await db.orm.public.Incident.where({ id }).first();
  if (!incident || incident.company_id !== company_id) return null;
  return decorate(incident);
}

export async function updateIncidentStatus(
  company_id: number,
  id: number,
  status: IncidentStatus,
): Promise<IncidentView | null> {
  const existing = await db.orm.public.Incident.where({ id }).first();
  if (!existing || existing.company_id !== company_id) return null;

  const data: Record<string, unknown> = { status };
  if (status === "RESOLVED") data.resolved_at = Temporal.Now.instant();
  const updated = await db.orm.public.Incident.where({ id }).update(data);
  if (!updated) return null;
  return decorate(updated);
}
