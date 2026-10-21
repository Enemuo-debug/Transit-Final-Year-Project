import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  getSession,
  getMyBuses,
  getRoutes,
  getJourneys,
  createJourney,
  endJourney,
  deleteJourney,
  errorLabel,
  type Bus,
  type Route,
  type Journey,
} from '../lib/api';
import { OrgShell } from '../components/OrgShell';
import { Button } from '../components/Button';

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-green-400',
  SCHEDULED: 'text-amber-300',
  COMPLETED: 'text-on-surface-variant',
  CANCELLED: 'text-error',
};

export function OrgJourneys() {
  const session = getSession();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [busId, setBusId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [b, r, j] = await Promise.all([getMyBuses(), getRoutes(), getJourneys()]);
      setBuses(b);
      setRoutes(r);
      setJourneys(j);
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

  const activeBusIds = new Set(
    journeys
      .filter((j) => j.status === 'ACTIVE' || j.status === 'SCHEDULED')
      .map((j) => j.bus_id),
  );
  const assignableBuses = buses.filter(
    (b) => b.status !== 'MAINTENANCE' && b.status !== 'ON_JOURNEY' && !activeBusIds.has(b.id),
  );
  const unavailableCount = buses.length - assignableBuses.length;

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await createJourney({ bus_id: Number(busId), route_id: Number(routeId) });
      setBusId('');
      setRouteId('');
      await refresh();
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  async function onEnd(id: number, status: 'COMPLETED' | 'CANCELLED') {
    setError(null);
    try {
      await endJourney(id, status);
      await refresh();
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  async function onDeleteJourney(id: number) {
    if (!window.confirm('Remove this journey from the log? It is soft-deleted (kept for audit).')) {
      return;
    }
    setError(null);
    try {
      await deleteJourney(id);
      await refresh();
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  return (
    <OrgShell active="journeys" title="JOURNEY EXECUTION" subtitle="TRANSIT OPERATIONS">
      {error ? (
        <div className="hairline mb-3 border-error bg-error/5 px-3 py-2 data-mono text-[12px] text-error">
          {error}
        </div>
      ) : null}

      <div className="hairline mb-4 bg-surface p-4">
        <div className="label-caps mb-1 text-on-surface-variant">ASSIGN BUS TO ROUTE</div>
        <p className="mb-3 data-mono text-[10px] text-on-surface-variant">
          Creates a <span className="text-amber-300">SCHEDULED</span> journey and locks the bus. The
          driver starts it from their device.
        </p>
        <form onSubmit={onStart} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="label-caps text-on-surface-variant">Bus</span>
            <select
              value={busId}
              onChange={(e) => setBusId(e.target.value)}
              className="hairline min-w-44 bg-surface-dim px-3 py-2 data-mono text-[12px] text-on-surface"
            >
              <option value="">Select bus…</option>
              {assignableBuses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.plate_number} ({b.status})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps text-on-surface-variant">Route</span>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="hairline min-w-44 bg-surface-dim px-3 py-2 data-mono text-[12px] text-on-surface"
            >
              <option value="">Select route…</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.route_code} · {r.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy || !busId || !routeId}>
            {busy ? 'Creating…' : 'Create journey'}
          </Button>
        </form>
        {buses.length === 0 || routes.length === 0 ? (
          <div className="data-mono mt-2 text-[10px] text-on-surface-variant">
            You need at least one bus and one route before starting a journey.
          </div>
        ) : unavailableCount > 0 ? (
          <div className="data-mono mt-2 text-[10px] text-on-surface-variant">
            {unavailableCount} bus(es) unavailable — already on a journey or in maintenance.
          </div>
        ) : null}
      </div>

      <div className="hairline bg-surface">
        <div className="hairline-b flex items-center justify-between border-outline-variant px-4 py-3">
          <span className="label-caps text-on-surface-variant">JOURNEY LOG</span>
          <span className="data-mono text-[10px] text-on-surface-variant">{journeys.length}</span>
        </div>
        <div className="flex flex-col">
          {loading ? (
            <div className="p-4 data-mono text-[11px] text-on-surface-variant">Loading journeys…</div>
          ) : journeys.length === 0 ? (
            <div className="p-4 data-mono text-[11px] text-on-surface-variant">No journeys recorded.</div>
          ) : (
            journeys.map((j) => (
              <div key={j.id} className="hairline-b flex items-center justify-between border-outline-variant/40 px-4 py-3">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="data-mono text-[13px] font-bold text-primary">
                      {j.plate_number ?? `BUS-${j.bus_id}`}
                    </span>
                    <span className="data-mono text-[11px] text-on-surface-variant">
                      {j.route_code ?? '—'} · {j.route_name ?? ''}
                    </span>
                    <span className={`label-caps ${STATUS_TONE[j.status] ?? 'text-on-surface-variant'}`}>
                      {j.status}
                    </span>
                  </div>
                  <div className="data-mono mt-1 text-[10px] text-on-surface-variant">
                    started {j.started_at ? new Date(j.started_at).toLocaleString() : '—'}
                    {j.ended_at ? ` · ended ${new Date(j.ended_at).toLocaleString()}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/dashboard/organization/journeys/${j.id}`}
                    className="label-caps flex items-center gap-1 text-on-tertiary-container hover:underline"
                  >
                    <span className="material-symbols-outlined text-[16px]">my_location</span>
                    Live view
                  </Link>
                  {j.status === 'ACTIVE' ? (
                    <Button variant="outline" onClick={() => void onEnd(j.id, 'COMPLETED')}>
                      Complete
                    </Button>
                  ) : null}
                  {j.status === 'ACTIVE' || j.status === 'SCHEDULED' ? (
                    <Button variant="danger" onClick={() => void onEnd(j.id, 'CANCELLED')}>
                      Cancel
                    </Button>
                  ) : null}
                  <button
                    onClick={() => void onDeleteJourney(j.id)}
                    className="label-caps flex items-center gap-1 text-on-surface-variant transition-colors hover:text-error"
                    title="Soft-delete journey (kept for audit)"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </OrgShell>
  );
}
