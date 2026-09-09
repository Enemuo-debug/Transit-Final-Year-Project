import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();

let loaded = false;

export function mapsConfigured(): boolean {
  return API_KEY.length > 0;
}

export async function loadMaps(): Promise<void> {
  if (!API_KEY) throw new Error('MAPS_API_KEY_MISSING');
  if (loaded) return;
  setOptions({ key: API_KEY, v: 'weekly' });
  await Promise.all([importLibrary('maps'), importLibrary('marker'), importLibrary('places')]);
  loaded = true;
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