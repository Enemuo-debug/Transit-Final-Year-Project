# TRANSIT Driver (Mobile)

Expo (React Native) app for drivers. Log in with a dispatcher-issued **session code** +
**bus plate number**, then stream the phone's GPS to the Transit server over **WebSocket** so
the operations dashboard tracks the bus live.

## Prerequisites

1. Transit backend running on the same machine (port 3000).
2. Phone with **Expo Go** installed (App Store / Play Store).
3. Phone and laptop on the **same Wi-Fi network**.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. The app auto-detects your laptop's LAN IP from Expo's bundler
host and targets `http://<laptop-ip>:3000`. If the backend lives elsewhere, set
`API_OVERRIDE` in `src/config.ts`.

## Test flow

1. **Create a session code** for a bus:
   - Web app → Sign in as organization → Fleet List → `CREATE CODE · <plate>`.
   - (or test-only row: `TEST42` already exists for bus `ABC-123-XY`).
2. Open the app, enter the **session code** and the **plate number**, tap
   `LINK TO BUS & CONTINUE`.
3. On the driver console set the vehicle status if needed (ON ROUTE / STANDBY / WORKSHOP).
4. Tap `START STREAMING`, allow the **location permission** prompt.
   - The app connects to `/ws/telemetry?token=...` and pushes a ping every ~3 s from GPS.
5. Watch it land:
   - API: `curl http://localhost:3000/telemetry/live` → the bus shows by plate number.
   - Web: open the organization dashboard — the bus appears on the map and in telemetry.
6. `STOP STREAMING` closes the socket and removes the bus from live telemetry.

## Notes / Troubleshooting

- **Login fails / can't reach server**: confirm phone Wi-Fi is the same as the laptop and the
  backend is up (`curl http://localhost:3000/health`). Firewall may need to allow port 3000
  inbound (Linux: `sudo ufw allow 3000`).
- **No location fix indoors**: enable GPS / high accuracy; move near a window.
- Streaming clears when the socket closes — the dashboard shows only *live* positions.
- `WS OPEN` + `LAST PING` on the console confirm data is flowing.