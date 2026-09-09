const MAPS_BASE = "https://maps.googleapis.com/maps/api";

export function getMapsApiKey(): string {
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key) throw new Error("MAPS_API_KEY_MISSING");
  return key;
}

export function mapsConfigured(): boolean {
  return Boolean(process.env["GOOGLE_MAPS_API_KEY"]);
}

export async function geocode(address: string) {
  const url = `${MAPS_BASE}/geocode/json?address=${encodeURIComponent(
    address,
  )}&key=${encodeURIComponent(getMapsApiKey())}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("MAPS_UPSTREAM_ERROR");
  const data = (await res.json()) as {
    status?: string;
    results?: Array<Record<string, unknown>>;
    error_message?: string;
  };
  if (data.status !== "OK") {
    const code = data.status === "ZERO_RESULTS" ? "MAPS_NO_RESULTS" : "MAPS_UPSTREAM_ERROR";
    throw new Error(code);
  }
  return data.results ?? [];
}

export async function reverseGeocode(lat: number, lng: number) {
  const url = `${MAPS_BASE}/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(
    getMapsApiKey(),
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("MAPS_UPSTREAM_ERROR");
  const data = (await res.json()) as {
    status?: string;
    results?: Array<Record<string, unknown>>;
    error_message?: string;
  };
  if (data.status !== "OK") {
    const code = data.status === "ZERO_RESULTS" ? "MAPS_NO_RESULTS" : "MAPS_UPSTREAM_ERROR";
    throw new Error(code);
  }
  return data.results ?? [];
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
  const key = getMapsApiKey();

  const markerParams = (options.markers ?? []).map((m) => {
    const color = m.color ?? "red";
    const label = m.label ? `|label:${m.label}` : "";
    return `markers=color:${color}${label}|${m.lat},${m.lng}`;
  });

  const base = `${MAPS_BASE}/staticmap?size=${width}x${height}&zoom=${zoom}&key=${key}`;
  const center = `center=${options.center.lat},${options.center.lng}`;
  return [base, center, ...markerParams].join("&");
}