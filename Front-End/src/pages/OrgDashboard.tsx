import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getSession,
  getMyBuses,
  getRoutes,
  getJourneys,
  getIncidents,
  errorLabel,
  type Bus,
  type Route,
  type Journey,
  type Incident,
} from '../lib/api';
import { useLivePositions } from '../lib/telemetry';
import { LiveMap, type MapIncident, type MapLine } from '../components/LiveMap';
import { OrgShell } from '../components/OrgShell';
import { parseLineString } from '../lib/maps';

function fmt(coord: number): string {
  return coord.toFixed(4);
}

function severityTone(severity: string): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'text-error';
  if (severity === 'MEDIUM') return 'text-amber-300';
  return 'text-on-surface-variant';
}

export function OrgDashboard() {
  const session = getSession();
  const { positions, connected } = useLivePositions();

  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, r, j, i] = await Promise.all([
        getMyBuses(),
        getRoutes(),
        getJourneys('ACTIVE'),
        getIncidents({ limit: 25 }),
      ]);
      setBuses(b);
      setRoutes(r);
      setJourneys(j);
      setIncidents(i);
      setError(null);
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }, []);

  useEffect(() => {
    if (session?.role === 'COMPANY') {
      void load();
      const id = setInterval(() => void load(), 10000);
      return () => clearInterval(id);
    }
  }, [load, session?.role]);

  if (!session || session.role !== 'COMPANY') {
    return <Navigate to="/signin/organization" replace />;
  }

  const openIncidents = incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'FALSE_ALARM');
  const live = positions[0];
  const lat = live?.lat ?? 9.082;
  const lng = live?.lng ?? 8.6753;

  const mapLines: MapLine[] = journeys
    .map((j): MapLine | null => {
      const route = routes.find((r) => r.id === j.route_id);
      const coordinates = parseLineString(route?.polyline);
      return coordinates.length >= 2 ? { id: j.id, coordinates, color: '#c22229' } : null;
    })
    .filter((v): v is MapLine => v !== null);

  const mapIncidents: MapIncident[] = openIncidents.map((i) => ({
    id: i.id,
    lat: i.latitude,
    lng: i.longitude,
    severity: i.severity,
  }));

  const stats = [
    { label: 'ACTIVE JOURNEYS', value: journeys.length, tone: 'text-primary' },
    { label: 'OPEN INCIDENTS', value: openIncidents.length, tone: openIncidents.length ? 'text-error' : 'text-primary' },
    { label: 'FLEET SIZE', value: buses.length, tone: 'text-primary' },
    { label: 'LIVE TRACKED', value: positions.length, tone: connected ? 'text-green-400' : 'text-on-surface-variant' },
  ];

  return (
    <OrgShell
      active="dashboard"
      title="COMMAND DASHBOARD"
      subtitle="LIVE OPERATIONS"
      actions={
        <span className={`label-caps flex items-center gap-2 ${connected ? 'text-green-400' : 'text-on-surface-variant'}`}>
          <span className={`h-2 w-2 ${connected ? 'animate-pulse bg-green-400' : 'bg-outline'}`} />
          {connected ? 'TELEMETRY LIVE' : 'TELEMETRY OFFLINE'}
        </span>
      }
    >
      {error ? (
        <div className="hairline mb-3 border-error bg-error/5 px-3 py-2 data-mono text-[12px] text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="hairline bg-surface p-4">
            <div className="label-caps text-on-surface-variant">{s.label}</div>
            <div className={`data-mono mt-2 text-[28px] font-bold ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="hairline relative h-[420px] overflow-hidden bg-black">
            <LiveMap
              positions={positions}
              lines={mapLines}
              incidents={mapIncidents}
              center={{ lat, lng }}
              zoom={12}
              height="100%"
            />
            <div className="pointer-events-none absolute left-3 top-3 border border-outline-variant bg-black/80 p-2 backdrop-blur-sm">
              <div className="label-caps text-on-surface-variant">
                LOC {fmt(lat)}, {fmt(lng)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="hairline bg-surface">
            <div className="hairline-b flex items-center justify-between border-outline-variant px-4 py-3">
              <span className="label-caps text-on-surface-variant">ACTIVE INCIDENTS</span>
              <span className="data-mono text-[10px] text-on-surface-variant">{openIncidents.length}</span>
            </div>
            <div className="flex max-h-56 flex-col overflow-y-auto">
              {openIncidents.length === 0 ? (
                <div className="p-4 data-mono text-[11px] text-on-surface-variant">
                  No active incidents. All clear.
                </div>
              ) : (
                openIncidents.slice(0, 6).map((i) => (
                  <div key={i.id} className="hairline-b border-outline-variant/40 px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className={`label-caps ${severityTone(i.severity)}`}>{i.type}</span>
                      <span className="data-mono text-[10px] text-on-surface-variant">{i.status}</span>
                    </div>
                    <div className="data-mono mt-1 text-[10px] text-on-surface-variant">
                      {i.plate_number ?? `BUS-${i.bus_id}`} · {fmt(i.latitude)}, {fmt(i.longitude)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="hairline bg-surface">
            <div className="hairline-b flex items-center justify-between border-outline-variant px-4 py-3">
              <span className="label-caps text-on-surface-variant">LIVE ASSETS</span>
              <span className="data-mono text-[10px] text-on-surface-variant">{positions.length} tracking</span>
            </div>
            <div className="flex max-h-56 flex-col overflow-y-auto">
              {positions.length === 0 ? (
                <div className="p-4 data-mono text-[11px] text-on-surface-variant">
                  No vehicles reporting position.
                </div>
              ) : (
                positions.map((p) => (
                  <div key={p.deviceId} className="hairline-b border-outline-variant/40 px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className="data-mono text-[12px] font-bold text-primary">{p.deviceId}</span>
                      <span className="data-mono text-[10px] text-on-surface-variant">
                        {new Date(p.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="data-mono mt-1 text-[10px] text-on-surface-variant">
                      {fmt(p.lat)}, {fmt(p.lng)} · {p.speed.toFixed(0)} km/h
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
