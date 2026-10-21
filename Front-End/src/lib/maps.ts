import { API_BASE } from './base';

const API_KEY = (import.meta.env.VITE_MAPTILER_API_KEY ?? '').trim();
const STYLE_ID = (import.meta.env.VITE_MAPTILER_STYLE_ID ?? 'streets-v2').trim();
const STYLE_BASE = 'https://api.maptiler.com/maps';

export function mapsConfigured(): boolean {
  return API_KEY.length > 0;
}

export function mapStyleUrl(): string {
  return `${STYLE_BASE}/${encodeURIComponent(STYLE_ID)}/style.json?key=${encodeURIComponent(API_KEY)}`;
}

export async function backendMapsConfigured(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/maps/config`);
  if (!res.ok) return false;
  const data = (await res.json()) as { configured?: boolean };
  return data.configured === true;
}

export async function geocode(address: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${API_BASE}/maps/geocode?address=${encodeURIComponent(address)}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    throw new Error(data.error?.code ?? 'MAPS_UPSTREAM_ERROR');
  }
  const data = (await res.json()) as { results: Array<Record<string, unknown>> };
  return data.results;
}

export async function reverseGeocode(lat: number, lng: number): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${API_BASE}/maps/reverse-geocode?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    throw new Error(data.error?.code ?? 'MAPS_UPSTREAM_ERROR');
  }
  const data = (await res.json()) as { results: Array<Record<string, unknown>> };
  return data.results;
}

export function staticMapUrl(options: { center: { lat: number; lng: number }; zoom?: number }): string {
  const zoom = options.zoom ?? 15;
  return `${API_BASE}/maps/static?lat=${options.center.lat}&lng=${options.center.lng}&zoom=${zoom}&width=640&height=360`;
}

/** Parse a WKT LINESTRING("lng lat, lng lat, ...") into [lng, lat] pairs. */
export function parseLineString(wkt: string | null | undefined): [number, number][] {
  if (!wkt) return [];
  const match = /LINESTRING\s*\(([^)]*)\)/i.exec(wkt);
  if (!match || !match[1]) return [];
  return match[1]
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter((coords) => coords.length >= 2 && coords.every((n) => Number.isFinite(n)))
    .map((coords) => [coords[0]!, coords[1]!] as [number, number]);
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export interface ResolvedMapsLink {
  latitude: number;
  longitude: number;
  resolvedUrl: string;
}

/** Resolve a Google Maps link (short or full) to precise coordinates via the backend. */
export async function resolveMapsLink(url: string): Promise<ResolvedMapsLink> {
  const res = await fetch(`${API_BASE}/maps/resolve-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code?: string };
  } & Partial<ResolvedMapsLink>;
  if (!res.ok) throw new Error(data.error?.code ?? 'MAPS_LINK_UNRESOLVED');
  return data as ResolvedMapsLink;
}

export function mapsLinkErrorLabel(code: string): string {
  if (code === 'MAPS_LINK_INVALID') {
    return 'That does not look like a Google Maps link.';
  }
  if (code === 'MAPS_LINK_UNRESOLVED') {
    return 'Could not read coordinates from that link. Paste the full Google Maps URL instead.';
  }
  return 'Could not resolve that link. Please try again.';
}