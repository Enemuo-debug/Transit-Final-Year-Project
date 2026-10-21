// API base resolution that works on desktop (localhost) and on a phone over the LAN.
//
// - If VITE_API_URL is a non-localhost URL (e.g. an HTTPS tunnel), use it everywhere.
// - If VITE_API_URL points at localhost, honour it on desktop but on a phone auto-detect
//   the same host the app was loaded from (laptop LAN IP) on port 3000.
// - Otherwise derive from the current window location.

const ENV_API = String(import.meta.env.VITE_API_URL ?? '')
  .trim()
  .replace(/\/$/, '');

// Backend port used when auto-detecting the host (phone over LAN).
const ENV_PORT = String(import.meta.env.VITE_API_PORT ?? '3000').trim() || '3000';

function isLoopback(value: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value);
}

function detectApiBase(): string {
  if (typeof window === 'undefined') return ENV_API || 'http://localhost:3000';
  const host = window.location.hostname;

  if (ENV_API) {
    const envIsLocal = isLoopback(ENV_API);
    const pageIsLocal = host === 'localhost' || host === '127.0.0.1';
    if (!envIsLocal || pageIsLocal) return ENV_API;
  }

  // Served over HTTPS on a standard port (e.g. a tunnel) -> same origin for app + API.
  if (window.location.protocol === 'https:' && window.location.port === '') {
    return window.location.origin;
  }

  // Phone/browser loaded from a LAN host: talk to the backend on the same host.
  return `${window.location.protocol}//${host}:${ENV_PORT}`;
}

export const API_BASE = detectApiBase();
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

// Helps debugging on a phone (visible in remote DevTools / browser console).
console.info(`[transit] API base: ${API_BASE}`);

