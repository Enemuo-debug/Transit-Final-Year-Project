import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { Temporal } from "temporal-polyfill";
import { verifyToken } from "../middleware/index.js";
import { db } from "../prisma/db.js";
import * as cache from "./cache.service.js";
import type { LivePosition } from "./cache.service.js";
import { evaluateSample } from "./anomaly.engine.js";
import { broadcast, registerRealtimeServer } from "./realtime.service.js";

export type TelemetrySample = LivePosition;

interface ClientSocket extends WebSocket {
  id: string;
  deviceId?: string;
  role: string | undefined;
}

export async function getLivePositions(): Promise<TelemetrySample[]> {
  return cache.listLive();
}

export async function getLivePosition(deviceId: string): Promise<TelemetrySample | null> {
  return cache.getLive(deviceId);
}

export function recordPosition(sample: TelemetrySample): TelemetrySample {
  cache.setLive(sample);
  broadcast({ type: "position", sample });
  void evaluateSample(sample).catch(() => undefined);
  return sample;
}

export function removePosition(deviceId: string): void {
  void cache.deleteLive(deviceId);
}

// ---------------------------------------------------------------------------
// Write-back: periodically persist the live cache into PostgreSQL so we keep
// durable track history without hitting the DB on every telemetry sample.
// ---------------------------------------------------------------------------
const lastFlushed = new Map<string, number>();
let flushTimer: NodeJS.Timeout | null = null;
const FLUSH_MS = Number(process.env["TELEMETRY_FLUSH_MS"] ?? 15000);

async function resolveBusId(plate: string): Promise<number | null> {
  const bus = await db.orm.public.Bus.where({ plate_number: plate }).first();
  return bus?.id ?? null;
}

export async function flushLiveTelemetry(): Promise<number> {
  const samples = await cache.listLive();
  let written = 0;
  for (const sample of samples) {
    const parsed = Date.parse(sample.timestamp);
    const stamp = Number.isFinite(parsed) ? parsed : Date.now();
    const previous = lastFlushed.get(sample.deviceId) ?? 0;
    if (stamp <= previous) continue;

    const busId = await resolveBusId(sample.deviceId);
    await db.orm.public.TelemetryPoint.create({
      device_id: sample.deviceId,
      latitude: sample.lat,
      longitude: sample.lng,
      speed: sample.speed,
      heading: sample.heading,
      recorded_at: Temporal.Instant.fromEpochMilliseconds(stamp),
      ...(busId !== null ? { bus_id: busId } : {}),
    });
    lastFlushed.set(sample.deviceId, stamp);
    written += 1;
  }
  return written;
}

export function startTelemetryWriteBack(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushLiveTelemetry().catch(() => undefined);
  }, FLUSH_MS);
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

const WS_PATH = "/ws/telemetry";

function readAuthToken(url: URL): string | null {
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  return null;
}

function parseSample(raw: RawData): TelemetrySample | null {
  const text = raw.toString();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (payload["type"] !== "ping") return null;

  const deviceId = typeof payload["deviceId"] === "string" ? payload["deviceId"] : undefined;
  const lat = typeof payload["lat"] === "number" ? payload["lat"] : NaN;
  const lng = typeof payload["lng"] === "number" ? payload["lng"] : NaN;
  const speed = typeof payload["speed"] === "number" ? payload["speed"] : 0;
  const heading = typeof payload["heading"] === "number" ? payload["heading"] : 0;
  const timestamp =
    typeof payload["timestamp"] === "string"
      ? payload["timestamp"]
      : new Date().toISOString();
  const actor = typeof payload["actor"] === "string" ? payload["actor"] : undefined;

  if (!deviceId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { deviceId, lat, lng, speed, heading, timestamp, ...(actor !== undefined ? { actor } : {}) };
}

export function attachTelemetryServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });
  registerRealtimeServer(wss);
  startTelemetryWriteBack();

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== WS_PATH) return;

    let role: string | undefined = undefined;
    const token = readAuthToken(url);
    if (token) {
      try {
        role = verifyToken(token).role;
      } catch {
        role = undefined;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = ws as ClientSocket;
      client.id = randomUUID();
      client.role = role;
      wss.emit("connection", client, req);
    });
  });

  wss.on("connection", (ws: ClientSocket) => {
    ws.send(
      JSON.stringify({
        type: "welcome",
        connectionId: ws.id,
        message: "Connected to Transit telemetry stream.",
      }),
    );

    ws.on("message", (raw: RawData) => {
      const sample = parseSample(raw);
      if (!sample) {
        ws.send(JSON.stringify({ type: "error", message: "INVALID_TELEMETRY" }));
        return;
      }
      if (ws.role !== undefined) sample.actor = ws.role;
      ws.deviceId = sample.deviceId;
      recordPosition(sample);
    });

    ws.on("close", () => {
      if (ws.deviceId !== undefined) {
        removePosition(ws.deviceId);
      }
    });
  });
}
