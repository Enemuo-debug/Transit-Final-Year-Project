import { Temporal } from "temporal-polyfill";
import { db } from "../prisma/db.js";
import { findNearestResponderLocationsSpatial, type NearestResponderLocation } from "./spatial.service.js";
import { broadcast } from "./realtime.service.js";
import { sendMail } from "./mailer.service.js";
import type { IncidentView, IncidentType, IncidentSeverity } from "./incident.service.js";

const DISPATCH_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "EN_ROUTE",
  "ON_SCENE",
  "COMPLETED",
  "DECLINED",
] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];
export { DISPATCH_STATUSES };

const MAX_RESPONDERS = Number(process.env["DISPATCH_MAX_RESPONDERS"] ?? 3);
const DISPATCH_ENABLED = process.env["DISPATCH_ENABLED"] !== "false";

export interface DispatchView {
  id: number;
  incident_id: number;
  responder_id: number;
  responder_location_id: number | null;
  status: DispatchStatus;
  dispatched_at: Date;
  accepted_at: Date | null;
  arrived_at: Date | null;
  resolved_at: Date | null;
  notes: string | null;
  responder_name: string | null;
  branch_name: string | null;
  response_minutes: number | null;
  incident: {
    id: number;
    type: IncidentType;
    severity: IncidentSeverity;
    status: string;
    latitude: number;
    longitude: number;
    description: string | null;
    detected_at: Date;
  } | null;
}

type DispatchRow = {
  id: number;
  incident_id: number;
  responder_id: number;
  responder_location_id: number | null;
  status: DispatchStatus;
  dispatched_at: Date;
  accepted_at: Date | null;
  arrived_at: Date | null;
  resolved_at: Date | null;
  notes: string | null;
};

function timeMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { epochMilliseconds?: unknown }).epochMilliseconds === "number") {
    return (value as { epochMilliseconds: number }).epochMilliseconds;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function responseMinutes(row: DispatchRow): number | null {
  if (!row.accepted_at) return null;
  const delta = timeMs(row.accepted_at) - timeMs(row.dispatched_at);
  return delta >= 0 ? Math.round((delta / 60000) * 10) / 10 : null;
}

async function decorate(row: DispatchRow, withIncident = true): Promise<DispatchView> {
  const responder = await db.orm.public.EmergencyResponders.where({ id: row.responder_id }).first();
  let branchName: string | null = null;
  if (row.responder_location_id !== null) {
    const location = await db.orm.public.ResponderLocation.where({ id: row.responder_location_id }).first();
    branchName = location?.branch_name ?? null;
  }
  let incident: DispatchView["incident"] = null;
  if (withIncident) {
    const found = await db.orm.public.Incident.where({ id: row.incident_id }).first();
    if (found) {
      incident = {
        id: found.id,
        type: found.type,
        severity: found.severity,
        status: found.status,
        latitude: found.latitude,
        longitude: found.longitude,
        description: found.description,
        detected_at: found.detected_at,
      };
    }
  }
  return {
    ...row,
    responder_name: responder?.name ?? null,
    branch_name: branchName,
    response_minutes: responseMinutes(row),
    incident,
  };
}

function pickNearestPerResponder(
  ranked: NearestResponderLocation[],
): NearestResponderLocation[] {
  const seen = new Set<number>();
  const picked: NearestResponderLocation[] = [];
  for (const entry of ranked) {
    if (seen.has(entry.responder.id)) continue;
    seen.add(entry.responder.id);
    picked.push(entry);
    if (picked.length >= MAX_RESPONDERS) break;
  }
  return picked;
}

export async function dispatchIncident(incident: IncidentView): Promise<DispatchView[]> {
  broadcast({ type: "incident", incident });

  if (!DISPATCH_ENABLED) return [];

  const ranked = await findNearestResponderLocationsSpatial({
    latitude: incident.latitude,
    longitude: incident.longitude,
    limit: MAX_RESPONDERS * 5,
  });
  const selected = pickNearestPerResponder(ranked);

  const created: DispatchRow[] = [];
  for (const entry of selected) {
    try {
      const row = await db.orm.public.IncidentDispatch.create({
        incident_id: incident.id,
        responder_id: entry.responder.id,
        responder_location_id: entry.location.id,
        status: "PENDING",
      });
      created.push(row as DispatchRow);
    } catch {
      // unique(incident_id, responder_id) already exists — skip
    }
  }

  if (created.length > 0) {
    const current = await db.orm.public.Incident.where({ id: incident.id }).first();
    if (current && current.status === "OPEN") {
      await db.orm.public.Incident.where({ id: incident.id }).update({ status: "DISPATCHED" });
    }
  }

  const views = await Promise.all(created.map((row) => decorate(row, false)));
  for (const view of views) {
    broadcast({ type: "dispatch", dispatch: view });
  }

  // Email alerts (non-blocking): company manager + each dispatched responder.
  void sendAlerts(incident, selected).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[dispatch] alert delivery failed: ${message}`);
  });

  return views;
}

async function sendAlerts(
  incident: IncidentView,
  selected: NearestResponderLocation[],
): Promise<void> {
  const company = await db.orm.public.Company.where({ id: incident.company_id }).first();
  if (company) {
    const text = [
      "TRANSIT EMERGENCY ALERT",
      "",
      `Company:  ${company.company_name}`,
      `Vehicle:  ${incident.plate_number ?? incident.bus_id}`,
      `Incident: ${incident.type}`,
      `Severity: ${incident.severity}`,
      `Detected: ${new Date(timeMs(incident.detected_at)).toISOString()}`,
      `Location: ${incident.latitude}, ${incident.longitude}`,
      incident.description ? `Details:  ${incident.description}` : "",
      "",
      "Log in to the command dashboard for live status.",
    ]
      .filter(Boolean)
      .join("\n");
    await sendMail({
      to: company.email,
      subject: `[TRANSIT] ${incident.type} on ${incident.plate_number ?? "vehicle"}`,
      text,
    });
  }

  for (const entry of selected) {
    const text = [
      "TRANSIT DISPATCH REQUEST",
      "",
      `Incident: ${incident.type} (${incident.severity})`,
      `Location: ${incident.latitude}, ${incident.longitude}`,
      `Your branch: ${entry.location.branch_name}`,
      `Distance: ${entry.distance_km.toFixed(2)} km`,
      "",
      "Open the responder console to accept and navigate.",
    ].join("\n");
    await sendMail({
      to: entry.responder.email,
      subject: `[TRANSIT] Dispatch request — ${incident.type}`,
      text,
    });
  }
}

export async function listDispatchesByResponder(responder_id: number): Promise<DispatchView[]> {
  const rows = await db.orm.public.IncidentDispatch.where({ responder_id }).all();
  rows.sort((a, b) => timeMs(b.dispatched_at) - timeMs(a.dispatched_at));
  return Promise.all(rows.map((row) => decorate(row as DispatchRow)));
}

export async function listDispatchesByIncident(
  company_id: number,
  incident_id: number,
): Promise<DispatchView[] | null> {
  const incident = await db.orm.public.Incident.where({ id: incident_id }).first();
  if (!incident || incident.company_id !== company_id) return null;
  const rows = await db.orm.public.IncidentDispatch.where({ incident_id }).all();
  rows.sort((a, b) => timeMs(a.dispatched_at) - timeMs(b.dispatched_at));
  return Promise.all(rows.map((row) => decorate(row as DispatchRow, false)));
}

export async function updateDispatchStatus(
  responder_id: number,
  dispatch_id: number,
  status: DispatchStatus,
): Promise<DispatchView | null> {
  const existing = await db.orm.public.IncidentDispatch.where({ id: dispatch_id }).first();
  if (!existing || existing.responder_id !== responder_id) return null;

  const data: Record<string, unknown> = { status };
  const now = Temporal.Now.instant();
  if (status === "ACCEPTED" && !existing.accepted_at) data.accepted_at = now;
  if (status === "ON_SCENE" && !existing.arrived_at) data.arrived_at = now;
  if (status === "COMPLETED" && !existing.resolved_at) data.resolved_at = now;

  const updated = await db.orm.public.IncidentDispatch.where({ id: dispatch_id }).update(data);
  if (!updated) return null;

  if (status === "ACCEPTED") {
    const incident = await db.orm.public.Incident.where({ id: existing.incident_id }).first();
    if (incident && (incident.status === "OPEN" || incident.status === "DISPATCHED")) {
      await db.orm.public.Incident.where({ id: existing.incident_id }).update({
        status: "IN_PROGRESS",
      });
    }
  }

  const view = await decorate(updated as DispatchRow, false);
  broadcast({ type: "dispatch:update", dispatch: view });
  return view;
}
