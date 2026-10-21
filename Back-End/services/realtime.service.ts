import { WebSocketServer, WebSocket } from "ws";

let wss: WebSocketServer | null = null;

export function registerRealtimeServer(server: WebSocketServer): void {
  wss = server;
}

export function realtimeConnected(): boolean {
  return wss !== null;
}

export function clientCount(): number {
  return wss ? wss.clients.size : 0;
}

export function broadcast(message: object): void {
  if (!wss) return;
  const payload = JSON.stringify(message);
  for (const peer of wss.clients as Set<WebSocket>) {
    if (peer.readyState === WebSocket.OPEN) {
      peer.send(payload);
    }
  }
}
