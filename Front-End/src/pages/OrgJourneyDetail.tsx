import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { Navigate, useParams, Link } from 'react-router-dom';
import {
  getSession,
  getJourney,
  getRoutes,
  getRouteCorridor,
  errorLabel,
  type Journey,
  type Route,
} from '../lib/api';
import { useLivePositions } from '../lib/telemetry';
import { OrgShell } from '../components/OrgShell';
import { LiveMap, type MapLine, type MapMarker, type MapVehicle } from '../components/LiveMap';
import { parseLineString } from '../lib/maps';

function fmt(coord: number): string {
  return coord.toFixed(5);
}

function statusTone(status: string): string {
  if (status === 'ACTIVE') return 'text-green-400';
  if (status === 'CANCELLED') return 'text-error';
  if (status === 'COMPLETED') return 'text-on-surface-variant';
  return 'text-amber-300';
}

export function OrgJourneyDetail() {
  const session = getSession();
  const { id } = useParams();
  const journeyId = Number(id);

  const [journey, setJourney] = useState<Journey | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [corridor, setCorridor] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(Date.now());

  const { positions, connected } = useLivePositions();

  useEffect(() => {
    if (session?.role !== 'COMPANY' || !Number.isInteger(journeyId)) return;
    void (async () => {
      try {
        const j = await getJourney(journeyId);
        setJourney(j);
        const routes = await getRoutes();
        setRoute(routes.find((r) => r.id === j.route_id) ?? null);
      } catch (err) {
        setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
      }
    })();
  }, [journeyId, session?.role]);

  useEffect(() => {
    if (!route) {
      setCorridor(null);
      return;
    }

    let disposed = false;
    getRouteCorridor(route.id)
      .then((data) => {
        if (!disposed) setCorridor(data);
      })
      .catch(() => {
        if (!disposed) setCorridor(null);
      });

    return () => {
      disposed = true;
    };
  }, [route?.id]);

  useEffect(() => {
    if (journey?.status === 'COMPLETED') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [journey?.status]);

  // Keep the status fresh when a journey auto-completes at its destination.
  useEffect(() => {
    if (session?.role !== 'COMPANY' || !Number.isInteger(journeyId)) return;
    const timer = setInterval(() => {
      getJourney(journeyId)
        .then((next) => setJourney(next))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [journeyId, session?.role]);

  if (!session || session.role !== 'COMPANY') {
    return <Navigate to="/signin/organization" replace />;
  }

  const live = journey
    ? positions
        .filter((p) => p.deviceId === journey.plate_number)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
    : undefined;

  const routeLine: MapLine | null = useMemo(() => {
    const coords = parseLineString(route?.polyline);
    return coords.length >= 2 ? { id: 'route', coordinates: coords, color: '#1a73e8' } : null;
  }, [route?.polyline]);

  const stopMarkers: MapMarker[] = useMemo(
    () =>
      (route?.stops ?? []).map((s) => ({
        id: s.stop_id,
        lat: s.latitude,
        lng: s.longitude,
        label: String(s.stop_order),
        color: '#1a73e8',
      })),
    [route],
  );

  const vehicle: MapVehicle | undefined = live ? { lat: live.lat, lng: live.lng } : undefined;

  const firstStop = route?.stops[0];
  const routeCenter = firstStop
    ? { lat: firstStop.latitude, lng: firstStop.longitude }
    : { lat: 9.082, lng: 8.6753 };

  const followCenter = follow && vehicle ? { lat: vehicle.lat, lng: vehicle.lng } : routeCenter;
  const followZoom = follow && vehicle ? 15 : 9;

  const parsedEnd = journey?.ended_at ? Date.parse(journey.ended_at) : now;
  const journeyEnd = Number.isFinite(parsedEnd) ? parsedEnd : now;
  const elapsed = journey?.started_at
    ? Math.max(0, Math.floor((journeyEnd - new Date(journey.started_at).getTime()) / 1000))
    : null;
  const mm = elapsed !== null ? String(Math.floor(elapsed / 60)).padStart(2, '0') : '--';
  const ss = elapsed !== null ? String(elapsed % 60).padStart(2, '0') : '--';

  return (
    <OrgShell
      active="journeys"
      title={journey ? `JOURNEY #${journey.id}` : 'JOURNEY'}
      subtitle={journey ? `${journey.route_code ?? ''} · ${journey.plate_number ?? ''}` : 'LIVE TRACKING'}
      actions={
        <Link
          to="/dashboard/organization/journeys"
          className="label-caps flex items-center gap-1 text-on-surface-variant hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          All journeys
        </Link>
      }
    >
      {error ? (
        <div className="hairline mb-3 border-error bg-error/5 px-3 py-2 data-mono text-[12px] text-error">
          {error}
        </div>
      ) : null}

      {!journey && !error ? (
        <div className="hairline mb-3 bg-surface p-4 data-mono text-[12px] text-on-surface-variant">
          Loading journey…
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="hairline relative h-[560px] overflow-hidden bg-black">
            <LiveMap
              lines={routeLine ? [routeLine] : []}
              corridor={corridor}
              markers={stopMarkers}
              {...(vehicle ? { vehicle } : {})}
              center={followCenter}
              zoom={followZoom}
              height="100%"
            />
            <div className="pointer-events-none absolute left-3 top-3 border border-outline-variant bg-surface/90 px-2 py-1 backdrop-blur-sm">
              <span className="label-caps text-on-surface-variant">
                {live ? 'LIVE TRACKING' : 'AWAITING TELEMETRY'}
              </span>
            </div>
            <button
              onClick={() => setFollow((f) => !f)}
              className={`absolute bottom-3 right-3 flex items-center gap-1 border px-3 py-2 backdrop-blur-sm transition-colors ${
                follow
                  ? 'border-[#1a73e8] bg-[#1a73e8] text-white'
                  : 'border-outline-variant bg-surface/90 text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {follow ? 'my_location' : 'location_searching'}
              </span>
              <span className="label-caps">{follow ? 'Following' : 'Follow'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="hairline bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="label-caps text-on-surface-variant">JOURNEY STATUS</span>
              <span className={`label-caps ${statusTone(journey?.status ?? '')}`}>
                {journey?.status ?? '—'}
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="label-caps text-on-surface-variant">ELAPSED</div>
                <div className="data-mono text-[34px] font-bold text-on-surface">
                  {mm}:{ss}
                </div>
              </div>
              <div className="text-right">
                <div className="label-caps text-on-surface-variant">TELEMETRY</div>
                <div className={`data-mono text-[13px] ${connected ? 'text-green-400' : 'text-on-surface-variant'}`}>
                  {connected ? 'LIVE' : 'OFFLINE'}
                </div>
              </div>
            </div>
          </div>

          <div className="hairline bg-surface p-5">
            <div className="label-caps mb-2 text-on-surface-variant">VEHICLE</div>
            <div className="data-mono text-[15px] font-bold text-on-surface">
              {journey?.plate_number ?? '—'}
            </div>
            {vehicle ? (
              <div className="mt-2 grid grid-cols-2 gap-2 data-mono text-[12px] text-on-surface">
                <span>LAT {fmt(vehicle.lat)}</span>
                <span>LNG {fmt(vehicle.lng)}</span>
                <span>ACC ±{live ? live.accuracy.toFixed(0) : '—'} m</span>
                <span>{live ? 'GPS' : '—'}</span>
                <span className="col-span-2 text-on-surface-variant">
                  updated {live ? new Date(live.timestamp).toLocaleTimeString() : '—'}
                </span>
              </div>
            ) : (
              <div className="mt-2 data-mono text-[11px] text-on-surface-variant">
                {journey?.status === 'ACTIVE'
                  ? 'Waiting for the driver device to stream a position.'
                  : 'This journey is not currently streaming.'}
              </div>
            )}
          </div>

          <div className="hairline bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="label-caps text-on-surface-variant">ROUTE</span>
              <span className="data-mono text-[10px] text-on-surface-variant">
                {(route?.stops ?? []).length} STOPS
              </span>
            </div>
            <div className="mt-1 data-mono text-[13px] text-on-surface">
              {journey?.route_code ?? '—'} · {journey?.route_name ?? ''}
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {(route?.stops ?? []).map((s) => (
                <div key={s.stop_id} className="data-mono text-[12px] text-on-surface-variant">
                  <span className="text-on-tertiary-container">{s.stop_order}.</span> {s.name}
                </div>
              ))}
              {(route?.stops ?? []).length === 0 ? (
                <div className="data-mono text-[10px] text-on-surface-variant">No stops defined.</div>
              ) : null}
            </div>
          </div>

          {journey?.started_at ? (
            <div className="hairline bg-surface p-4 data-mono text-[11px] text-on-surface-variant">
              Started {new Date(journey.started_at).toLocaleString()}
              {journey.ended_at ? ` · Ended ${new Date(journey.ended_at).toLocaleString()}` : ''}
            </div>
          ) : null}
        </div>
      </div>
    </OrgShell>
  );
}
