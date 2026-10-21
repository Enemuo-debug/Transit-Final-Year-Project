import { Redis } from "ioredis";

export interface LivePosition {
  deviceId: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: string;
  actor?: string;
}

const LIVE_PREFIX = "transit:live:";
const DEFAULT_TTL_SECONDS = Number(process.env["LIVE_TTL_SECONDS"] ?? 60);

// ---------------------------------------------------------------------------
// In-memory mirror: always kept in sync so reads never fail if Redis blips,
// and so the write-back flusher has a local buffer.
// ---------------------------------------------------------------------------
const memory = new Map<string, { value: LivePosition; expiresAt: number }>();

function memorySet(sample: LivePosition, ttlSeconds: number): void {
  memory.set(sample.deviceId, { value: sample, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memoryGet(deviceId: string): LivePosition | null {
  const entry = memory.get(deviceId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(deviceId);
    return null;
  }
  return entry.value;
}

function memoryList(): LivePosition[] {
  const now = Date.now();
  const out: LivePosition[] = [];
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) {
      memory.delete(key);
      continue;
    }
    out.push(entry.value);
  }
  return out;
}

function memoryDelete(deviceId: string): void {
  memory.delete(deviceId);
}

// ---------------------------------------------------------------------------
// Redis client (optional). If it can't connect, we silently fall back to memory.
// ---------------------------------------------------------------------------
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

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

export function setLive(sample: LivePosition, ttlSeconds = DEFAULT_TTL_SECONDS): void {
  memorySet(sample, ttlSeconds);
  if (client && redisReady) {
    client
      .set(LIVE_PREFIX + sample.deviceId, JSON.stringify(sample), "EX", ttlSeconds)
      .catch(() => undefined);
  }
}

export async function getLive(deviceId: string): Promise<LivePosition | null> {
  if (client && redisReady) {
    try {
      const raw = await client.get(LIVE_PREFIX + deviceId);
      if (raw) return JSON.parse(raw) as LivePosition;
    } catch {
      // fall through to memory
    }
  }
  return memoryGet(deviceId);
}

export async function listLive(): Promise<LivePosition[]> {
  if (client && redisReady) {
    try {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await client.scan(cursor, "MATCH", `${LIVE_PREFIX}*`, "COUNT", 100);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== "0");

      if (keys.length === 0) return [];
      const values = await client.mget(keys);
      const out: LivePosition[] = [];
      for (const value of values) {
        if (!value) continue;
        try {
          out.push(JSON.parse(value) as LivePosition);
        } catch {
          // ignore malformed entry
        }
      }
      return out;
    } catch {
      // fall through to memory
    }
  }
  return memoryList();
}

export async function deleteLive(deviceId: string): Promise<void> {
  memoryDelete(deviceId);
  if (client && redisReady) {
    try {
      await client.del(LIVE_PREFIX + deviceId);
    } catch {
      // ignore
    }
  }
}

// Generic JSON cache (used for the journey "allowed track" / route stop cache).
const jsonStore = new Map<string, { value: string; expiresAt: number }>();

export async function setJSON<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
  const payload = JSON.stringify(value);
  jsonStore.set(key, { value: payload, expiresAt: Date.now() + ttlSeconds * 1000 });
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
  const entry = jsonStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    jsonStore.delete(key);
    return null;
  }
  return JSON.parse(entry.value) as T;
}

export async function deleteJSON(key: string): Promise<void> {
  jsonStore.delete(key);
  if (client && redisReady) {
    try {
      await client.del(key);
    } catch {
      // ignore
    }
  }
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
