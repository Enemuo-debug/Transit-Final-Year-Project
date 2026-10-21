import Constants from 'expo-constants';

// Option A (default): auto-detect the dev machine's LAN IP from the Metro bundler host.
// Expo Go connects to the bundler at http://<your-laptop-ip>:8081, so we reuse that IP
// and point the API + WebSocket at port 3001 where the Transit backend listens.
//
// Option B: if auto-detection fails (e.g. backend on a different machine), set this
// to your backend's address, e.g. 'http://192.168.1.50:3001'.
const API_OVERRIDE: string | null = null;

function detectHost(): string {
  if (API_OVERRIDE) return API_OVERRIDE;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return `http://${host}:3001`;
  }
  return 'http://localhost:3001';
}

export const API_URL = detectHost();
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws/telemetry';