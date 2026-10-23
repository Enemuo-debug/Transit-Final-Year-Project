import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { verifyToken } from "../middleware/index.js";
import * as cache from "./cache.service.js";
import type { LivePosition } from "./cache.service.js";
import { broadcast, registerRealtimeServer } from "./realtime.service.js";
import { invalidateSessionsForPlate } from "./session.service.js";

const streamTtl = Number(process.env["STREAM_TTL_SECONDS"] ?? 30);
const STREAM_TTL_SECONDS = Number.isFinite(streamTtl) && streamTtl > 0 ? streamTtl : 30;

interface StreamOwner {
  sessionId: number;
  deviceId: string;
}

/**
 * Only one session/device may stream a plate. If another one tries, revoke
 * every session for that plate and clear its live position.
 */
export async function claimStream(
  plate: string,
  sessionId: number,
  deviceId: string,
): Promise<boolean> {
  const key = cache.streamKey(plate);
  const owner = await cache.getJSON<StreamOwner>(key);

  if (owner && (owner.sessionId !== sessionId || owner.deviceId !== deviceId)) {
    console.warn(`[telemetry] stream conflict for ${plate}; revoking sessions`);
    await cache.deleteJSON(key);
    await cache.deleteLive(plate);
    await invalidateSessionsForPlate(plate);
    broadcast({ type: "position_removed", deviceId: plate });
    return false;
  }

  await cache.setJSON(key, { sessionId, deviceId }, STREAM_TTL_SECONDS);
  return true;
}

export interface RecordPositionInput {
  deviceId: string;
  lat: number;
  lng: number;
  accuracy?: number;
}

/** Store only the latest position per bus. No speed is recorded. */
export async function recordPosition(input: RecordPositionInput): Promise<LivePosition> {
  const position: LivePosition = {
    deviceId: input.deviceId,
    lat: input.lat,
    lng: input.lng,
    accuracy: input.accuracy ?? 0,
    timestamp: new Date().toISOString(),
  };
  await cache.setLive(position);
  broadcast({ type: "position", position });
  return position;
}

export async function getLivePositions(): Promise<LivePosition[]> {
  return cache.listLive();
}

/** Attach the live position WebSocket at /ws/telemetry. */
export function attachTelemetryServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });
  registerRealtimeServer(wss);

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== "/ws/telemetry") return;

    const token = url.searchParams.get("token");
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    try {
      verifyToken(token);
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    ws.on("error", () => undefined);
    ws.send(JSON.stringify({ type: "welcome" }));

    void getLivePositions()
      .then((positions) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "snapshot", positions }));
        }
      })
      .catch(() => undefined);
  });
}
