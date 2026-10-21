import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getSession,
  getIncidents,
  getIncidentDispatches,
  updateIncidentStatus,
  errorLabel,
  type Incident,
  type IncidentStatus,
  type Dispatch,
} from '../lib/api';
import { OrgShell } from '../components/OrgShell';
import { Button } from '../components/Button';
import { LiveMap, type MapIncident } from '../components/LiveMap';
import { googleMapsLink } from '../lib/maps';

const FILTERS: Array<{ key: string; label: string; status?: IncidentStatus }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open', status: 'OPEN' },
  { key: 'dispatched', label: 'Dispatched', status: 'DISPATCHED' },
  { key: 'progress', label: 'In progress', status: 'IN_PROGRESS' },
  { key: 'resolved', label: 'Resolved', status: 'RESOLVED' },
];

function severityClass(severity: string): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'text-error';
  if (severity === 'MEDIUM') return 'text-amber-300';
  return 'text-on-surface-variant';
}

function dispatchTone(status: string): string {
  if (status === 'COMPLETED') return 'text-green-400';
  if (status === 'DECLINED') return 'text-error';
  if (status === 'PENDING') return 'text-on-surface-variant';
  return 'text-amber-300';
}

export function OrgIncidents() {
  const session = getSession();
  const [filter, setFilter] = useState('all');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (key: string) => {
      try {
        const active = FILTERS.find((f) => f.key === key);
        const list = await getIncidents({ limit: 100, ...(active?.status ? { status: active.status } : {}) });
        setIncidents(list);
        setError(null);
        return list;
      } catch (err) {
        setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const selectIncident = useCallback(async (incident: Incident) => {
    setSelected(incident);
    try {
      setDispatches(await getIncidentDispatches(incident.id));
    } catch {
      setDispatches([]);
    }
  }, []);

  useEffect(() => {
    if (session?.role === 'COMPANY') {
      void load(filter);
      const id = setInterval(() => void load(filter), 10000);
      return () => clearInterval(id);
    }
  }, [filter, load, session?.role]);

  if (!session || session.role !== 'COMPANY') {
    return <Navigate to="/signin/organization" replace />;
  }

  async function changeStatus(status: IncidentStatus) {
    if (!selected) return;
    setError(null);
    try {
      const updated = await updateIncidentStatus(selected.id, status);
      setSelected(updated);
      await load(filter);
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  const mapIncidents: MapIncident[] = incidents.map((i) => ({
    id: i.id,
    lat: i.latitude,
    lng: i.longitude,
    severity: i.severity,
  }));

  return (
    <OrgShell active="incidents" title="EMERGENCY DISPATCH" subtitle="INCIDENT COMMAND">
      {error ? (
        <div className="hairline mb-3 border-error bg-error/5 px-3 py-2 data-mono text-[12px] text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`label-caps px-3 py-2 transition-colors ${
              filter === f.key
                ? 'bg-primary text-on-primary'
                : 'hairline text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="hairline bg-surface xl:col-span-1">
          <div className="hairline-b border-outline-variant px-4 py-3 label-caps text-on-surface-variant">
            INCIDENT FEED ({incidents.length})
          </div>
          <div className="flex max-h-[600px] flex-col overflow-y-auto">
            {loading ? (
              <div className="p-4 data-mono text-[11px] text-on-surface-variant">Loading incidents…</div>
            ) : incidents.length === 0 ? (
              <div className="p-4 data-mono text-[11px] text-on-surface-variant">No incidents in this view.</div>
            ) : (
              incidents.map((i) => (
                <button
                  key={i.id}
                  onClick={() => void selectIncident(i)}
                  className={`hairline-b border-outline-variant/40 px-4 py-3 text-left transition-colors hover:bg-surface-container-high ${
                    selected?.id === i.id ? 'bg-surface-container-high' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`label-caps ${severityClass(i.severity)}`}>{i.type}</span>
                    <span className="data-mono text-[10px] text-on-surface-variant">{i.status}</span>
                  </div>
                  <div className="data-mono mt-1 text-[10px] text-on-surface-variant">
                    {i.plate_number ?? `BUS-${i.bus_id}`} · {new Date(i.detected_at).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-2">
          <div className="hairline h-[260px] overflow-hidden bg-black">
            <LiveMap
              incidents={mapIncidents}
              center={
                mapIncidents[0]
                  ? { lat: mapIncidents[0].lat, lng: mapIncidents[0].lng }
                  : { lat: 9.082, lng: 8.6753 }
              }
              zoom={mapIncidents.length ? 9 : 6}
              height="100%"
            />
          </div>

          {selected ? (
            <div className="hairline bg-surface p-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className={`text-headline-sm font-bold ${severityClass(selected.severity)}`}>
                      {selected.type}
                    </span>
                    <span className="label-caps text-on-surface-variant">{selected.status}</span>
                    <span className="label-caps text-on-surface-variant">{selected.severity}</span>
                  </div>
                  <div className="data-mono mt-1 text-[11px] text-on-surface-variant">
                    {selected.plate_number ?? `BUS-${selected.bus_id}`} · detected{' '}
                    {new Date(selected.detected_at).toLocaleString()}
                  </div>
                </div>
                <a
                  href={googleMapsLink(selected.latitude, selected.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="label-caps flex items-center gap-1 text-on-tertiary-container hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">near_me</span>
                  Navigate
                </a>
              </div>

              {selected.description ? (
                <p className="hairline mb-3 bg-surface-dim p-3 data-mono text-[11px] text-on-surface">
                  {selected.description}
                </p>
              ) : null}

              <div className="mb-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void changeStatus('IN_PROGRESS')}>
                  Mark in progress
                </Button>
                <Button onClick={() => void changeStatus('RESOLVED')}>Resolve</Button>
                <Button variant="danger" onClick={() => void changeStatus('FALSE_ALARM')}>
                  False alarm
                </Button>
              </div>

              <div className="label-caps mb-2 text-on-surface-variant">DISPATCHED RESPONDERS</div>
              <div className="flex flex-col">
                {dispatches.length === 0 ? (
                  <div className="data-mono text-[11px] text-on-surface-variant">No dispatches recorded.</div>
                ) : (
                  dispatches.map((d) => (
                    <div
                      key={d.id}
                      className="hairline-b flex items-center justify-between border-outline-variant/40 py-2"
                    >
                      <div>
                        <span className="data-mono text-[12px] text-on-surface">
                          {d.responder_name ?? `Responder ${d.responder_id}`}
                        </span>
                        <span className="data-mono ml-2 text-[10px] text-on-surface-variant">
                          {d.branch_name ?? ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`label-caps ${dispatchTone(d.status)}`}>{d.status}</span>
                        <span className="data-mono text-[10px] text-on-surface-variant">
                          {d.response_minutes !== null ? `${d.response_minutes} min` : '—'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="hairline bg-surface p-6 data-mono text-[11px] text-on-surface-variant">
              Select an incident to view dispatch details and response times.
            </div>
          )}
        </div>
      </div>
    </OrgShell>
  );
}
