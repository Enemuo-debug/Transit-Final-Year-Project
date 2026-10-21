import { WS_URL } from '../config';

export interface TrackSample {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: string;
}

export type StreamState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface StreamListener {
  onState?: (state: StreamState) => void;
}

export class TelemetryStream {
  private token: string;
  private deviceId: string;
  private ws: WebSocket | null = null;
  private listener: StreamListener | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private retryDelay = 1000;

  state: StreamState = 'idle';

  constructor(token: string, deviceId: string) {
    this.token = token;
    this.deviceId = deviceId;
  }

  setListener(listener: StreamListener): void {
    this.listener = listener;
  }

  private setState(state: StreamState): void {
    this.state = state;
    this.listener?.onState?.(state);
  }

  start(): void {
    if (this.disposed) return;
    if (this.ws) this.stop();
    this.setState('connecting');

    const url = `${WS_URL}?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.disposed) return;
      this.setState('open');
      this.retryDelay = 1000;
    };

    ws.onmessage = () => {
      // Keep-alives / broadcasts from the server are not needed by the driver.
    };

    ws.onerror = () => {
      if (!this.disposed) {
        this.setState('error');
        ws.close();
      }
    };

    ws.onclose = () => {
      if (this.disposed) return;
      this.setState('closed');
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.disposed) this.start();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 15000);
  }

  send(sample: TrackSample): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = {
      type: 'ping',
      deviceId: this.deviceId,
      lat: sample.lat,
      lng: sample.lng,
      speed: sample.speed,
      heading: sample.heading,
      timestamp: sample.timestamp,
    };
    ws.send(JSON.stringify(payload));
  }

  stop(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.setState('idle');
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }
}