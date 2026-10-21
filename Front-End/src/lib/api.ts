import { API_BASE } from './base';

export interface AuthEntry {
  token: string;
  user: Record<string, unknown>;
  role: 'COMPANY' | 'RESPONDER' | 'DRIVER';
}

const STORAGE_KEY = 'transit.session';

export function getSession(): AuthEntry | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthEntry;
  } catch {
    return null;
  }
}

export function setSession(entry: AuthEntry): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
  if (!res.ok) {
    throw new Error(data.error?.code ?? 'REQUEST_FAILED');
  }
  return data as unknown as T;
}

async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const token = session?.token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
  if (!res.ok) {
    throw new Error(data.error?.code ?? 'REQUEST_FAILED');
  }
  return data as unknown as T;
}

export interface AuthResult {
  token: string;
  user: Record<string, never> & Record<string, unknown>;
}

export function registerOrganization(input: {
  company_name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  return request<AuthResult>('/auth/register', input);
}

export function registerResponder(input: {
  name: string;
  email: string;
  password: string;
  agency_type: string;
}): Promise<AuthResult> {
  return request<AuthResult>('/auth/register-responder', input);
}

export function loginOrganization(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  return request<AuthResult>('/auth/login', input);
}

export function loginResponder(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  return request<AuthResult>('/auth/login-responder', input);
}

export function errorLabel(code: string): string {
  switch (code) {
    case 'EMAIL_IN_USE':
      return 'An account with this email already exists.';
    case 'NAME_IN_USE':
      return 'This name is already registered.';
    case 'INVALID_CREDENTIALS':
      return 'Invalid credentials. Check your email and password.';
    case 'VALIDATION_FAILED':
      return 'One or more fields are invalid.';
    case 'PLATE_IN_USE':
      return 'A bus with this plate number is already registered.';
    case 'COMPANY_NOT_FOUND':
      return 'Company not found.';
    case 'INVALID_DRIVER_CREDENTIALS':
      return 'Invalid session code or plate number. Check with your dispatcher.';
    case 'FORBIDDEN':
      return 'You do not have permission for this action.';
    case 'LOCATION_NOT_FOUND':
      return 'Responder location not found.';
    case 'BRANCH_NAME_IN_USE':
      return 'This branch name is already registered for your unit.';
    case 'BUS_NOT_FOUND':
      return 'Bus not found.';
    case 'ROUTE_CODE_IN_USE':
      return 'A route with this code already exists.';
    case 'ROUTE_IN_USE':
      return 'This route is used by a journey and cannot be deleted.';
    case 'ROUTE_NOT_FOUND':
      return 'Route not found.';
    case 'JOURNEY_ALREADY_ACTIVE':
      return 'This bus already has an active journey.';
    case 'BUS_IN_MAINTENANCE':
      return 'This bus is in maintenance and cannot be assigned.';
    case 'BUS_IN_USE':
      return 'This bus still has journeys. Delete those journeys first.';
    case 'BUS_ALREADY_ASSIGNED':
      return 'This bus is already assigned to a journey.';
    case 'BUS_HAS_INCIDENTS':
      return 'This bus is linked to incident records and cannot be deleted.';
    case 'BUS_ON_JOURNEY':
      return 'This bus is on a journey; the journey controls its status.';
    case 'JOURNEY_NOT_FOUND':
      return 'Journey not found.';
    case 'INCIDENT_NOT_FOUND':
      return 'Incident not found.';
    case 'DISPATCH_NOT_FOUND':
      return 'Dispatch not found.';
    case 'SESSION_NOT_FOUND':
      return 'Session not found.';
    case 'INVALID_ID':
      return 'Invalid identifier.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export interface Bus {
  id: number;
  company_id: number;
  plate_number: string;
  capacity: number;
  status: 'ACTIVE' | 'ON_JOURNEY' | 'MAINTENANCE' | 'OFFLINE';
  reg_date: string;
  company?: { id: number; email: string; company_name: string };
}

export function getMyBuses(): Promise<Bus[]> {
  const session = getSession();
  const id = session?.user?.id;
  if (!id) return Promise.resolve([]);
  return authRequest<Bus[]>(`/buses?company_id=${id}`, { method: 'GET' });
}

export function registerBus(input: {
  company_id: number;
  plate_number: string;
  capacity: number;
  status?: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE';
}): Promise<Bus> {
  return authRequest<Bus>('/buses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateBus(
  id: number,
  input: {
    company_id?: number;
    plate_number?: string;
    capacity?: number;
    status?: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE';
  },
): Promise<Bus> {
  return authRequest<Bus>(`/buses/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteBus(id: number): Promise<void> {
  return authRequest<void>(`/buses/${id}`, { method: 'DELETE' });
}

export interface DriverSession {
  id: number;
  session_code: string;
  plate_number: string;
  company_id: number;
  is_active: boolean;
  created_at: string;
}

export interface SessionListResult {
  sessions: DriverSession[];
  active: DriverSession | null;
}

export function getMySessions(): Promise<SessionListResult> {
  return authRequest<SessionListResult>('/sessions', { method: 'GET' });
}

export function createSession(plate_number: string): Promise<DriverSession> {
  return authRequest<DriverSession>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ plate_number }),
  });
}

export function deactivateSession(id: number): Promise<DriverSession> {
  return authRequest<DriverSession>(`/sessions/${id}`, { method: 'DELETE' });
}

export interface DriverAuthResult {
  token: string;
  user: {
    role: 'DRIVER';
    sessionId: number;
    companyId: number;
    plate_number: string;
    busId: number;
    session_code: string;
  };
  session: {
    id: number;
    session_code: string;
    plate_number: string;
    is_active: boolean;
  };
}

const DEVICE_KEY = 'transit.deviceId';

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function driverLogin(input: {
  session_code: string;
  plate_number: string;
}): Promise<DriverAuthResult> {
  return request<DriverAuthResult>('/driver/login', { ...input, device_id: getDeviceId() });
}

export function sendPosition(input: {
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
}): Promise<{ ok: boolean; sample: { deviceId: string; lat: number; lng: number } }> {
  return authRequest<{ ok: boolean; sample: { deviceId: string; lat: number; lng: number } }>(
    '/driver/position',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export interface DriverBus {
  id: number;
  plate_number: string;
  capacity: number;
  status: Bus['status'];
}

export function getDriverBus(): Promise<DriverBus> {
  return authRequest<DriverBus>('/driver/bus', { method: 'GET' });
}

export interface DriverJourneyResult {
  journey: Journey | null;
  stops: RouteStop[];
}

export function getMyJourney(): Promise<DriverJourneyResult> {
  return authRequest<DriverJourneyResult>('/driver/journey', { method: 'GET' });
}

export function startMyJourney(): Promise<Journey> {
  return authRequest<Journey>('/driver/journey/start', { method: 'POST' });
}

export function endMyJourney(): Promise<Journey> {
  return authRequest<Journey>('/driver/journey/end', { method: 'POST' });
}

export function updateDriverStatus(
  status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE',
): Promise<{ id: number; plate_number: string; status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE' }> {
  return authRequest<{ id: number; plate_number: string; status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE' }>(
    '/driver/status',
    { method: 'PATCH', body: JSON.stringify({ status }) },
  );
}

export interface ResponderLocation {
  id: number;
  responder_id: number;
  branch_name: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
  created_at: string;
}

export interface NearestMatch {
  location: ResponderLocation;
  responder: {
    id: number;
    name: string;
    email: string;
    agency_type: 'POLICE' | 'FRSC' | 'NEMA' | 'MEDICAL';
  };
  distance_km: number;
}

export function getMyLocations(): Promise<ResponderLocation[]> {
  return authRequest<ResponderLocation[]>('/responders/me/locations', { method: 'GET' });
}

export function createLocation(input: {
  branch_name: string;
  latitude: number;
  longitude: number;
  is_active?: boolean;
}): Promise<ResponderLocation> {
  return authRequest<ResponderLocation>('/responders/me/locations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLocation(
  id: number,
  input: {
    branch_name?: string;
    latitude?: number;
    longitude?: number;
    is_active?: boolean;
  },
): Promise<ResponderLocation> {
  return authRequest<ResponderLocation>(`/responders/me/locations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteLocation(id: number): Promise<void> {
  return authRequest<void>(`/responders/me/locations/${id}`, { method: 'DELETE' });
}

export function findNearestLocations(input: {
  latitude: number;
  longitude: number;
  agency_type?: string;
  limit?: number;
}): Promise<NearestMatch[]> {
  const query = new URLSearchParams();
  query.set('latitude', String(input.latitude));
  query.set('longitude', String(input.longitude));
  if (input.agency_type) query.set('agency_type', input.agency_type);
  if (input.limit !== undefined) query.set('limit', String(input.limit));
  return authRequest<NearestMatch[]>(`/responders/nearest?${query.toString()}`, { method: 'GET' });
}

/* ----------------------------- Routes & stops ----------------------------- */

export interface RouteStop {
  stop_id: number;
  stop_order: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface Route {
  id: number;
  company_id: number;
  route_code: string;
  name: string;
  polyline: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stops: RouteStop[];
}

export interface RouteStopInput {
  name: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
}

export function getRoutes(): Promise<Route[]> {
  return authRequest<Route[]>('/routes', { method: 'GET' });
}

export function createRoute(input: {
  route_code: string;
  name: string;
  polyline?: string;
  is_active?: boolean;
  stops?: RouteStopInput[];
}): Promise<Route> {
  return authRequest<Route>('/routes', { method: 'POST', body: JSON.stringify(input) });
}

export function updateRoute(
  id: number,
  input: Partial<{
    route_code: string;
    name: string;
    polyline: string;
    is_active: boolean;
    stops: RouteStopInput[];
  }>,
): Promise<Route> {
  return authRequest<Route>(`/routes/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteRoute(id: number): Promise<void> {
  return authRequest<void>(`/routes/${id}`, { method: 'DELETE' });
}

/* -------------------------------- Journeys -------------------------------- */

export type JourneyStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Journey {
  id: number;
  company_id: number;
  bus_id: number;
  route_id: number;
  session_id: number | null;
  status: JourneyStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  plate_number: string | null;
  route_code: string | null;
  route_name: string | null;
}

export function getJourneys(status?: JourneyStatus): Promise<Journey[]> {
  const q = status ? `?status=${status}` : '';
  return authRequest<Journey[]>(`/journeys${q}`, { method: 'GET' });
}

export function getJourney(id: number): Promise<Journey> {
  return authRequest<Journey>(`/journeys/${id}`, { method: 'GET' });
}

/** Organization assigns a bus to a route. Creates a SCHEDULED journey (driver starts it). */
export function createJourney(input: {
  bus_id: number;
  route_id: number;
  session_id?: number;
}): Promise<Journey> {
  return authRequest<Journey>('/journeys', { method: 'POST', body: JSON.stringify(input) });
}

export function endJourney(id: number, status: 'COMPLETED' | 'CANCELLED'): Promise<Journey> {
  return authRequest<Journey>(`/journeys/${id}/end`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** Soft-delete: the record is kept for audit but hidden from listings. */
export function deleteJourney(id: number): Promise<void> {
  return authRequest<void>(`/journeys/${id}`, { method: 'DELETE' });
}

/* -------------------------------- Incidents ------------------------------- */

export type IncidentType =
  | 'UNANTICIPATED_STOP'
  | 'ROUTE_DEVIATION'
  | 'ACCIDENT'
  | 'BREAKDOWN'
  | 'KIDNAPPING'
  | 'DRIVER_SOS';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'DISPATCHED' | 'IN_PROGRESS' | 'RESOLVED' | 'FALSE_ALARM';

export interface Incident {
  id: number;
  company_id: number;
  bus_id: number;
  route_id: number | null;
  journey_id: number | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  latitude: number;
  longitude: number;
  description: string | null;
  detected_at: string;
  resolved_at: string | null;
  plate_number: string | null;
}

export function getIncidents(filter?: {
  status?: IncidentStatus;
  type?: IncidentType;
  bus_id?: number;
  limit?: number;
}): Promise<Incident[]> {
  const q = new URLSearchParams();
  if (filter?.status) q.set('status', filter.status);
  if (filter?.type) q.set('type', filter.type);
  if (filter?.bus_id) q.set('bus_id', String(filter.bus_id));
  if (filter?.limit) q.set('limit', String(filter.limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return authRequest<Incident[]>(`/incidents${suffix}`, { method: 'GET' });
}

export function getIncident(id: number): Promise<Incident> {
  return authRequest<Incident>(`/incidents/${id}`, { method: 'GET' });
}

export function updateIncidentStatus(id: number, status: IncidentStatus): Promise<Incident> {
  return authRequest<Incident>(`/incidents/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function raiseSos(input: {
  latitude: number;
  longitude: number;
  description?: string;
}): Promise<Incident & { deduplicated: boolean }> {
  return authRequest<Incident & { deduplicated: boolean }>('/incidents/sos', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* -------------------------------- Dispatch -------------------------------- */

export type DispatchStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ON_SCENE'
  | 'COMPLETED'
  | 'DECLINED';

export interface Dispatch {
  id: number;
  incident_id: number;
  responder_id: number;
  responder_location_id: number | null;
  status: DispatchStatus;
  dispatched_at: string;
  accepted_at: string | null;
  arrived_at: string | null;
  resolved_at: string | null;
  notes: string | null;
  responder_name: string | null;
  branch_name: string | null;
  response_minutes: number | null;
  incident: {
    id: number;
    type: IncidentType;
    severity: IncidentSeverity;
    status: string;
    latitude: number;
    longitude: number;
    description: string | null;
    detected_at: string;
  } | null;
}

export function getMyDispatches(): Promise<Dispatch[]> {
  return authRequest<Dispatch[]>('/dispatches', { method: 'GET' });
}

export function updateDispatchStatus(
  id: number,
  status: DispatchStatus,
  notes?: string,
): Promise<Dispatch> {
  return authRequest<Dispatch>(`/dispatches/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(notes ? { notes } : {}) }),
  });
}

export function getIncidentDispatches(incidentId: number): Promise<Dispatch[]> {
  return authRequest<Dispatch[]>(`/dispatches/incident/${incidentId}`, { method: 'GET' });
}