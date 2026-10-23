import { useEffect, useRef, useState } from 'react';
import { getSession } from './api';
import { WS_BASE } from './base';

export interface TelemetrySample {
  deviceId: string;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
}

interface StreamEvent {
  type: 'welcome' | 'snapshot' | 'position' | 'position_removed' | 'error';
  positions?: TelemetrySample[];
  position?: TelemetrySample;
  deviceId?: string;
  message?: string;
}

export function useLivePositions(): {
  positions: TelemetrySample[];
  connected: boolean;
} {
  const [positions, setPositions] = useState<TelemetrySample[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = getSession()?.token;
    if (!token) return;
    const authToken: string = token;

    let disposed = false;
    let retry = 1000;
    let timer: number | null = null;

    function connect() {
      const ws = new WebSocket(`${WS_BASE}/ws/telemetry?token=${encodeURIComponent(authToken)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        retry = 1000;
      };

      ws.onmessage = (event) => {
        if (disposed) return;

        let message: StreamEvent;
        try {
          message = JSON.parse(String(event.data)) as StreamEvent;
        } catch {
          return;
        }

        if (message.type === 'snapshot' && message.positions) {
          setPositions(message.positions);
        }

        if (message.type === 'position' && message.position) {
          const incoming = message.position;
          setPositions((prev) => [
            ...prev.filter((item) => item.deviceId !== incoming.deviceId),
            incoming,
          ]);
        }

        if (message.type === 'position_removed' && message.deviceId) {
          setPositions((prev) => prev.filter((item) => item.deviceId !== message.deviceId));
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        timer = window.setTimeout(connect, retry);
        retry = Math.min(retry * 2, 10000);
      };

      ws.onerror = () => {
        if (!disposed) ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  return { positions, connected };
}
