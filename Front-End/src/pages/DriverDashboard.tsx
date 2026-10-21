import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  getSession,
  clearSession,
  sendPosition,
  updateDriverStatus,
  raiseSos,
  getMyJourney,
  getDriverBus,
  startMyJourney,
  endMyJourney,
  errorLabel,
  type DriverJourneyResult,
} from '../lib/api';

const STATUSES = [
  { key: 'ACTIVE', label: 'AVAILABLE', hint: 'Ready for assignment' },
  { key: 'OFFLINE', label: 'STANDBY', hint: 'Not in service' },
  { key: 'MAINTENANCE', label: 'WORKSHOP', hint: 'In workshop' },
] as const;

type BusStatus = typeof STATUSES[number]['key'];

interface TrackState {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: string;
}

export function DriverDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const [status, setStatus] = useState<BusStatus>('ACTIVE');
  const [tracking, setTracking] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<TrackState | null>(null);
  const [sending, setSending] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);
  const [sosMessage, setSosMessage] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<DriverJourneyResult | null>(null);
  const [journeyBusy, setJourneyBusy] = useState(false);
  const watchRef = useRef<number | null>(null);
  const lastSendRef = useRef<number>(0);
  const sendingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  useEffect(() => {
    if (session?.role !== 'DRIVER') return;
    let disposed = false;
    const load = () => {
      getMyJourney()
        .then((result) => {
          if (!disposed) setAssigned(result);
        })
        .catch(() => {});
      getDriverBus()
        .then((bus) => {
          if (disposed) return;
          if (bus.status === 'ACTIVE' || bus.status === 'OFFLINE' || bus.status === 'MAINTENANCE') {
            setStatus(bus.status);
          }
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [session?.role]);

  if (!session || session.role !== 'DRIVER') {
    return <Navigate to="/signin/driver" replace />;
  }

  const user = session.user as {
    plate_number?: string;
    session_code?: string;
    busId?: number;
  };

  const assignedJourney = assigned?.journey ?? null;
  const onJourney =
    assignedJourney?.status === 'SCHEDULED' || assignedJourney?.status === 'ACTIVE';

  async function pushTrack(sample: TrackState) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await sendPosition({
        lat: sample.lat,
        lng: sample.lng,
        speed: sample.speed,
        heading: sample.heading,
      });
    } catch {
      // transient, telemetry will retry on next interval
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handlePosition(pos: GeolocationPosition) {
    const now = Date.now();
    if (now - lastSendRef.current < 3000) return;
    lastSendRef.current = now;
    const sample: TrackState = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      speed: pos.coords.speed ?? 0,
      heading: pos.coords.heading ?? 0,
      timestamp: new Date().toISOString(),
    };
    setLastUpdate(sample);
    void pushTrack(sample);
  }

  function handleGeoError(err: GeolocationPositionError) {
    setGeoError(
      err.message || 'Unable to access location. Enable GPS and grant location permission.',
    );
    setTracking(false);
  }

  function startTracking() {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('This device does not support GPS tracking.');
      return;
    }
    setTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleGeoError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function stopTracking() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setTracking(false);
  }

  async function onStatusChange(next: BusStatus) {
    setStatus(next);
    setApiError(null);
    try {
      await updateDriverStatus(next);
    } catch (err) {
      setApiError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  async function currentCoords(): Promise<{ lat: number; lng: number } | null> {
    if (lastUpdate) return { lat: lastUpdate.lat, lng: lastUpdate.lng };
    if (!('geolocation' in navigator)) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  async function onSos() {
    setSosBusy(true);
    setSosMessage(null);
    try {
      const coords = await currentCoords();
      if (!coords) {
        setSosMessage('Could not determine your location. Enable GPS and try again.');
        return;
      }
      const incident = await raiseSos({ latitude: coords.lat, longitude: coords.lng });
      setSosMessage(
        incident.deduplicated
          ? `SOS already active (incident #${incident.id}). Help is being coordinated.`
          : `SOS transmitted (incident #${incident.id}). Responders are being alerted.`,
      );
    } catch (err) {
      setSosMessage(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setSosBusy(false);
    }
  }

  async function refreshAssigned() {
    try {
      setAssigned(await getMyJourney());
    } catch {
      // ignore
    }
  }

  async function onStartJourney() {
    if (journeyBusy) return;
    setJourneyBusy(true);
    setApiError(null);
    try {
      await startMyJourney();
      await refreshAssigned();
    } catch (err) {
      setApiError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setJourneyBusy(false);
    }
  }

  async function onEndJourney() {
    if (journeyBusy) return;
    setJourneyBusy(true);
    setApiError(null);
    try {
      await endMyJourney();
      await refreshAssigned();
    } catch (err) {
      setApiError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setJourneyBusy(false);
    }
  }

  return (
    <div className="grid-bg mask-b min-h-screen bg-background">
      <header className="hairline-b flex items-center justify-between bg-background/85 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-tertiary-container">
            local_shipping
          </span>
          <span className="font-display-lg text-display-lg font-bold tracking-tighter text-primary">
            TRANSIT
          </span>
        </div>
        <button
          onClick={() => {
            clearSession();
            navigate('/');
          }}
          className="label-caps flex items-center gap-2 text-on-surface-variant transition-colors hover:text-error"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          Sign out
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[512px] flex-col gap-4 px-5 pb-16 pt-8">
        {/* Linked vehicle */}
        <div className="hairline bg-surface p-4">
          <div className="label-caps text-on-surface-variant">LINKED ASSET</div>
          <div className="mt-1 flex items-end justify-between">
            <div className="data-mono text-[26px] font-bold tracking-[0.15em] text-on-surface">
              {user.plate_number ?? '—'}
            </div>
            <div className="data-mono text-[12px] text-on-surface-variant">
              SESSION {user.session_code ?? '—'}
            </div>
          </div>
          <div
            className={`mt-2 flex items-center gap-2 text-[11px] ${
              tracking ? 'text-green-500' : 'text-on-surface-variant'
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${tracking ? 'animate-pulse bg-green-500' : 'bg-outline'}`}
            />
            {tracking ? 'LIVE GPS STREAMING' : 'TRACKING OFF'}
          </div>
        </div>

        {/* Assigned journey */}
        <div className="hairline bg-surface p-4">
          <div className="label-caps text-on-surface-variant">ASSIGNED JOURNEY</div>
          {assigned?.journey ? (
            <div className="mt-1">
              <div className="flex items-end justify-between">
                <div className="data-mono text-[18px] font-bold text-on-surface">
                  {assigned.journey.route_code ?? '—'}
                </div>
                <span className="label-caps text-green-400">{assigned.journey.status}</span>
              </div>
              <div className="data-mono text-[11px] text-on-surface-variant">
                {assigned.journey.route_name ?? ''}
              </div>
              <div className="mt-2 flex flex-col gap-1">
                {assigned.stops.map((s) => (
                  <div key={s.stop_id} className="data-mono text-[11px] text-on-surface-variant">
                    {s.stop_order}. {s.name} · {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                  </div>
                ))}
                {assigned.stops.length === 0 ? (
                  <div className="data-mono text-[10px] text-on-surface-variant">No stops defined.</div>
                ) : null}
              </div>
              <div className="mt-3 flex gap-2">
                {assigned.journey.status === 'SCHEDULED' ? (
                  <button
                    onClick={() => void onStartJourney()}
                    disabled={journeyBusy}
                    className="label-caps flex w-full items-center justify-center gap-2 bg-on-tertiary-container py-2.5 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {journeyBusy ? 'Starting…' : 'START JOURNEY'}
                  </button>
                ) : null}
                {assigned.journey.status === 'ACTIVE' ? (
                  <button
                    onClick={() => void onEndJourney()}
                    disabled={journeyBusy}
                    className="label-caps flex w-full items-center justify-center gap-2 bg-error py-2.5 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {journeyBusy ? 'Ending…' : 'END JOURNEY'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-1 data-mono text-[11px] text-on-surface-variant">
              No active journey assigned by dispatch.
            </div>
          )}
        </div>

        {/* Status select */}
        <div className="hairline bg-surface p-4">
          <div className="mb-3 label-caps text-on-surface-variant">VEHICLE STATUS</div>
          {onJourney ? (
            <div className="hairline border-on-tertiary-container/50 bg-on-tertiary-container/10 px-3 py-3">
              <div className="label-caps text-on-tertiary-container">ON JOURNEY</div>
              <div className="mt-1 data-mono text-[11px] text-on-surface-variant">
                The assigned journey controls this vehicle's status. End the journey to change it.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => onStatusChange(s.key)}
                  className={`label-caps flex flex-col gap-1 px-2 py-3 transition-colors ${
                    status === s.key
                      ? 'bg-on-tertiary-container text-white'
                      : 'bg-surface-dim text-on-surface-variant hairline hover:text-on-surface'
                  }`}
                >
                  {s.label}
                  <span
                    className={`data-mono text-[10px] ${
                      status === s.key ? 'text-white/70' : 'text-on-surface-variant'
                    }`}
                  >
                    {s.hint}
                  </span>
                </button>
              ))}
            </div>
          )}
          {apiError && (
            <div className="mt-3 data-mono text-[11px] text-error">{apiError}</div>
          )}
        </div>

        {/* Tracking control */}
        <div className="hairline bg-surface p-4">
          <div className="mb-3 label-caps text-on-surface-variant">GPS TRACKING</div>
          <button
            onClick={tracking ? stopTracking : startTracking}
            className={`label-caps flex w-full items-center justify-center gap-2 py-3 font-bold transition-opacity ${
              tracking ? 'bg-error text-white' : 'bg-on-tertiary-container text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {tracking ? 'gps_fixed' : 'gps_off'}
            </span>
            {tracking ? 'STOP STREAMING' : 'START STREAMING'}
          </button>
          {geoError && <div className="mt-3 data-mono text-[11px] text-error">{geoError}</div>}
        </div>

        {/* Emergency SOS */}
        <div className="hairline border-error bg-error/5 p-4">
          <div className="mb-3 label-caps text-error">EMERGENCY</div>
          <button
            onClick={() => void onSos()}
            disabled={sosBusy}
            className="label-caps flex w-full items-center justify-center gap-2 bg-error py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">sos</span>
            {sosBusy ? 'TRANSMITTING…' : 'SEND SOS'}
          </button>
          <div className="mt-2 data-mono text-[10px] text-on-surface-variant">
            Raises an immediate critical incident at your current position (accident, attack, or
            kidnapping) — it does not wait for anomaly detection.
          </div>
          {sosMessage && <div className="mt-2 data-mono text-[11px] text-error">{sosMessage}</div>}
        </div>

        {/* Last ping */}
        <div className="hairline bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label-caps text-on-surface-variant">LAST PING</span>
            <span
              className={`data-mono text-[10px] ${sending ? 'text-on-tertiary-container' : 'text-on-surface-variant'}`}
            >
              {sending ? 'SENDING…' : 'IDLE'}
            </span>
          </div>
          {lastUpdate ? (
            <div className="grid grid-cols-2 gap-2 data-mono text-[12px] text-on-surface">
              <div>LAT {lastUpdate.lat.toFixed(6)}</div>
              <div>LNG {lastUpdate.lng.toFixed(6)}</div>
              <div>SPEED {lastUpdate.speed.toFixed(1)} km/h</div>
              <div>HDG {lastUpdate.heading.toFixed(0)}°</div>
              <div className="col-span-2 text-on-surface-variant">
                {new Date(lastUpdate.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ) : (
            <div className="data-mono text-[12px] text-on-surface-variant">
              No position sent yet. Start streaming to share your location.
            </div>
          )}
          <div className="mt-3 hairline-b pt-3 data-mono text-[10px] leading-relaxed text-on-surface-variant">
            Your phone streams GPS to the Transit server. Dispatch sees this bus live on the fleet
            map under {user.plate_number ?? 'your plate'}.
          </div>
        </div>
      </main>

      <footer className="hairline-t fixed inset-x-0 bottom-0 flex items-center justify-between bg-background/85 px-5 py-2 backdrop-blur-sm">
        <span className="data-mono text-[10px] text-on-surface-variant">
          {user.plate_number ?? 'DRIVER'} · {status}
        </span>
        <span className="data-mono text-[10px] text-on-surface-variant">TRANSIT DRIVER CONSOLE</span>
      </footer>
    </div>
  );
}