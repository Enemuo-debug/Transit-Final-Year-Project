import { API_URL } from '../config';
import { type DriverUser } from './session';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.code ?? 'REQUEST_FAILED');
  }
  return data as unknown as T;
}

export async function driverLogin(input: {
  session_code: string;
  plate_number: string;
}): Promise<{ token: string; user: DriverUser; session: { id: number; is_active: boolean } }> {
  return request('/driver/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateDriverStatus(
  token: string,
  status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE',
): Promise<{ id: number; plate_number: string; status: string }> {
  return request('/driver/status', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
}

export interface RouteStop {
  stop_id: number;
  stop_order: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface DriverJourney {
  id: number;
  route_id: number;
  status: string;
  route_code: string | null;
  route_name: string | null;
  started_at: string | null;
}

export interface ActiveJourneyResult {
  journey: DriverJourney | null;
  stops: RouteStop[];
}

export async function fetchActiveJourney(token: string): Promise<ActiveJourneyResult> {
  return request('/driver/journey', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function startJourney(token: string): Promise<DriverJourney> {
  return request('/driver/journey/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function endJourney(token: string): Promise<DriverJourney> {
  return request('/driver/journey/end', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function raiseSos(
  token: string,
  input: { latitude: number; longitude: number; description?: string },
): Promise<{ id: number; type: string; severity: string; deduplicated: boolean }> {
  return request('/incidents/sos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function errorLabel(code: string): string {
  switch (code) {
    case 'INVALID_DRIVER_CREDENTIALS':
      return 'Invalid session code or plate number. Check with your dispatcher.';
    case 'VALIDATION_FAILED':
      return 'One or more fields are invalid.';
    case 'NETWORK_ERROR':
      return 'Cannot reach the server. Confirm your phone is on the same Wi-Fi as the server machine.';
    default:
      return 'Something went wrong. Please try again.';
  }
}