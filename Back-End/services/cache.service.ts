import { Redis } from "ioredis";

// Shared cache: generic JSON values plus the latest live GPS position per bus.
// Every write is mirrored in process memory, so reads keep working if Redis is
// unavailable. Redis is the shared/fast copy; memory is the fallback.

const DEFAULT_TTL_SECONDS = Number(process.env["CACHE_TTL_SECONDS"] ?? 60);
const liveTtl = Number(process.env["LIVE_TTL_SECONDS"] ?? 60);
const LIVE_TTL_SECONDS = Number.isFinite(liveTtl) && liveTtl > 0 ? liveTtl : 60;
const LIVE_PREFIX = "transit:live:";
const STREAM_PREFIX = "transit:stream:";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

export function streamKey(deviceId: string): string {
  return STREAM_PREFIX + deviceId;
}

export interface LivePosition {
  deviceId: string;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
}

const memory = new Map<string, { value: string; expiresAt: number }>();

let client: Redis | null = null;
let redisReady = false;

try {
  client = new Redis(REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 250, 2000),
  });
  client.on("ready", () => {
    redisReady = true;
  });
  client.on("end", () => {
    redisReady = false;
  });
  client.on("error", () => {
    redisReady = false;
  });
} catch {
  client = null;
  redisReady = false;
}

export function cacheBackend(): "redis" | "memory" {
  return redisReady ? "redis" : "memory";
}

export function cacheConnected(): boolean {
  return redisReady;
}

export async function setJSON<T>(
  key: string,
  value: T,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const payload = JSON.stringify(value);
  memory.set(key, { value: payload, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (client && redisReady) {
    try {
      await client.set(key, payload, "EX", ttlSeconds);
    } catch {
      // ignore, memory copy remains
    }
  }
}

export async function getJSON<T>(key: string): Promise<T | null> {
  if (client && redisReady) {
    try {
      const raw = await client.get(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // fall through to memory
    }
  }
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return JSON.parse(entry.value) as T;
}

export async function deleteJSON(key: string): Promise<void> {
  memory.delete(key);
  if (client && redisReady) {
    try {
      await client.del(key);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Live GPS positions: latest value per bus, expiring after 60 seconds.
// Redis is the shared copy; the memory map keeps the app working without it.
// ---------------------------------------------------------------------------

export async function setLive(position: LivePosition): Promise<void> {
  await setJSON(LIVE_PREFIX + position.deviceId, position, LIVE_TTL_SECONDS);
}

export async function getLive(deviceId: string): Promise<LivePosition | null> {
  return getJSON<LivePosition>(LIVE_PREFIX + deviceId);
}

export async function deleteLive(deviceId: string): Promise<void> {
  await deleteJSON(LIVE_PREFIX + deviceId);
}

export async function listLive(): Promise<LivePosition[]> {
  const keys = new Set<string>();
  for (const key of memory.keys()) {
    if (key.startsWith(LIVE_PREFIX)) keys.add(key);
  }

  if (client && redisReady) {
    try {
      let cursor = "0";
      do {
        const [next, batch] = await client.scan(cursor, "MATCH", `${LIVE_PREFIX}*`, "COUNT", 100);
        cursor = next;
        for (const key of batch) keys.add(key);
      } while (cursor !== "0");
    } catch {
      // memory keys are already in the set
    }
  }

  const positions: LivePosition[] = [];
  for (const key of keys) {
    const value = await getJSON<LivePosition>(key);
    if (value) positions.push(value);
  }
  return positions;
}

export async function redisHealth(): Promise<{ backend: "redis" | "memory"; pingMs: number | null }> {
  if (!client || !redisReady) return { backend: "memory", pingMs: null };
  const start = Date.now();
  try {
    await client.ping();
    return { backend: "redis", pingMs: Date.now() - start };
  } catch {
    return { backend: "memory", pingMs: null };
  }
}

export async function closeCache(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}
