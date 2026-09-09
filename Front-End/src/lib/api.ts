const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface AuthEntry {
  token: string;
  user: Record<string, unknown>;
  role: 'COMPANY' | 'RESPONDER';
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
    default:
      return 'Something went wrong. Please try again.';
  }
}