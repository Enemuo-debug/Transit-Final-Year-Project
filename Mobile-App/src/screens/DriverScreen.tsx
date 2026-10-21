import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import {
  updateDriverStatus,
  raiseSos,
  fetchActiveJourney,
  startJourney,
  endJourney,
  errorLabel,
  type ActiveJourneyResult,
} from '../lib/api';
import { TelemetryStream, type StreamState, type TrackSample } from '../lib/telemetry';
import { clearSession, type DriverSession } from '../lib/session';

const STATUSES = [
  { key: 'ACTIVE', label: 'ON ROUTE', hint: 'In transit' },
  { key: 'OFFLINE', label: 'STANDBY', hint: 'Available' },
  { key: 'MAINTENANCE', label: 'WORKSHOP', hint: 'In workshop' },
] as const;

type BusStatus = (typeof STATUSES)[number]['key'];

interface LastPing {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: string;
}

export function DriverScreen({
  session,
  onSignOut,
}: {
  session: DriverSession;
  onSignOut: () => void;
}) {
  const [status, setStatus] = useState<BusStatus>('ACTIVE');
  const [tracking, setTracking] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState<LastPing | null>(null);
  const [pingCount, setPingCount] = useState(0);
  const [sosBusy, setSosBusy] = useState(false);
  const [sosMessage, setSosMessage] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<ActiveJourneyResult | null>(null);
  const [journeyBusy, setJourneyBusy] = useState(false);

  const streamRef = useRef<TelemetryStream | null>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const lastSendRef = useRef(0);
  const pingCountRef = useRef(0);

  const user = session.user;

  // Stream state → component state
  const bindStream = (stream: TelemetryStream) => {
    stream.setListener({ onState: setStreamState });
  };

  useEffect(() => {
    return () => {
      streamRef.current?.dispose();
      streamRef.current = null;
      watchSubRef.current?.remove();
      watchSubRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const load = () => {
      fetchActiveJourney(session.token)
        .then((result) => {
          if (!disposed) setAssigned(result);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [session.token]);

  function ensureStream(): TelemetryStream {
    if (!streamRef.current || streamRef.current.state === 'idle') {
      const stream = new TelemetryStream(session.token, user.plate_number);
      bindStream(stream);
      streamRef.current = stream;
    }
    return streamRef.current;
  }

  function handlePosition(pos: Location.LocationObject): void {
    const coords = pos.coords;
    const now = Date.now();
    if (now - lastSendRef.current < 3000) return;
    lastSendRef.current = now;

    const sample: TrackSample = {
      lat: coords.latitude,
      lng: coords.longitude,
      speed: coords.speed ?? 0,
      heading: coords.heading ?? 0,
      timestamp: new Date().toISOString(),
    };
    const stream = streamRef.current;
    if (stream && stream.state === 'open') {
      stream.send(sample);
      pingCountRef.current += 1;
      setPingCount(pingCountRef.current);
      setLastPing(sample);
    }
  }

  async function startTracking(): Promise<void> {
    setGeoError(null);
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') {
      setGeoError(
        'Location permission denied. Enable location in your phone settings, then try again.',
      );
      return;
    }

    const stream = ensureStream();
    stream.start();
    setTracking(true);

    watchSubRef.current?.remove();
    watchSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0 },
      handlePosition,
      (err) => setGeoError(err),
    );
  }

  function stopTracking(): void {
    streamRef.current?.dispose();
    streamRef.current = null;
    watchSubRef.current?.remove();
    watchSubRef.current = null;
    setTracking(false);
  }

  async function onChangeStatus(next: BusStatus): Promise<void> {
    setStatus(next);
    setApiError(null);
    try {
      await updateDriverStatus(session.token, next);
    } catch (err) {
      setApiError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  async function onSos(): Promise<void> {
    setSosBusy(true);
    setSosMessage(null);
    try {
      let coords = lastPing ? { lat: lastPing.lat, lng: lastPing.lng } : null;
      if (!coords) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
      const incident = await raiseSos(session.token, {
        latitude: coords.lat,
        longitude: coords.lng,
      });
      setSosMessage(
        incident.deduplicated
          ? `SOS already active (#${incident.id}). Help is on the way.`
          : `SOS sent (#${incident.id}). Responders alerted.`,
      );
    } catch (err) {
      setSosMessage(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setSosBusy(false);
    }
  }

  async function refreshAssigned(): Promise<void> {
    try {
      setAssigned(await fetchActiveJourney(session.token));
    } catch {
      // ignore
    }
  }

  async function onStartJourney(): Promise<void> {
    if (journeyBusy) return;
    setJourneyBusy(true);
    setApiError(null);
    try {
      await startJourney(session.token);
      await refreshAssigned();
    } catch (err) {
      setApiError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setJourneyBusy(false);
    }
  }

  async function onEndJourney(): Promise<void> {
    if (journeyBusy) return;
    setJourneyBusy(true);
    setApiError(null);
    try {
      await endJourney(session.token);
      await refreshAssigned();
    } catch (err) {
      setApiError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setJourneyBusy(false);
    }
  }

  async function onSignOutTap(): Promise<void> {
    stopTracking();
    await clearSession();
    onSignOut();
  }

  const live = streamState === 'open';
  const connecting = streamState === 'connecting' || streamState === 'closed';

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>TRANSIT</Text>
            <Text style={s.eyebrow}>DRIVER CONSOLE</Text>
          </View>
          <Pressable onPress={onSignOutTap}>
            <Text style={s.signOut}>SIGN OUT</Text>
          </Pressable>
        </View>

        {/* Linked asset */}
        <View style={s.card}>
          <Text style={s.label}>LINKED ASSET</Text>
          <View style={s.plateRow}>
            <Text style={s.plate}>{user.plate_number}</Text>
            <Text style={s.sessionCode}>SESSION {user.session_code}</Text>
          </View>
          <View style={s.statusRow}>
            <View style={[s.dot, live ? s.dotLive : s.dotOff, tracking && s.pulseDot]} />
            <Text style={[s.statusText, live && { color: '#34D399' }]}>
              {tracking
                ? live
                  ? `LIVE GPS STREAMING (${pingCount} PINGS)`
                  : connecting
                    ? 'CONNECTING…'
                    : 'STREAMING STOPPED'
                : 'TRACKING OFF'}
            </Text>
          </View>
        </View>

        {/* Assigned journey */}
        <View style={s.card}>
          <Text style={s.label}>ASSIGNED JOURNEY</Text>
          {assigned?.journey ? (
            <>
              <View style={s.plateRow}>
                <Text style={s.routeCode}>{assigned.journey.route_code ?? '—'}</Text>
                <Text style={s.sessionCode}>{assigned.journey.status}</Text>
              </View>
              <Text style={s.hint}>{assigned.journey.route_name ?? ''}</Text>
              {assigned.stops.map((stop) => (
                <Text key={stop.stop_id} style={s.stopLine}>
                  {stop.stop_order}. {stop.name} · {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                </Text>
              ))}
              <View style={s.journeyActions}>
                {assigned.journey.status === 'SCHEDULED' ? (
                  <Pressable
                    onPress={onStartJourney}
                    disabled={journeyBusy}
                    style={({ pressed }) => [
                      s.journeyBtn,
                      pressed && s.pressed,
                      journeyBusy && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={s.journeyBtnText}>
                      {journeyBusy ? 'STARTING…' : 'START JOURNEY'}
                    </Text>
                  </Pressable>
                ) : null}
                {assigned.journey.status === 'ACTIVE' ? (
                  <Pressable
                    onPress={onEndJourney}
                    disabled={journeyBusy}
                    style={({ pressed }) => [
                      s.journeyBtn,
                      s.journeyBtnEnd,
                      pressed && s.pressed,
                      journeyBusy && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={s.journeyBtnText}>{journeyBusy ? 'ENDING…' : 'END JOURNEY'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <Text style={s.hint}>No active journey assigned by dispatch.</Text>
          )}
        </View>

        {/* Status selector */}
        <View style={s.card}>
          <Text style={s.label}>VEHICLE STATUS</Text>
          <View style={s.statusGrid}>
            {STATUSES.map((st) => (
              <Pressable
                key={st.key}
                onPress={() => onChangeStatus(st.key)}
                style={[
                  s.statusBtn,
                  status === st.key ? s.statusBtnActive : s.statusBtnIdle,
                ]}
              >
                <Text
                  style={[
                    s.statusBtnLabel,
                    status === st.key ? { color: '#fff' } : { color: '#9CA3AF' },
                  ]}
                >
                  {st.label}
                </Text>
                <Text
                  style={[
                    s.statusBtnHint,
                    status === st.key ? { color: '#FFE9EA' } : { color: '#6B7280' },
                  ]}
                >
                  {st.hint}
                </Text>
              </Pressable>
            ))}
          </View>
          {apiError ? <Text style={s.error}>{apiError}</Text> : null}
        </View>

        {/* Emergency SOS */}
        <View style={[s.card, s.sosCard]}>
          <Text style={[s.label, { color: '#FF6B6B' }]}>EMERGENCY</Text>
          <Pressable
            onPress={onSos}
            disabled={sosBusy}
            style={({ pressed }) => [s.sosBtn, pressed && s.pressed, sosBusy && { opacity: 0.6 }]}
          >
            <Text style={s.sosBtnText}>{sosBusy ? 'TRANSMITTING…' : 'SEND SOS'}</Text>
          </Pressable>
          <Text style={s.hint}>
            Raises an immediate critical incident at your current position (accident, attack, or
            kidnapping) without waiting for anomaly detection.
          </Text>
          {sosMessage ? <Text style={s.error}>{sosMessage}</Text> : null}
        </View>

        {/* Tracking control */}
        <View style={s.card}>
          <Text style={s.label}>GPS TRACKING</Text>
          <Pressable
            onPress={tracking ? stopTracking : startTracking}
            style={({ pressed }) => [
              s.streamBtn,
              tracking ? s.streamBtnStop : s.streamBtnStart,
              pressed && s.pressed,
            ]}
          >
            <Text style={s.streamBtnText}>
              {tracking ? '■ STOP STREAMING' : '● START STREAMING'}
            </Text>
          </Pressable>
          {geoError ? <Text style={s.error}>{geoError}</Text> : null}
        </View>

        {/* Last ping */}
        <View style={s.card}>
          <View style={s.pingHeader}>
            <Text style={s.label}>LAST PING</Text>
            <Text style={[s.pingStatus, live && { color: '#34D399' }]}>
              {live ? 'WS OPEN' : streamState.toUpperCase()}
            </Text>
          </View>
          {lastPing ? (
            <View style={s.pingGrid}>
              <Text style={s.pingCell}>LAT {lastPing.lat.toFixed(6)}</Text>
              <Text style={s.pingCell}>LNG {lastPing.lng.toFixed(6)}</Text>
              <Text style={s.pingCell}>SPEED {lastPing.speed.toFixed(1)} km/h</Text>
              <Text style={s.pingCell}>HDG {lastPing.heading.toFixed(0)}°</Text>
              <Text style={s.pingTime}>
                {new Date(lastPing.timestamp).toLocaleTimeString()}
              </Text>
            </View>
          ) : (
            <Text style={s.hint}>
              No position sent yet. Press START STREAMING so dispatch can see this bus on the
              fleet map.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F0D' },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  brand: { color: '#C22229', fontSize: 24, fontWeight: '900', letterSpacing: 3 },
  eyebrow: { color: '#9CA3AF', fontSize: 10, letterSpacing: 2, marginTop: 2 },
  signOut: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#121714',
    borderColor: '#26312C',
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  label: { color: '#9CA3AF', fontSize: 10, letterSpacing: 2 },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  plate: { color: '#F5F5F5', fontSize: 26, fontWeight: '800', letterSpacing: 1.5 },
  routeCode: { color: '#C22229', fontSize: 22, fontWeight: '800', letterSpacing: 1.5 },
  sessionCode: { color: '#9CA3AF', fontSize: 11 },
  stopLine: { color: '#9CA3AF', fontSize: 12, fontFamily: 'monospace', marginTop: 2 },
  journeyActions: { marginTop: 10 },
  journeyBtn: { backgroundColor: '#C22229', paddingVertical: 12, alignItems: 'center' },
  journeyBtnEnd: { backgroundColor: '#B91C1C' },
  journeyBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLive: { backgroundColor: '#34D399' },
  dotOff: { backgroundColor: '#4B5563' },
  pulseDot: { opacity: 0.9 },
  statusText: { color: '#9CA3AF', fontSize: 11 },
  statusGrid: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#26312C',
    gap: 2,
  },
  statusBtnActive: { backgroundColor: '#C22229', borderColor: '#C22229' },
  statusBtnIdle: { backgroundColor: '#0E1311' },
  statusBtnLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  statusBtnHint: { fontSize: 9 },
  sosCard: { borderColor: '#7F1D1D' },
  sosBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 16,
    alignItems: 'center',
  },
  sosBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  streamBtn: { paddingVertical: 14, alignItems: 'center' },
  streamBtnStart: { backgroundColor: '#C22229' },
  streamBtnStop: { backgroundColor: '#B91C1C' },
  pressed: { opacity: 0.85 },
  streamBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  error: { color: '#FF6B6B', fontSize: 12 },
  pingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pingStatus: { color: '#9CA3AF', fontSize: 10, letterSpacing: 1 },
  pingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  pingCell: {
    color: '#F5F5F5',
    fontSize: 12,
    fontFamily: 'monospace',
    width: '50%',
  },
  pingTime: { color: '#9CA3AF', fontSize: 11, width: '100%', marginTop: 4 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 18 },
});