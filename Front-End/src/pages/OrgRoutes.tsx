import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getSession,
  getRoutes,
  createRoute,
  deleteRoute,
  errorLabel,
  type Route,
  type RouteStopInput,
} from '../lib/api';
import { OrgShell } from '../components/OrgShell';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { LiveMap, type MapLine, type MapMarker, type MapPoint } from '../components/LiveMap';
import { parseLineString, reverseGeocode, resolveMapsLink, mapsLinkErrorLabel } from '../lib/maps';

interface StopDraft {
  name: string;
  latitude: string;
  longitude: string;
  radius: string;
}

function emptyStop(): StopDraft {
  return { name: '', latitude: '', longitude: '', radius: '100' };
}

function isCoord(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value));
}

async function nameForPoint(lat: number, lng: number): Promise<string> {
  try {
    const results = await reverseGeocode(lat, lng);
    const first = results[0] as { text?: string; place_name?: string } | undefined;
    return (first?.text ?? first?.place_name ?? '').toString();
  } catch {
    return '';
  }
}

export function OrgRoutes() {
  const session = getSession();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [routeCode, setRouteCode] = useState('');
  const [name, setName] = useState('');
  const [polyline, setPolyline] = useState('');
  const [stops, setStops] = useState<StopDraft[]>([emptyStop()]);
  const [picking, setPicking] = useState(true);
  const [naming, setNaming] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRoutes(await getRoutes());
      setError(null);
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.role === 'COMPANY') void refresh();
  }, [refresh, session?.role]);

  if (!session || session.role !== 'COMPANY') {
    return <Navigate to="/signin/organization" replace />;
  }

  function updateStop(index: number, patch: Partial<StopDraft>) {
    setStops((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStopAt(lat: number, lng: number) {
    const index = stops.length;
    setStops((current) => [
      ...current,
      {
        name: '',
        latitude: lat.toFixed(5),
        longitude: lng.toFixed(5),
        radius: '100',
      },
    ]);
    setNaming(true);
    void nameForPoint(lat, lng).then((label) => {
      setNaming(false);
      if (!label) return;
      setStops((current) => {
        const next = [...current];
        const target = next[index];
        if (target && target.name.trim() === '') next[index] = { ...target, name: label };
        return next;
      });
    });
  }

  function onMapClick(coords: MapPoint) {
    addStopAt(coords.lat, coords.lng);
  }

  async function onAddFromLink() {
    const value = linkInput.trim();
    if (!value || linkBusy) return;
    setLinkBusy(true);
    setError(null);
    try {
      const resolved = await resolveMapsLink(value);
      addStopAt(resolved.latitude, resolved.longitude);
      setLinkInput('');
    } catch (err) {
      const code = err instanceof Error ? err.message : 'MAPS_LINK_UNRESOLVED';
      setError(mapsLinkErrorLabel(code));
    } finally {
      setLinkBusy(false);
    }
  }

  function buildPolylineFromStops() {
    const valid = stops.filter((s) => isCoord(s.latitude) && isCoord(s.longitude));
    if (valid.length < 2) {
      setError('Add at least two stops (or click the map) to build a corridor.');
      return;
    }
    const wkt = `LINESTRING(${valid
      .map((s) => `${Number(s.longitude)} ${Number(s.latitude)}`)
      .join(', ')})`;
    setPolyline(wkt);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsedStops: RouteStopInput[] = stops
        .filter((s) => isCoord(s.latitude) && isCoord(s.longitude))
        .map((s) => ({
          name: s.name.trim() || 'Stop',
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          radius_meters: s.radius ? Number(s.radius) : undefined,
        }));
      await createRoute({
        route_code: routeCode,
        name,
        ...(polyline.trim() ? { polyline: polyline.trim() } : {}),
        stops: parsedStops,
      });
      setRouteCode('');
      setName('');
      setPolyline('');
      setStops([emptyStop()]);
      await refresh();
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    if (!window.confirm('Remove this route? It is soft-deleted (kept for audit).')) return;
    setError(null);
    try {
      await deleteRoute(id);
      setRoutes((current) => current.filter((r) => r.id !== id));
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  const savedLines: MapLine[] = routes
    .map((r): MapLine | null => {
      const coordinates = parseLineString(r.polyline);
      return coordinates.length >= 2 ? { id: r.id, coordinates, color: '#c22229' } : null;
    })
    .filter((v): v is MapLine => v !== null);

  const stopMarkers: MapMarker[] = stops
    .map((s, i): MapMarker | null => {
      if (!isCoord(s.latitude) || !isCoord(s.longitude)) return null;
      return { id: i, lat: Number(s.latitude), lng: Number(s.longitude), label: String(i + 1) };
    })
    .filter((v): v is MapMarker => v !== null);

  const draftLine: MapLine | null =
    stopMarkers.length >= 2
      ? {
          id: 'draft',
          coordinates: stopMarkers.map((m) => [m.lng, m.lat] as [number, number]),
          color: '#ffffff',
        }
      : null;

  const mapLines: MapLine[] = [...savedLines, ...(draftLine ? [draftLine] : [])];
  const mapCenter = stopMarkers[0]
    ? { lat: stopMarkers[0].lat, lng: stopMarkers[0].lng }
    : { lat: 9.082, lng: 8.6753 };

  return (
    <OrgShell active="routes" title="ROUTE CONSTRUCTION" subtitle="NETWORK PLANNING">
      {error ? (
        <div className="hairline mb-3 border-error bg-error/5 px-3 py-2 data-mono text-[12px] text-error">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Builder */}
        <div className="flex flex-col gap-4">
          <div className="hairline bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="label-caps text-on-surface-variant">PICK STOPS ON MAP</span>
              <button
                type="button"
                onClick={() => setPicking((p) => !p)}
                className={`label-caps px-3 py-2 transition-colors ${
                  picking
                    ? 'bg-on-tertiary-container text-white'
                    : 'hairline text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined align-middle text-[16px]">
                  {picking ? 'location_on' : 'location_off'}
                </span>{' '}
                {picking ? 'ON — click the map' : 'OFF'}
              </button>
            </div>
            <p className="data-mono text-[11px] text-on-surface-variant">
              {picking
                ? 'Click anywhere on the map to drop a numbered stop. The nearest place is looked up automatically.'
                : 'Map picking is off — turn it on, or type coordinates below.'}
              {naming ? ' Looking up place…' : ''}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStops((c) => (c.length > 1 ? c.slice(0, -1) : c))}
                disabled={stops.length <= 1}
              >
                Undo last stop
              </Button>
              <Button type="button" variant="danger" onClick={() => setStops([emptyStop()])}>
                Clear stops
              </Button>
            </div>
          </div>

          <div className="hairline bg-surface p-4">
            <div className="label-caps mb-2 text-on-surface-variant">ADD FROM GOOGLE MAPS LINK</div>
            <div className="flex gap-2">
              <input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onAddFromLink();
                  }
                }}
                placeholder="https://maps.app.goo.gl/…"
                className="hairline min-w-0 flex-1 bg-surface-dim px-3 py-2 data-mono text-[11px] text-on-surface placeholder:text-outline"
              />
              <Button
                type="button"
                onClick={() => void onAddFromLink()}
                disabled={linkBusy || !linkInput.trim()}
              >
                {linkBusy ? 'Reading…' : 'Add stop'}
              </Button>
            </div>
            <p className="mt-2 data-mono text-[10px] text-on-surface-variant">
              Paste a Google Maps share link (short or full) — the exact coordinates are read and a
              stop is added, named automatically.
            </p>
          </div>

          <div className="hairline bg-surface p-4">
            <div className="label-caps mb-3 text-on-surface-variant">ROUTE DETAILS</div>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Route Code" icon="tag" value={routeCode} onChange={setRouteCode} placeholder="LAG-IB" />
                <Field label="Route Name" icon="route" value={name} onChange={setName} placeholder="Lagos to Ibadan" />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="label-caps text-on-surface-variant">Stops (in order)</span>
                {stops.map((stop, index) => (
                  <div key={index} className="hairline grid grid-cols-12 items-center gap-2 bg-surface-dim p-2">
                    <span className="col-span-1 data-mono text-[12px] font-bold text-on-tertiary-container">
                      {index + 1}
                    </span>
                    <input
                      className="col-span-5 bg-transparent px-1 data-mono text-[11px] text-on-surface placeholder:text-outline"
                      placeholder="Stop name"
                      value={stop.name}
                      onChange={(e) => updateStop(index, { name: e.target.value })}
                    />
                    <input
                      className="col-span-2 bg-transparent px-1 data-mono text-[11px] text-on-surface placeholder:text-outline"
                      placeholder="Lat"
                      value={stop.latitude}
                      onChange={(e) => updateStop(index, { latitude: e.target.value })}
                    />
                    <input
                      className="col-span-2 bg-transparent px-1 data-mono text-[11px] text-on-surface placeholder:text-outline"
                      placeholder="Lng"
                      value={stop.longitude}
                      onChange={(e) => updateStop(index, { longitude: e.target.value })}
                    />
                    <input
                      className="col-span-1 bg-transparent px-1 data-mono text-[11px] text-on-surface placeholder:text-outline"
                      placeholder="R"
                      value={stop.radius}
                      onChange={(e) => updateStop(index, { radius: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setStops((c) => c.filter((_, i) => i !== index))}
                      className="col-span-1 material-symbols-outlined text-[16px] text-on-surface-variant hover:text-error"
                      title="Remove stop"
                    >
                      close
                    </button>
                  </div>
                ))}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStops((c) => [...c, emptyStop()])}
                    className="label-caps flex w-fit items-center gap-1 text-on-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add stop manually
                  </button>
                  <button
                    type="button"
                    onClick={buildPolylineFromStops}
                    className="label-caps flex w-fit items-center gap-1 text-on-tertiary-container hover:underline"
                  >
                    <span className="material-symbols-outlined text-[16px]">polyline</span>
                    Build corridor from stops
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="label-caps text-on-surface-variant">Corridor (WKT LineString, optional)</span>
                <textarea
                  value={polyline}
                  onChange={(e) => setPolyline(e.target.value)}
                  rows={2}
                  placeholder="Built automatically from your stops"
                  className="hairline w-full bg-surface-dim px-3 py-2 data-mono text-[11px] text-on-surface placeholder:text-outline"
                />
              </div>

              <Button type="submit" disabled={busy || !routeCode.trim() || !name.trim()}>
                {busy ? 'Creating…' : 'Create route'}
              </Button>
            </form>
          </div>
        </div>

        {/* Map + saved routes */}
        <div className="flex flex-col gap-4">
          <div className="hairline relative h-[420px] overflow-hidden bg-black">
            <LiveMap
              lines={mapLines}
              markers={stopMarkers}
              center={mapCenter}
              zoom={stopMarkers.length ? 7 : 6}
              height="100%"
              picking={picking}
              {...(picking ? { onMapClick } : {})}
            />
            <div className="pointer-events-none absolute left-3 top-3 border border-outline-variant bg-black/80 px-2 py-1 backdrop-blur-sm">
              <span className="label-caps text-on-surface-variant">
                {picking ? 'CLICK MAP TO ADD STOP' : 'PICKING OFF'}
              </span>
            </div>
          </div>

          <div className="hairline bg-surface">
            <div className="hairline-b flex items-center justify-between border-outline-variant px-4 py-3">
              <span className="label-caps text-on-surface-variant">ROUTE NETWORK</span>
              <span className="data-mono text-[10px] text-on-surface-variant">{routes.length}</span>
            </div>
            <div className="flex max-h-72 flex-col overflow-y-auto">
              {loading ? (
                <div className="p-4 data-mono text-[11px] text-on-surface-variant">Loading routes…</div>
              ) : routes.length === 0 ? (
                <div className="p-4 data-mono text-[11px] text-on-surface-variant">No routes yet.</div>
              ) : (
                routes.map((r) => (
                  <div key={r.id} className="hairline-b border-outline-variant/40 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="data-mono text-[12px] font-bold text-primary">
                        {r.route_code} · {r.name}
                      </span>
                      <button
                        onClick={() => void onDelete(r.id)}
                        className="label-caps flex items-center gap-1 text-on-surface-variant hover:text-error"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                        Remove
                      </button>
                    </div>
                    <div className="data-mono mt-1 text-[10px] text-on-surface-variant">
                      {r.stops.length} stops · {r.polyline ? 'corridor set' : 'no corridor'} ·{' '}
                      {r.is_active ? 'active' : 'inactive'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </OrgShell>
  );
}
