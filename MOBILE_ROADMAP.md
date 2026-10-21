# TRANSIT Mobile — PWA (fast path) & Expo app roadmap

> **For the defense, use the PWA.** The web app (`Front-End/`) is now installable (PWA), reuses the
> existing React driver screen, and needs no Expo/EAS build. The Expo app (`Mobile-App/`) remains
> as an optional native path and is documented further down.

---

## 0. Fast path: PWA on your phone (recommended)

1. Phone + laptop on the same Wi-Fi.
2. `cd Database && docker compose up -d`
3. `npm run start:backend` (from the repo root) — listens on `0.0.0.0:3000`.
4. `npm run dev:frontend` (Vite listens on `0.0.0.0`). Find your IP with `hostname -I`.
5. On the phone open `http://<laptop-ip>:5173`. The app auto-points its API/WS at
   `http://<laptop-ip>:3000` — no config.
6. Browser menu → **Add to Home screen / Install app**.
7. Sign in as **Driver** (`/signin/driver`) with the session code + plate from the org console;
   press **START JOURNEY**, then **START STREAMING**; press **SEND SOS** to test.
8. Optimized build (optional): `npm run pwa` → open `http://<laptop-ip>:4173`.

**GPS + installability caveat:** browsers only allow **geolocation** and true PWA install on
**HTTPS** (or `localhost`). On plain LAN HTTP, `START STREAMING` fails with *“Only secure origins
are allowed.”* Use one HTTPS tunnel — the backend serves the built app, so app + API share an
origin:

```bash
npm run build:frontend
npm run start:backend
~/.local/bin/cloudflared tunnel --url http://localhost:3001
```

Open the printed `https://<random>.trycloudflare.com` on the phone (GPS + Add to Home screen work).
Keep the tunnel running; the URL changes each restart.

**Why the PWA is the right call here:** zero app-store/build overhead, instant updates, works on
both iOS and Android, reuses all existing screens. **Limitation:** background GPS tracking while
the phone is locked is unreliable on PWA (especially iOS) — that's the main reason the native
Expo app is still on the roadmap (M2).

---

## 1. Expo app — current state (optional native path)

The Expo app (`Mobile-App/`) is the **driver interface** in React Native: sign in with a session
code + plate, stream GPS over WebSocket, set vehicle status, and send SOS.

> Do not guess Expo APIs — this project pins **Expo 57**. Read the versioned docs at
> https://docs.expo.dev/versions/v57.0.0/ before adding features (see `Mobile-App/AGENTS.md`).

---

## 1. Current state

| Feature | Status |
|---|---|
| Driver login (session code + plate) | ✅ `src/screens/LoginScreen.tsx`, persisted in AsyncStorage |
| Live GPS streaming over WebSocket | ✅ `src/screens/DriverScreen.tsx` + `src/lib/telemetry.ts` |
| Vehicle status (ACTIVE / MAINTENANCE / OFFLINE) | ✅ |
| **SOS → critical incident** | ✅ (Phase 5) |
| **Assigned journey / route + stops on screen** | ✅ (Phase 6 / M1) |
| Backend auto-discovery (laptop LAN IP via Metro host) | ✅ `src/config.ts` |
| Type-checks clean (`tsc --noEmit`) | ✅ |

**Not present yet:** background/foreground-service streaming (M2), offline sample buffering
(M3), push notifications (M4), standalone build (M5).

Session hardening (single-use code + device id pinned to the JWT) is **done** — see Phase 6
in `TEST.md`; it applies to both the web and mobile driver clients.

---

## 2. How to run & test on your phone (Expo Go)

### Prerequisites
- Phone and laptop on the **same Wi-Fi network**.
- Node 20+ on the laptop.
- Postgres + Redis running (`cd Database && docker compose up -d`) and the backend running
  (`cd Back-End && npm start`, listening on `0.0.0.0:3000`).
- **Expo Go** installed from the App Store / Play Store.

### Steps
1. **Verify the phone can reach the backend.** In the phone browser open
   `http://<laptop-ip>:3000/health` → you should see `{"status":"OK"}`.
   Find `<laptop-ip>` with `hostname -I` (Linux) / `ipconfig` (Windows).
2. **Create a driver session** in the web org console (Fleet → bus → **CREATE CODE**) or via API.
   Note the **session code** and **plate number**.
3. **Start Metro:**
   ```bash
   cd Mobile-App
   npm install
   npx expo start          # or: npm start
   ```
4. **Open on the phone:** scan the QR code with **Expo Go** (Android) or the **Camera** app (iOS).
5. The app auto-detects the laptop IP from Metro's host (`Constants.expoConfig.hostUri`) and
   points API/WS at `http://<laptop-ip>:3000`. If it guesses wrong, open `Mobile-App/src/config.ts`
   and set `API_OVERRIDE = 'http://<laptop-ip>:3000'`, then reload.
6. **Sign in** with the session code + plate, grant location permission, press **START STREAMING**.
7. **Confirm end-to-end:** the bus appears on the org web **Dashboard** map and **LIVE ASSETS**.
8. **Test SOS:** press **SEND SOS** → a **DRIVER_SOS / CRITICAL** incident appears in the org
   **Incidents** panel and dispatches to the nearest responders.

### Troubleshooting
| Symptom | Fix |
|---|---|
| "Cannot reach the server" banner | Same Wi-Fi? Firewall blocking 3000/8081? `sudo ufw allow 3000` and `allow 8081`. Disable AP/client isolation on the router. |
| Expo Go can't open the project | SDK mismatch — update Expo Go, or build a dev client (§4). |
| Server IP wrong | Set `API_OVERRIDE` in `src/config.ts`. |
| No location updates | Grant "While using the app" location permission; keep the app foregrounded (background streaming is roadmap §3). |
| QR won't scan | Use `npx expo start --tunnel` (works across networks, slower). |

---

## 3. Roadmap to complete the mobile app

### M1 — Driver parity & clarity ✅ DONE
1. **Active journey on screen** ✅ — `GET /driver/journey` returns the active journey's route
   code/name + ordered stops; shown on the mobile `DriverScreen` **and** the web driver console.
2. **Session hygiene** ✅ — session code consumed on first login + `deviceId` pinned into the
   JWT (Phase 6).
3. **Better status feedback** — partially there (ping counter + last ping); optional polish only.

### M2 — Background streaming (the big one)
Drivers lock their phones; tracking must survive backgrounding.
1. Switch from `Location.watchPositionAsync` to `expo-location` **background** updates
   (`startLocationUpdatesAsync` + `expo-task-manager`) with the Android **foreground service**
   permission (already declared in `app.json`).
2. Keep the WebSocket open in background where the OS allows; otherwise buffer to AsyncStorage
   and flush on foreground (see M3).
3. Add a persistent "TRACKING" notification (Android) so the service isn't killed.

### M3 — Resilience (network is unreliable on highways — a report limitation)
1. **Offline buffer:** queue telemetry samples in `AsyncStorage` when the WS is down; replay in
   order on reconnect.
2. **Retry/backoff:** already implemented for the WS; add exponential backoff for REST calls.
3. **Duplicate-safe:** timestamp-based idempotency so replays don't double-write.

### M4 — Notifications (optional, nice for defense)
1. `expo-notifications`: local confirmation when an SOS is accepted/dispatched; a "help is coming"
   state on screen.
2. (Optional) push for responder assignment — but responders are web-first.

### M5 — Distribution for defense
1. Add `eas.json` and build a standalone **APK** so you don't depend on Expo Go:
   ```bash
   npm i -g eas-cli
   eas login
   eas build -p android --profile preview    # produces an installable APK
   ```
   Minimal `eas.json`:
   ```json
   { "build": { "preview": { "android": { "buildType": "apk" } } } }
   ```
2. Remember: the app still needs network access to the backend. For a live defense, either keep
   the laptop + phone on the same Wi-Fi, or host the backend + DB + Redis on a small cloud VM and
   point `API_OVERRIDE` at it.
3. Icon/splash/version polish (`app.json`), then sideload the APK and demo from the phone.

### Suggested order
M1 → M2 → M3 → M5 (build early so you can test on a real device) → M4.

---

## 4. Quick API reference the app uses

| Call | Purpose |
|---|---|
| `POST /driver/login` | session code + plate → JWT (single-use code, device pinned) |
| `GET /driver/journey` | active journey's route code/name + ordered stops |
| `WS /ws/telemetry?token=…` | stream `{type:"ping", deviceId, lat, lng, speed, heading, timestamp}` |
| `PATCH /driver/status` | ACTIVE / MAINTENANCE / OFFLINE |
| `POST /incidents/sos` | raise immediate critical incident |

The mobile client's WS payload matches `Back-End`'s telemetry service exactly, so streaming
needs no backend change.
