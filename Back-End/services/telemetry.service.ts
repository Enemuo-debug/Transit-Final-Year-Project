import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { verifyToken } from "../middleware/index.js";

export interface TelemetrySample {
  deviceId: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: string;
  actor?: string;
}

interface ClientSocket extends WebSocket {
  id: string;
  deviceId?: string;
  role: string | undefined;
}

const livePositions = new Map<string, TelemetrySample>();

export function getLivePositions(): TelemetrySample[] {
  return Array.from(livePositions.values());
}

export function getLivePosition(deviceId: string): TelemetrySample | null {
  return livePositions.get(deviceId) ?? null;
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
      livePositions.set(sample.deviceId, sample);

      const broadcast = JSON.stringify({ type: "position", sample });
      for (const peer of wss.clients as Set<ClientSocket>) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(broadcast);
        }
      }
    });

    ws.on("close", () => {
      if (ws.deviceId !== undefined) {
        livePositions.delete(ws.deviceId);
      }
    });
  });
}