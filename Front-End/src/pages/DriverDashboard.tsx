import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  getSession,
  clearSession,
  getMyJourney,
  startMyJourney,
  sendPosition,
  errorLabel,
  type Journey,
  type TrackingStatus,
} from '../lib/api';

type LiveFix = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
};

export function DriverDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingStatus | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSendRef = useRef(0);
  const sendingRef = useRef(false);

  const user = session?.user as
    | { plate_number?: string; session_code?: string }
    | undefined;

  async function loadJourney() {
    try {
      const result = await getMyJourney();
      setJourney(result.journey);
      setError(null);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'REQUEST_FAILED';
      if (code === 'UNAUTHORIZED' || code === 'SESSION_CODE_REVOKED') {
        forceLogout('session_invalid');
        return;
      }
      setError(errorLabel(code));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session?.role !== 'DRIVER') return;
    void loadJourney();
    const id = setInterval(() => void loadJourney(), 15000);
    return () => clearInterval(id);
  }, [session?.role]);

  useEffect(() => {
    return () => stopStreaming();
  }, []);

  // Streaming is only allowed while the assigned journey is ACTIVE.
  useEffect(() => {
    if (streaming && journey?.status !== 'ACTIVE') {
      stopStreaming();
      setMessage('Streaming stopped: no active journey.');
    }
  }, [journey?.status, streaming]);

  if (!session || session.role !== 'DRIVER') {
    return <Navigate to="/signin/driver" replace />;
  }

  async function onStartJourney() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const started = await startMyJourney();
      setJourney(started);

      // Starting the journey should also start the GPS stream.
      const streamStarted = startStreaming();
      setMessage(
        streamStarted
          ? `Journey ${started.id} started. Streaming started.`
          : `Journey ${started.id} started. Enable GPS to start streaming.`,
      );
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  function stopStreaming() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setStreaming(false);
  }

  function startStreaming(): boolean {
    if (watchId.current !== null) return false;

    setGeoError(null);
    setStreamError(null);
    setTracking(null);
    setMessage(null);

    if (!('geolocation' in navigator)) {
      setGeoError('This device does not support GPS.');
      return false;
    }

    setStreaming(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const next: LiveFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString(),
        };
        setFix(next);

        // Send at most one fix every 3 seconds; never overlap requests.
        const now = Date.now();
        if (now - lastSendRef.current < 3000 || sendingRef.current) return;
        lastSendRef.current = now;
        sendingRef.current = true;

        void sendPosition({
          lat: next.lat,
          lng: next.lng,
          accuracy: next.accuracy,
        })
          .then((result) => {
            setLastSent(new Date().toLocaleTimeString());
            setStreamError(null);
            setTracking(result.tracking);

            if (result.journey?.status === 'COMPLETED') {
              stopStreaming();
              setJourney(result.journey);
              setMessage('Destination reached — journey completed automatically.');
            }
          })
          .catch((err) => {
            const code = err instanceof Error ? err.message : 'REQUEST_FAILED';
            if (code === 'STREAM_CONFLICT') {
              forceLogout('stream_conflict');
              return;
            }
            if (code === 'UNAUTHORIZED' || code === 'SESSION_CODE_REVOKED') {
              forceLogout('session_invalid');
              return;
            }
            if (code === 'NO_ACTIVE_JOURNEY') {
              stopStreaming();
              setMessage('Streaming stopped: start an active journey first.');
            } else {
              setStreamError(errorLabel(code));
            }
          })
          .finally(() => {
            sendingRef.current = false;
          });
      },
      (err) => {
        setGeoError(err.message || 'Could not read the GPS position.');
        stopStreaming();
        setMessage('Journey started, but GPS streaming stopped. Enable location and try again.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return true;
  }

  function forceLogout(reason: 'stream_conflict' | 'session_invalid') {
    stopStreaming();
    clearSession();
    navigate(`/signin/driver?notice=${reason}`, { replace: true });
  }

  function signOut() {
    stopStreaming();
    clearSession();
    navigate('/signin/driver', { replace: true });
  }

  const canStart = journey?.status === 'SCHEDULED';
  const canStream = journey?.status === 'ACTIVE';

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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={signOut}
            className="label-caps flex items-center gap-2 text-on-surface-variant transition-colors hover:text-error"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[512px] flex-col gap-4 px-5 pb-16 pt-8">
        <div className="hairline bg-surface p-4">
          <div className="label-caps text-on-surface-variant">LINKED ASSET</div>
          <div className="mt-1 flex items-end justify-between">
            <div className="data-mono text-[24px] font-bold tracking-[0.15em] text-on-surface">
              {user?.plate_number ?? '—'}
            </div>
            <div className="data-mono text-[11px] text-on-surface-variant">
              SESSION {user?.session_code ?? '—'}
            </div>
          </div>
        </div>

        <div className="hairline bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="label-caps text-on-surface-variant">ASSIGNED JOURNEY</span>
            <span className="data-mono text-[11px] text-on-surface-variant">
              {journey?.status ?? (loading ? 'LOADING…' : 'NONE')}
            </span>
          </div>
          {journey ? (
            <div className="mt-2">
              <div className="data-mono text-[16px] font-bold text-on-surface">
                {journey.route_code ?? `ROUTE-${journey.route_id}`}
              </div>
              <div className="data-mono text-[11px] text-on-surface-variant">
                {journey.route_name ?? ''}
              </div>
            </div>
          ) : (
            <div className="mt-2 data-mono text-[11px] text-on-surface-variant">
              No journey assigned by the organization yet.
            </div>
          )}
        </div>

        <div className="hairline bg-surface p-4">
          <div className="mb-3 label-caps text-on-surface-variant">DRIVER ACTIONS</div>
          {!journey && !loading ? (
            <div className="hairline bg-surface-dim p-3 data-mono text-[11px] text-on-surface-variant">
              No journey assigned. Driver actions are disabled until dispatch assigns a journey.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
            <button
              onClick={() => void onStartJourney()}
              disabled={!canStart || busy}
              className="label-caps flex w-full items-center justify-center gap-2 bg-on-tertiary-container py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              {busy
                ? 'STARTING…'
                : journey?.status === 'ACTIVE'
                  ? 'JOURNEY ACTIVE'
                  : journey?.status === 'COMPLETED'
                    ? 'JOURNEY COMPLETED'
                    : 'START JOURNEY'}
            </button>

            {streaming ? (
              <div className="hairline flex items-center justify-between bg-surface-dim px-3 py-3">
                <span className="label-caps flex items-center gap-2 text-green-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                  GPS STREAMING
                </span>
                <span className="data-mono text-[10px] text-on-surface-variant">LOCKED</span>
              </div>
            ) : canStream ? (
              <button
                type="button"
                onClick={startStreaming}
                className="label-caps flex w-full items-center justify-center gap-2 bg-surface-dim py-3 font-bold text-on-surface-variant transition-colors hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[18px]">sensors</span>
                RETRY GPS STREAMING
              </button>
            ) : null}
            {!canStream && !streaming ? (
              <div className="data-mono text-[10px] text-on-surface-variant">
                Start the journey before streaming telemetry or sending SOS.
              </div>
            ) : null}

            <button
              onClick={() => {
                setError(null);
                setMessage('SOS is not implemented yet.');
              }}
              disabled={!canStream}
              className="label-caps flex w-full items-center justify-center gap-2 border border-error bg-error/5 py-3 font-bold text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">sos</span>
              SEND SOS
            </button>
            </div>
          )}

          {message ? (
            <div className="mt-3 data-mono text-[11px] text-on-surface-variant">{message}</div>
          ) : null}
          {error ? <div className="mt-3 data-mono text-[11px] text-error">{error}</div> : null}
        </div>

        {journey || streaming ? (
          <div className="hairline bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="label-caps text-on-surface-variant">LIVE GPS</span>
            <span
              className={`data-mono text-[11px] ${
                streaming ? 'text-green-400' : 'text-on-surface-variant'
              }`}
            >
              {streaming ? 'STREAMING' : 'OFF'}
            </span>
          </div>

          {fix ? (
            <div className="mt-2 grid grid-cols-2 gap-2 data-mono text-[11px] text-on-surface">
              <span>LAT {fix.lat.toFixed(6)}</span>
              <span>LNG {fix.lng.toFixed(6)}</span>
              <span>ACCURACY ±{fix.accuracy.toFixed(0)} m</span>
              <span>UPDATED {new Date(fix.timestamp).toLocaleTimeString()}</span>
            </div>
          ) : (
            <div className="mt-2 data-mono text-[11px] text-on-surface-variant">
              No GPS fix yet.
            </div>
          )}

          {tracking ? (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-outline-variant pt-3 data-mono text-[10px]">
              <span>
                ROUTE {tracking.distance_m !== null ? `${tracking.distance_m.toFixed(0)} m` : '—'}
              </span>
              <span>
                PROGRESS{' '}
                {tracking.progress !== null
                  ? `${(tracking.progress * 100).toFixed(1)}%`
                  : '—'}
              </span>
              <span className={tracking.deviation ? 'text-error' : 'text-green-400'}>
                {tracking.deviation
                  ? tracking.just_deviated
                    ? 'DEVIATION · INCIDENT CREATED'
                    : 'DEVIATION'
                  : 'ON ROUTE'}
              </span>
              <span>CORRIDOR {tracking.corridor_meters.toFixed(0)} m</span>
            </div>
          ) : null}

          {geoError ? (
            <div className="mt-2 data-mono text-[11px] text-error">{geoError}</div>
          ) : null}

          <div className="mt-2 data-mono text-[10px] text-on-surface-variant">
            {lastSent ? `LAST SENT ${lastSent}` : 'NOT SENT YET'}
          </div>
          {streamError ? (
            <div className="mt-1 data-mono text-[11px] text-error">{streamError}</div>
          ) : null}

            <div className="mt-2 data-mono text-[10px] text-on-surface-variant">
              Speed is intentionally not captured (study limitation).
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
