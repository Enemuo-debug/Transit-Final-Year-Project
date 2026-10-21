const MAPTILER_BASE = "https://api.maptiler.com";
const DEFAULT_STYLE_ID = "streets-v2";

export function getMapTilerApiKey(): string {
  const key = process.env["MAPTILER_API_KEY"];
  if (!key) throw new Error("MAPS_API_KEY_MISSING");
  return key;
}

export function getMapStyleId(): string {
  return process.env["MAPTILER_STYLE_ID"] ?? DEFAULT_STYLE_ID;
}

export function mapsConfigured(): boolean {
  return Boolean(process.env["MAPTILER_API_KEY"]);
}

export interface GeocodeFeature {
  id: string | undefined;
  text: string | undefined;
  place_name: string | undefined;
  center: { lat: number; lng: number };
  coordinates: [number, number];
  place_type: string[] | undefined;
}

function normalizeFeatures(features: Array<Record<string, unknown>>): GeocodeFeature[] {
  return features.map((feature) => {
    const geometry = feature["geometry"] as { coordinates?: [number, number] } | undefined;
    const rawCenter = feature["center"] as Array<number> | undefined;
    const coordinates = (Array.isArray(rawCenter) && rawCenter.length >= 2
      ? [rawCenter[0] as number, rawCenter[1] as number]
      : geometry?.coordinates ?? [0, 0]) as [number, number];
    return {
      id: typeof feature["id"] === "string" ? feature["id"] : undefined,
      text: typeof feature["text"] === "string" ? feature["text"] : undefined,
      place_name:
        typeof feature["place_name"] === "string" ? feature["place_name"] : undefined,
      center: { lat: coordinates[1] as number, lng: coordinates[0] as number },
      coordinates,
      place_type: Array.isArray(feature["place_type"]) ? (feature["place_type"] as string[]) : undefined,
    };
  });
}

async function requestFeatures(path: string): Promise<GeocodeFeature[]> {
  const url = `${MAPTILER_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("MAPS_UPSTREAM_ERROR");
  const data = (await res.json()) as {
    features?: Array<Record<string, unknown>>;
  };
  const features = data.features ?? [];
  if (features.length === 0) throw new Error("MAPS_NO_RESULTS");
  return normalizeFeatures(features);
}

export async function geocode(address: string, limit = 5) {
  return requestFeatures(
    `/geocoding/${encodeURIComponent(address)}.json?key=${encodeURIComponent(
      getMapTilerApiKey(),
    )}&limit=${limit}`,
  );
}

export async function reverseGeocode(lat: number, lng: number) {
  return requestFeatures(
    `/geocoding/${lng},${lat}.json?key=${encodeURIComponent(getMapTilerApiKey())}`,
  );
}

// ---------------------------------------------------------------------------
// Google Maps link resolution (paste a maps link -> precise lat/lng)
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const GOOGLE_HOST_RE = /(^|\.)google\.[a-z]{2,}(\.[a-z]{2,})?$/i;

function allowedMapsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const ok =
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host === "maps.google.com" ||
    GOOGLE_HOST_RE.test(host);
  return ok ? url : null;
}

function parseCoords(text: string): { latitude: number; longitude: number } | null {
  const patterns = [
    /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|ll|center|destination|query|sll)=(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const match = re.exec(text);
    if (!match || match[1] === undefined || match[2] === undefined) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      return { latitude, longitude };
    }
  }
  return null;
}

export interface ResolvedMapsLink {
  latitude: number;
  longitude: number;
  resolvedUrl: string;
}

/**
 * Resolve a Google Maps link (including maps.app.goo.gl short links) to precise
 * coordinates. Only Google Maps hosts are fetched (SSRF guard); redirects are
 * followed manually and every hop must stay on a Google host.
 */
export async function resolveMapsLink(raw: string): Promise<ResolvedMapsLink> {
  const start = allowedMapsUrl(raw);
  if (!start) throw new Error("MAPS_LINK_INVALID");

  let current = start.toString();
  for (let hop = 0; hop < 6; hop += 1) {
    const direct = parseCoords(current);
    if (direct) return { ...direct, resolvedUrl: current };

    let decoded = current;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      decoded = current;
    }
    if (decoded !== current) {
      const fromDecoded = parseCoords(decoded);
      if (fromDecoded) return { ...fromDecoded, resolvedUrl: current };
    }

    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new Error("MAPS_LINK_UNRESOLVED");
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      const next = new URL(location, current).toString();
      if (!allowedMapsUrl(next)) throw new Error("MAPS_LINK_INVALID");
      current = next;
      continue;
    }

    if (res.ok) {
      const body = await res.text();
      // Only scan a bounded prefix of the (large) Maps HTML.
      const fromBody = parseCoords(body.slice(0, 500_000));
      if (fromBody) return { ...fromBody, resolvedUrl: current };
    }
    break;
  }

  throw new Error("MAPS_LINK_UNRESOLVED");
}

export interface StaticMapOptions {
  center: { lat: number; lng: number };
  zoom?: number;
  width?: number;
  height?: number;
  markers?: Array<{ lat: number; lng: number; color?: string; label?: string }>;
}

export function buildStaticMapUrl(options: StaticMapOptions): string {
  const zoom = options.zoom ?? 15;
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  const styleId = getMapStyleId();
  const key = getMapTilerApiKey();

  const markerParams = (options.markers ?? [])
    .map((marker) => `${marker.lng},${marker.lat}`)
    .join("|");

  let url = `${MAPTILER_BASE}/maps/${styleId}/static/${options.center.lng},${
    options.center.lat
  },${zoom}/${width}x${height}.png?key=${encodeURIComponent(key)}&attribution=bottomright`;
  if (markerParams) url += `&markers=${encodeURIComponent(markerParams)}`;
  return url;
}