import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getSession,
  clearSession,
  getMyLocations,
  createLocation,
  deleteLocation,
  getMyDispatches,
  updateDispatchStatus,
  errorLabel,
  type ResponderLocation,
  type Dispatch,
  type DispatchStatus,
} from '../lib/api';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { LiveMap, type MapIncident, type MapMarker } from '../components/LiveMap';
import { ThemeToggle } from '../components/ThemeToggle';
import { googleMapsLink, resolveMapsLink, mapsLinkErrorLabel } from '../lib/maps';

function fmt(coord: number): string {
  return coord.toFixed(5);
}

const NEXT_ACTION: Partial<Record<DispatchStatus, { label: string; next: DispatchStatus }>> = {
  PENDING: { label: 'Accept', next: 'ACCEPTED' },
  ACCEPTED: { label: 'En route', next: 'EN_ROUTE' },
  EN_ROUTE: { label: 'On scene', next: 'ON_SCENE' },
  ON_SCENE: { label: 'Complete', next: 'COMPLETED' },
};

function severityColor(severity: string | undefined): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'text-error';
  if (severity === 'MEDIUM') return 'text-amber-300';
  return 'text-cyan-300';
}

export function ResponderDashboard() {
  const session = getSession();

  const [locations, setLocations] = useState<ResponderLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);

  const [branchName, setBranchName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [branchLink, setBranchLink] = useState('');
  const [branchLinkBusy, setBranchLinkBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [locs, dis] = await Promise.all([getMyLocations(), getMyDispatches()]);
      setLocations(locs);
      setDispatches(dis);
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.role === 'RESPONDER') {
      void refresh();
      const id = setInterval(() => void refresh(), 10000);
      return () => clearInterval(id);
    }
  }, [refresh, session?.role]);

  const incidentMarkers = useMemo<MapIncident[]>(() => {
    const seen = new Map<number, MapIncident>();
    for (const d of dispatches) {
      if (!d.incident) continue;
      if (!seen.has(d.incident.id)) {
        seen.set(d.incident.id, {
          id: d.incident.id,
          lat: d.incident.latitude,
          lng: d.incident.longitude,
          severity: d.incident.severity,
        });
      }
    }
    return Array.from(seen.values());
  }, [dispatches]);

  const branchMarkers = useMemo<MapMarker[]>(
    () =>
      locations.map((l) => ({
        id: `b-${l.id}`,
        lat: l.latitude,
        lng: l.longitude,
        label: 'B',
        color: '#22d3ee',
      })),
    [locations],
  );

  const mapCenter = useMemo(() => {
    const firstBranch = locations[0];
    if (firstBranch) return { lat: firstBranch.latitude, lng: firstBranch.longitude };
    const firstIncident = incidentMarkers[0];
    if (firstIncident) return { lat: firstIncident.lat, lng: firstIncident.lng };
    return { lat: 9.082, lng: 8.6753 };
  }, [locations, incidentMarkers]);

  if (!session || session.role !== 'RESPONDER') {
    return <Navigate to="/signin/responder" replace />;
  }

  const responder = session.user as {
    id?: number;
    email?: string;
    name?: string;
    agency_type?: string;
  };

  const openDispatches = dispatches.filter(
    (d) => d.status !== 'COMPLETED' && d.status !== 'DECLINED',
  );
  const acknowledged = dispatches.filter(
    (d) => d.status === 'ACCEPTED' || d.status === 'EN_ROUTE' || d.status === 'ON_SCENE',
  );
  const completed = dispatches.filter((d) => d.status === 'COMPLETED');
  const responses = dispatches
    .map((d) => d.response_minutes)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const avgResponse =
    responses.length > 0 ? responses.reduce((a, b) => a + b, 0) / responses.length : null;
  const activeBranches = locations.filter((l) => l.is_active).length;

  const stats = [
    { label: 'OPEN DISPATCHES', value: String(openDispatches.length), tone: openDispatches.length ? 'text-error' : 'text-cyan-300' },
    { label: 'ACKNOWLEDGED', value: String(acknowledged.length), tone: 'text-cyan-300' },
    { label: 'BRANCHES', value: `${activeBranches}/${locations.length}`, tone: 'text-on-surface' },
    {
      label: 'AVG RESPONSE',
      value: avgResponse !== null ? `${avgResponse.toFixed(1)}m` : '—',
      tone: 'text-on-surface',
    },
  ];

  async function useMyLocation() {
    setLocating(true);
    setError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      setLatitude(String(position.coords.latitude));
      setLongitude(String(position.coords.longitude));
    } catch {
      setError('Unable to read your location. Check browser permissions and enter coords manually.');
    } finally {
      setLocating(false);
    }
  }

  async function onBranchFromLink() {
    const value = branchLink.trim();
    if (!value || branchLinkBusy) return;
    setBranchLinkBusy(true);
    setError(null);
    try {
      const resolved = await resolveMapsLink(value);
      setLatitude(String(resolved.latitude));
      setLongitude(String(resolved.longitude));
      setBranchLink('');
    } catch (err) {
      const code = err instanceof Error ? err.message : 'MAPS_LINK_UNRESOLVED';
      setError(mapsLinkErrorLabel(code));
    } finally {
      setBranchLinkBusy(false);
    }
  }

  async function onAddBranch(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await createLocation({
        branch_name: branchName,
        latitude: Number(latitude),
        longitude: Number(longitude),
      });
      setBranchName('');
      setLatitude('');
      setLongitude('');
      await refresh();
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  async function removeBranch(id: number) {
    setError(null);
    try {
      await deleteLocation(id);
      setLocations((current) => current.filter((l) => l.id !== id));
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  async function advance(dispatch: Dispatch, next: DispatchStatus) {
    setError(null);
    try {
      await updateDispatchStatus(dispatch.id, next);
      await refresh();
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  async function decline(dispatch: Dispatch) {
    setError(null);
    try {
      await updateDispatchStatus(dispatch.id, 'DECLINED');
      await refresh();
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  const formReady =
    branchName.trim().length > 0 &&
    latitude.trim().length > 0 &&
    longitude.trim().length > 0 &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude));

  return (
    <div className="min-h-screen bg-background font-body-md">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-cyan-500/20 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-cyan-400/40 bg-cyan-400/10">
              <span className="material-symbols-outlined text-[19px] text-cyan-300">local_police</span>
            </div>
            <div>
              <div className="text-[15px] font-extrabold leading-none tracking-[0.22em] text-on-surface">
                TRANSIT
              </div>
              <div className="label-caps mt-1 text-[9px] tracking-[0.3em] text-cyan-300/80">
                Responder Control
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="label-caps hidden items-center gap-2 text-[10px] text-cyan-300 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse bg-cyan-300" />
              {responder.agency_type ?? 'UNIT'}
            </span>
            <span className="data-mono hidden text-[10px] text-on-surface-variant md:inline">
              {clock}
            </span>
            <ThemeToggle />
            <button
              onClick={() => {
                clearSession();
                window.location.href = '/';
              }}
              className="label-caps flex items-center gap-1 text-on-surface-variant transition-colors hover:text-error"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        {error ? (
          <div className="mb-4 flex items-center gap-2 border border-error bg-error/5 px-3 py-2">
            <span className="material-symbols-outlined text-[16px] text-error">error</span>
            <span className="data-mono text-[12px] text-error">{error}</span>
          </div>
        ) : null}

        {/* Hero */}
        <div className="mb-5 flex flex-col justify-between gap-4 border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 via-surface to-surface p-5 md:flex-row md:items-center">
          <div>
            <div className="label-caps text-cyan-300/80">CLEARANCE / GRANTED</div>
            <h1 className="mt-1 text-[26px] font-extrabold leading-tight text-on-surface">
              {responder.name ?? 'Responder Unit'}
            </h1>
            <div className="data-mono mt-1 text-[11px] text-on-surface-variant">
              {responder.email} · ID-{responder.id ?? '—'} · {responder.agency_type ?? 'UNIT'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-center">
              <div className="label-caps text-[9px] text-cyan-300/80">STATUS</div>
              <div className={`label-caps mt-1 ${openDispatches.length ? 'text-error' : 'text-cyan-300'}`}>
                {openDispatches.length ? 'ENGAGED' : 'STANDBY'}
              </div>
            </div>
            <div className="border border-outline-variant bg-surface px-4 py-2 text-center">
              <div className="label-caps text-[9px] text-on-surface-variant">COVERAGE</div>
              <div className="data-mono mt-1 text-[13px] text-on-surface">
                {activeBranches} active
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="border border-outline-variant bg-surface p-4">
              <div className="label-caps text-on-surface-variant">{s.label}</div>
              <div className={`data-mono mt-2 text-[26px] font-bold ${s.tone}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Dispatch queue */}
          <section className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="label-caps text-cyan-300">DISPATCH QUEUE</h2>
              <span className="data-mono text-[10px] text-on-surface-variant">
                {openDispatches.length} OPEN / {completed.length} COMPLETED
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {loading ? (
                <div className="border border-outline-variant bg-surface p-4 data-mono text-[12px] text-on-surface-variant">
                  Loading dispatches…
                </div>
              ) : dispatches.length === 0 ? (
                <div className="border border-outline-variant bg-surface p-6 text-center">
                  <span className="material-symbols-outlined text-[28px] text-cyan-300/60">
                    radar
                  </span>
                  <div className="mt-2 data-mono text-[12px] text-on-surface-variant">
                    No dispatches yet. You will be alerted here when an incident occurs near your
                    branches.
                  </div>
                </div>
              ) : (
                dispatches.map((d) => {
                  const incident = d.incident;
                  const active = d.status !== 'COMPLETED' && d.status !== 'DECLINED';
                  return (
                    <div
                      key={d.id}
                      className={`border bg-surface p-4 ${
                        active ? 'border-cyan-500/25' : 'border-outline-variant opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-bold text-on-surface">
                              {incident?.type ?? 'INCIDENT'}
                            </span>
                            <span className={`label-caps ${severityColor(incident?.severity)}`}>
                              {incident?.severity ?? '—'}
                            </span>
                            <span
                              className={`label-caps border px-2 py-0.5 text-[9px] ${
                                active
                                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                  : 'border-outline-variant text-on-surface-variant'
                              }`}
                            >
                              {d.status}
                            </span>
                          </div>
                          <div className="data-mono mt-2 text-[11px] text-on-surface-variant">
                            INC-{d.incident_id}
                            {incident
                              ? ` · ${fmt(incident.latitude)}, ${fmt(incident.longitude)}`
                              : ''}
                            {d.branch_name ? ` · ${d.branch_name}` : ''}
                          </div>
                          {incident?.description ? (
                            <div className="data-mono mt-1 text-[10px] text-on-surface-variant">
                              {incident.description}
                            </div>
                          ) : null}
                          {d.response_minutes !== null ? (
                            <div className="data-mono mt-1 text-[10px] text-cyan-300">
                              Response time {d.response_minutes} min
                            </div>
                          ) : null}
                        </div>
                        {incident ? (
                          <a
                            href={googleMapsLink(incident.latitude, incident.longitude)}
                            target="_blank"
                            rel="noreferrer"
                            className="label-caps flex shrink-0 items-center gap-1 text-cyan-300 hover:underline"
                          >
                            <span className="material-symbols-outlined text-[16px]">near_me</span>
                            Navigate
                          </a>
                        ) : null}
                      </div>

                      {active ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {NEXT_ACTION[d.status] ? (
                            <Button onClick={() => void advance(d, NEXT_ACTION[d.status]!.next)}>
                              {NEXT_ACTION[d.status]!.label}
                            </Button>
                          ) : null}
                          {d.status === 'PENDING' ? (
                            <Button variant="danger" onClick={() => void decline(d)}>
                              Decline
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Coverage map + branches */}
          <aside className="flex flex-col gap-4">
            <div className="border border-outline-variant bg-surface">
              <div className="flex items-center justify-between border-b border-outline-variant px-4 py-2">
                <span className="label-caps text-cyan-300">COVERAGE MAP</span>
                <span className="data-mono text-[9px] text-on-surface-variant">cyan = branches</span>
              </div>
              <div className="h-52 overflow-hidden bg-black">
                <LiveMap
                  markers={branchMarkers}
                  incidents={incidentMarkers}
                  center={mapCenter}
                  zoom={branchMarkers.length || incidentMarkers.length ? 10 : 6}
                  height="100%"
                />
              </div>
            </div>

            <div className="border border-outline-variant bg-surface">
              <div className="flex items-center justify-between border-b border-outline-variant px-4 py-2">
                <span className="label-caps text-cyan-300">BRANCHES</span>
                <span className="data-mono text-[9px] text-on-surface-variant">
                  {activeBranches}/{locations.length} active
                </span>
              </div>
              <div className="flex max-h-52 flex-col overflow-y-auto">
                {locations.length === 0 ? (
                  <div className="p-4 data-mono text-[11px] text-on-surface-variant">
                    No branches yet. Add one below.
                  </div>
                ) : (
                  locations.map((location) => (
                    <div
                      key={location.id}
                      className="flex items-center justify-between border-b border-outline-variant/40 px-4 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12px] font-bold text-on-surface">
                            {location.branch_name}
                          </span>
                          <span
                            className={`label-caps text-[8px] ${
                              location.is_active ? 'text-cyan-300' : 'text-on-surface-variant'
                            }`}
                          >
                            {location.is_active ? 'ACTIVE' : 'OFFLINE'}
                          </span>
                        </div>
                        <div className="data-mono mt-0.5 text-[10px] text-on-surface-variant">
                          {fmt(location.latitude)}, {fmt(location.longitude)}
                        </div>
                      </div>
                      <button
                        onClick={() => void removeBranch(location.id)}
                        className="material-symbols-outlined text-[16px] text-on-surface-variant hover:text-error"
                        title="Remove branch"
                      >
                        delete
                      </button>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={onAddBranch} className="flex flex-col gap-3 border-t border-outline-variant p-4">
                <Field
                  label="Branch Name"
                  icon="location_on"
                  value={branchName}
                  onChange={setBranchName}
                  placeholder="Lagos Island Command"
                />
                <div className="flex flex-col gap-1.5">
                  <span className="label-caps text-[9px] text-on-surface-variant">
                    Paste Google Maps link (optional)
                  </span>
                  <div className="flex gap-2">
                    <input
                      value={branchLink}
                      onChange={(e) => setBranchLink(e.target.value)}
                      placeholder="https://maps.app.goo.gl/…"
                      className="hairline min-w-0 flex-1 bg-surface-dim px-2 py-2 data-mono text-[10px] text-on-surface placeholder:text-outline"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void onBranchFromLink()}
                      disabled={branchLinkBusy || !branchLink.trim()}
                      className="!px-2 !py-2"
                    >
                      {branchLinkBusy ? '…' : 'Use'}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Latitude"
                    icon="pin_drop"
                    value={latitude}
                    onChange={setLatitude}
                    placeholder="6.5244"
                  />
                  <Field
                    label="Longitude"
                    icon="pin_drop"
                    value={longitude}
                    onChange={setLongitude}
                    placeholder="3.3792"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void useMyLocation()}
                    disabled={locating}
                    className="flex-1"
                  >
                    {locating ? 'Locating…' : 'Use location'}
                  </Button>
                  <Button type="submit" disabled={busy || !formReady} className="flex-1">
                    {busy ? 'Adding…' : 'Add branch'}
                  </Button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
