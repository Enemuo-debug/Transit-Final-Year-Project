import { useEffect, useRef, useState } from 'react';
import { getSession } from './api';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface TelemetrySample {
  deviceId: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: string;
  actor?: string;
}

interface StreamEvent {
  type: 'welcome' | 'position' | 'error';
  connectionId?: string;
  message?: string;
  sample?: TelemetrySample;
}

function wsUrl(): string {
  const base = API_BASE.replace(/^http/, 'ws');
  const session = getSession();
  const token = session?.token;
  return token ? `${base}/ws/telemetry?token=${encodeURIComponent(token)}` : `${base}/ws/telemetry`;
}

export function useLivePositions() {
  const [positions, setPositions] = useState<TelemetrySample[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let reconnectDelay = 1000;

    function connect() {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        reconnectDelay = 1000;
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        let msg: StreamEvent;
        try {
          msg = JSON.parse(String(event.data)) as StreamEvent;
        } catch {
          return;
        }
        if (msg.type === 'position' && msg.sample) {
          setPositions((prev) => {
            const next = prev.filter((p) => p.deviceId !== msg.sample!.deviceId);
            return [...next, msg.sample!];
          });
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      };

      ws.onerror = () => {
        if (!disposed) ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      wsRef.current?.close();
    };
  }, []);

  return { positions, connected };
}