# TRANSIT — UI Test Guide

How to test the whole system **through the interface**, role by role, with what you should
see at each step. (You said you'll read the code later for the internals, so this guide is
UI-first. An optional developer appendix is at the end.)

**Three roles:**
- **Organization (Admin)** — web console: fleet, routes, journeys, incidents, dispatch.
- **Responder** — web console: dispatch queue, accept/en-route/on-scene/complete.
- **Driver** — web driver screen **or** the mobile app: stream GPS + SOS.

---

## 1. Start the app

> **Temporary local port:** this machine's `Back-End/.env` currently sets `PORT=3001`, and
> `Front-End/.env` sets `VITE_API_URL`/`VITE_API_PORT=3001`. To revert to 3000, change those
> values back to 3000 (or remove the temporary lines) and restart both servers.

```bash
# A) databases (Postgres+PostGIS, Redis)
cd Database && docker compose up -d

# B) backend  (new terminal, from repo root)
npm run start:backend          # "Server is running on http://localhost:3000"

# C) frontend (new terminal)
npm run dev:frontend           # open the printed URL (http://localhost:5173)
```

Open the frontend URL. You'll land on the TRANSIT home page. Keep **two browser windows**
open (one for the Organization, one for the Responder) so you can watch them update live.

> Map: `Front-End/.env` already has a MapTiler key, so the live map renders. If it shows
> "MapTiler not configured", set `VITE_MAPTILER_API_KEY` in `Front-End/.env` and restart.
>
> Theme: use the **sun/moon** button in the header (or the Theme row on the home page) to switch
> **light/dark**. The choice is saved in the browser and applied on reload.

---

## 1b. Run it on your phone (PWA over LAN) — fastest path

The web app is now a **PWA**: the same React app can be opened on your phone and saved to the
home screen (no Expo/EAS build needed). The API and WebSocket URLs auto-detect your laptop's LAN
IP, so there's nothing to configure.

1. Phone and laptop on the **same Wi-Fi**.
2. Restart the backend (so it picks up the LAN-friendly CORS): `npm run start:backend`.
3. Start the frontend in LAN mode:
   ```bash
   npm run dev:frontend        # Vite now listens on 0.0.0.0
   ```
   Find your laptop IP: `hostname -I` (e.g. `192.168.1.20`).
4. On the phone browser open **`http://<laptop-ip>:5173`**. The app auto-detects the API/WS on the
   configured backend port (**`:3001`** right now) automatically. Sign in as Driver / Responder /
   Organization.
5. **Save it as an app:** browser menu → **Add to Home screen / Install app**. It then opens
   full-screen like a native app.
6. (Optional) serve the optimized PWA build instead of the dev server:
   ```bash
   npm run pwa                 # builds + serves on http://<ip>:4173
   ```
   Then open `http://<laptop-ip>:4173` on the phone.

**Important (GPS + installability):** browsers only allow **geolocation** and true PWA install on
**HTTPS** (or `localhost`). Over plain `http://<LAN-IP>`, `START STREAMING` fails with
*“Only secure origins are allowed.”* The easiest fix is a single HTTPS tunnel — the backend also
serves the built app, so the app and API share one secure origin:

```bash
npm run build:frontend     # build the PWA
npm run start:backend      # serves Front-End/dist + the API on :3001
~/.local/bin/cloudflared tunnel --url http://localhost:3001
```

Open the printed `https://<random>.trycloudflare.com` on the phone. GPS works, and **Add to Home
screen** produces a real standalone PWA (no `.env` changes needed). Keep that tunnel running for
the demo; the URL changes each time you restart it. (Install cloudflared once with
`sudo apt install cloudflared` or the single binary from Cloudflare’s GitHub releases.)

iOS Safari can also “Add to Home Screen” over LAN HTTP, but geolocation still needs HTTPS.

**Firewall:** allow ports **3000** and **5173** (or **4173**) — e.g.
`sudo ufw allow 3000/tcp && sudo ufw allow 5173/tcp`.

> For the driver, GPS streaming needs the phone's location permission; on a laptop use Chrome
> DevTools → Sensors to simulate movement (see §6).

---

## 2. Create accounts & sign in

Use these direct URLs (they avoid any ambiguity in the home-page buttons):

| Purpose | URL |
|---|---|
| Organization **sign-up** | `http://localhost:5173/signup/organization` |
| Responder **sign-up** | `http://localhost:5173/signup/responder` |
| **Sign in** (choose role) | `http://localhost:5173/signin` |
| Driver **sign in** | `http://localhost:5173/signin/driver` |

1. **Organization (window 1):** open `/signup/organization`. Use a **real email you can open** —
   incident alerts are emailed there. After sign-up you land on the **Command Dashboard**.
2. **Responder (window 2):** open `/signup/responder`. Pick an agency (FRSC / Police / NEMA /
   Medical). You land on the **Responder Console**.

> Home-page shortcut buttons: **Launch Command Dashboard** → org sign-up,
> **Monitor Live Telemetry** → responder sign-up. To log in later, go to `/signin` and choose
> **Organization / Driver / Responder**, or use the direct sign-in URLs above.
> Sign out from the top-right of either console to switch roles.

---

## 3. Organization — Fleet

**Side nav → Fleet**

1. Fill **NEW ASSET**: Plate number `ABC-123-XY`, Capacity `40`, Status `ACTIVE` → **Register
   Asset**. ✅ It appears under **REGISTERED ASSETS**.
2. In **DRIVER SESSIONS** click **CREATE CODE · ABC-123-XY**. ✅ A 6-character code (e.g.
   `K7M2QD`) appears with a **COPY** button. Keep it — the driver uses it.
   - Regenerating for the same bus is disabled while a code is active.
3. **Edit an asset:** click the **pencil** on any registered asset → the row turns into editable
   fields (plate, capacity, status) → change them → **Save**. ✅ The row updates; **Cancel** leaves
   it unchanged. (Used to fix a typo or take a bus in/out of `MAINTENANCE`.)
4. **Remove an asset:** click the **trash** icon → confirm. The bus is **hard-deleted from the
   live table** and a full snapshot is written to the **deleted-items archive** (`archivedRecord`).
   A bus **with journeys must have those journeys deleted first**; a bus linked to incident
   evidence cannot be deleted. The plate becomes reusable after deletion.
5. (Optional) **REVOKE** an active session → its dot turns grey / status `REVOKED`.

**Expected:** every asset and session is listed with its status; no mock data anywhere.

> **Bus states:** `ACTIVE` (available), `ON_JOURNEY` (assigned — set automatically), `MAINTENANCE`,
> `OFFLINE`. When a journey is created the bus becomes **ON_JOURNEY**; when the driver ends it the
> bus returns to **ACTIVE**. `ON_JOURNEY`/`MAINTENANCE` buses are excluded from the Journeys picker.
> You can still edit a bus's state (ACTIVE / MAINTENANCE / OFFLINE) with the pencil.

---

## 4. Organization — Routes (pick stops on the map)

**Side nav → Routes**

1. **Pick stops by clicking the map** (default mode):
   - **PICK STOPS ON MAP** is **ON** — the cursor becomes a crosshair.
   - Click the map where you want a stop (e.g. near Lagos). A **numbered pin** drops and the
     cursor briefly shows *"Looking up place…"*; the stop row's **name auto-fills** with the
     nearest place (e.g. *Eletu Odibo Street*).
   - Click a second point (e.g. near Ibadan). A **white preview line** now connects the pins.
   - **Or paste a Google Maps link** (short `https://maps.app.goo.gl/…` or a full
     `https://www.google.com/maps/...` URL) into **ADD FROM GOOGLE MAPS LINK** → **Add stop**.
     The exact coordinates are read (it prefers the place pin over the viewport centre) and the
     stop is named automatically. Great for grabbing a precise spot from Google Maps.
   - Use **Undo last stop** / **Clear stops** as needed.
2. **Route details:** Route Code `LAG-IB`, Route Name `Lagos to Ibadan`.
   - (You can still **Add stop manually** / type coordinates, or edit any row, if you prefer.)
   - **Build corridor from stops** → the Corridor field fills with a `LINESTRING(...)`.
3. Click **Create route**.
4. ✅ The route appears in **ROUTE NETWORK** ("2 stops · corridor set"), and its **red corridor
   line** is drawn on the map; the pins snap to the saved stops.

**Expected error checks:**
- Same Route Code again → banner *"A route with this code already exists."*
- **Delete rule:** a route **cannot be deleted while any journey still references it**
  (*"This route is used by a journey and cannot be deleted."*). Delete/archive those journeys
  first. Then **Remove** hard-deletes the route and its stops from the live tables and writes a
  full snapshot (route + stops + geometry) to the **deleted-items archive**. The route code is
  immediately reusable.

> Tip: the Corridor is what the anomaly engine measures against — a route with a corridor lets
> `ROUTE_DEVIATION` fire. **Build corridor from stops** is the quickest way to set it.

---

## 5. Organization — Journeys

**Side nav → Journeys**

1. **ASSIGN BUS TO ROUTE** → select the bus (`ABC-123-XY`) and the route (`LAG-IB`) →
   **Create journey**.
   - Only **available** buses are listed (buses on a journey, `ON_JOURNEY`, or `MAINTENANCE` are
     excluded; a note tells you how many are unavailable).
2. ✅ A row appears in **JOURNEY LOG** with status **SCHEDULED**, and the bus becomes
   **ON_JOURNEY** (locked for other journeys).
3. **Driver starts it** from their device (web §6 or phone §12) → the row becomes **ACTIVE**.
4. **Expected error check:** assign the same bus again → *"This bus is already assigned to a
   journey."*
5. **Driver ends it** → the row becomes **COMPLETED** and the bus returns to **ACTIVE**
   (available again).
6. **Open the live view:** click **Live view** on any journey row → opens the **journey detail**
   page (next section).
7. **Delete:** click **Delete** → hard-deletes the journey from the live table and writes a
   snapshot to the **deleted-items archive** (audit). Deleting an active journey also releases the
   bus.

Leave this journey **ACTIVE** — the driver will attach to it.

### 5b. Journey live view (Google-Maps-style follow)
On the journey detail page you get a live tracking view of that specific bus:
- **Blue route line** + numbered stop pins (the assigned route/corridor).
- A **blue navigation arrow** for the vehicle that **rotates with heading** and **moves** as the
  driver streams.
- **Follow** toggle (bottom-right): when on, the map keeps the vehicle centered and zoomed in
  (like Google Maps navigation); turn it off to pan/inspect the route freely.
- Live panel: **journey status**, **ELAPSED** timer, **TELEMETRY LIVE/OFFLINE**, speed, heading,
  coordinates, last update, and the route's stops.
- If the bus isn't streaming yet it shows *"AWAITING TELEMETRY"* / *"Waiting for the driver
  device to stream a position."*

> Demo tip: start streaming on the driver window and change its location (DevTools → Sensors,
> or the phone) — the arrow moves and the map follows in real time.

---

## 6. Driver (web console)

Open `http://localhost:5173/signin/driver`.

1. Sign in with the **session code** (from §3) + plate `ABC-123-XY`.
2. ✅ The **ASSIGNED JOURNEY** card shows `LAG-IB · Lagos to Ibadan`, its status, and the two stops.
3. **Journey lifecycle:**
   - Status **SCHEDULED** → press **START JOURNEY**. ✅ It becomes **ACTIVE** (the organization
     cannot do this — it is driver-triggered).
   - Status **ACTIVE** → at the end of the trip press **END JOURNEY**. ✅ It becomes **COMPLETED**
     and the bus returns to **ACTIVE** (available for a new journey).
4. **VEHICLE STATUS** → press **ON ROUTE / STANDBY / WORKSHOP** to change the bus status
   (manual states: `ACTIVE` / `MAINTENANCE` / `OFFLINE`).
5. **GPS TRACKING** → **START STREAMING** (allow location).
   - On a desktop with no GPS, open **Chrome DevTools → ⋮ → More tools → Sensors**, set
     **Location** to a **custom** point and check **"Location"** override. The driver screen
     will stream that point.
   - ✅ Card shows **LIVE GPS STREAMING**; the **LAST PING** panel updates with lat/lng/speed.
6. Leave it streaming and switch to the Organization window.

> **Expected:** the bus now appears on the org **Dashboard** map and under **LIVE ASSETS**,
> updating as the location changes. (It takes up to ~60s for the durable history row to flush.)

---

## 7. Organization — Dashboard (live view)

**Side nav → Dashboard**

- ✅ **Stat tiles:** FLEET SIZE ≥ 1, ACTIVE JOURNEYS = 1, LIVE TRACKED ≥ 1, OPEN INCIDENTS.
- ✅ **Map:** the `LAG-IB` corridor (red) + the moving bus marker.
- ✅ **ACTIVE INCIDENTS** and **LIVE ASSETS** lists populate in real time.
- The header shows **TELEMETRY LIVE** when the WebSocket is connected.

> **Driver session is single-use:** try signing in as the driver again with the same code —
> it's rejected. (Set `SESSION_SINGLE_USE=false` in `Back-End/.env` to allow re-login while
> rehearsing.)

---

## 8. Raising an incident (two ways, both via UI)

### 8a. SOS (instant, best for a demo)
On the **driver** window press **SEND SOS**.
✅ A `DRIVER_SOS` **CRITICAL** incident appears immediately in **Incidents** (and the company
email address receives an alert).

### 8b. Automatic anomaly detection (position-based)

The analyser looks at **movement, not speed**:
- **ROUTE_DEVIATION** — the position is more than `ANOMALY_DEVIATION_METERS` (default 300 m) off
  the assigned corridor. Raised immediately; the alert says **possible kidnapping/route
  diversion**, and dispatch prefers **Police** branches.
- **UNANTICIPATED_STOP** — the vehicle has **not moved for 2 minutes** (`ANOMALY_STOP_SECONDS=120`)
  and is **not inside any designated stop radius**. The alert says **possible accident, hold-up,
  breakdown, or kidnapping**, and is dispatched to the **closest FRSC branch** (if no FRSC unit is
  registered, it falls back to the closest available responder).

To demo:
- **Deviation:** with DevTools Sensors, set the location far off the corridor (e.g. lat `6.9`,
  lng `6.0`) → incident appears within a few seconds.
- **Stop:** set a location **on/near the corridor but away from the stops** (e.g. midpoint
  `6.95, 3.6625`) and leave it. It triggers after the configured no-movement window. For a fast
  demo set `ANOMALY_STOP_SECONDS=10` (and `ANOMALY_EVAL_MS=0`) in `Back-End/.env`, restart the
  backend, then re-stream.

> Speed (`km/h`) is ignored for detection. The engine compares positions over time (drift
> tolerance `ANOMALY_STOP_RADIUS_METERS=50`), so a stationary bus is detected even if its
> reported speed is wrong.

---

## 9. Organization — Incidents & dispatch

**Side nav → Incidents**

1. ✅ The feed lists incidents. Use the filter chips **All / Open / Dispatched / In progress /
   Resolved**.
2. ✅ The map shows incident markers (colour by severity).
3. Click an incident → the detail panel shows type, severity, status, vehicle, coordinates,
   detected time, and description. Click **Navigate** → opens Google Maps at the incident.
4. ✅ **DISPATCHED RESPONDERS** lists the nearest responder branches (nearest first) with their
   status and **(once accepted) response time in minutes**.
5. Use **Mark in progress / Resolve / False alarm** to drive the incident status.
   - Resolving stamps `resolved_at`.

---

## 10. Responder — dashboard console

In the **Responder** window (or sign in at `http://localhost:5173/signin/responder`).
The console is a cyan-accented dashboard: a hero status strip (`STANDBY`/`ENGAGED`), four stat
tiles (**Open dispatches / Acknowledged / Branches / Avg response**), a **Dispatch Queue**, and a
right rail with a **Coverage Map** (cyan = branches, coloured = incidents) plus branch management.

1. Add a branch: name (e.g. `Lagos Island Command`), latitude `6.53`, longitude `3.38`, or press
   **Use location** → **Add branch**. A branch must exist for the unit to be dispatchable.
   - The **Coverage Map** puts a cyan pin on every branch; dispatched incident locations appear as
     severity-coloured pins.
   - **Shortcut:** paste a Google Maps link into **Paste Google Maps link** → **Use** → the
     latitude/longitude fields fill in from the exact pin.
2. When an incident is raised near that branch, it appears in the **DISPATCH QUEUE** with the
   incident type/severity, coordinates, status, and a **Navigate** link. The stat tiles update
   (Open dispatches / Acknowledged / Avg response).
3. Work the flow: **Accept → En route → On scene → Complete**.
   - ✅ After **Accept**, a **Response time X min** appears.
   - ✅ The Organization's Incidents panel reflects each status change (incident goes
     **IN_PROGRESS** on accept).
   - **Decline** is available while the dispatch is still **PENDING**.
4. ✅ A responder cannot act on another responder's dispatch (only your own appear).

---

## 11. Email alerts

Incident creation sends email to the **company email** and to each **dispatched responder's
email**. Watch the inbox you registered with.
- If no email arrives, confirm SMTP is set in `Back-End/.env` (`SMTP_HOST/USER/PASS/MAIL_FROM`).
- To silence email during a noisy rehearsal, set `DISPATCH_ENABLED=false` in `Back-End/.env`
  and restart the backend (incidents are still recorded).

---

## 12. Mobile app (Expo Go)

Full details in `MOBILE_ROADMAP.md`; the short version:

1. Phone and laptop on the **same Wi-Fi**. Backend running (§1).
2. In the phone browser open `http://<laptop-ip>:3000/health` → `{"status":"OK"}`.
3. `cd Mobile-App && npm start`, then scan the QR with **Expo Go** (Android) or the Camera (iOS).
4. Sign in with the **session code + plate**; the **ASSIGNED JOURNEY** card shows the route + status.
5. **START JOURNEY** (if `SCHEDULED`) → it becomes **ACTIVE**; **END JOURNEY** when done →
   **COMPLETED** and the bus returns to **ACTIVE**.
6. **START STREAMING** → the bus appears on the org dashboard map.
7. **SEND SOS** → critical incident appears in the org console.

> Background streaming while the phone is locked is roadmap item **M2** and needs a dev/standalone
> build (not Expo Go).

---

## 13. Golden path checklist (one pass)

Print this and tick as you go:

- [ ] Databases + backend + frontend running; home page loads.
- [ ] Organization account created; Command Dashboard visible.
- [ ] Responder account created; Responder Console visible.
- [ ] Fleet: bus registered; **asset edited** (pencil → save); session code created (copied).
- [ ] Routes: stops picked on the map **or from a Google Maps link**; route created; corridor drawn.
- [ ] Routes: **Remove** hard-deletes it (blocked while any journey references it) and archives a snapshot.
- [ ] Journeys: **Create journey** → **SCHEDULED**; bus becomes **ON_JOURNEY**.
- [ ] Driver: signed in; **ASSIGNED JOURNEY** shown; **START JOURNEY** → **ACTIVE**.
- [ ] Driver: **END JOURNEY** → **COMPLETED**; bus returns to **ACTIVE**.
- [ ] Journeys: **Live view** opens with the moving arrow.
- [ ] Journeys: **Delete** hard-removes it and writes an `archivedRecord` snapshot.
- [ ] Fleet: **Delete** hard-removes an asset (after its journeys are deleted; no incidents) and archives it.
- [ ] Driver: streaming live.
- [ ] Dashboard: bus visible on map + **LIVE ASSETS**; stats correct.
- [ ] Incident raised (SOS **and** an automatic one).
- [ ] Incident list/filter/detail/map marker working; **Navigate** opens maps.
- [ ] Dispatched responders listed; incident → **DISPATCHED**.
- [ ] Responder: branch added; dispatch accepted → complete; response time shown.
- [ ] Organization: incident marked **IN_PROGRESS** then **RESOLVED**.
- [ ] Company/responses email received.
- [ ] (Optional) Mobile app streams and SOS.

---

## 14. Troubleshooting (UI)

| Symptom | Fix |
|---|---|
| Map blank / "MapTiler not configured" | set `VITE_MAPTILER_API_KEY` in `Front-End/.env`; restart frontend |
| "Something went wrong" on a form | check the matching field; the banner names the reason (e.g. duplicate code) |
| Bus never appears on the map | driver not streaming, or wrong Wi-Fi/API URL; check **TELEMETRY LIVE** indicator |
| No incidents trigger automatically | thresholds too high; lower `ANOMALY_STOP_SECONDS`/`ANOMALY_DEVIATION_METERS`, restart backend |
| Driver can't re-login | session code is single-use; create a new code, or set `SESSION_SINGLE_USE=false` |
| No responder in the dispatch list | add a **branch** in the Responder console (a unit with no active branch isn't routable) |
| No emails | check SMTP in `Back-End/.env`; or `DISPATCH_ENABLED=false` is set |
| Frontend won't start | run `npm install` inside `Front-End/` (the repo is 3 packages; root has no deps) |

---

## 15. Data retention (hard delete + archive) — for audit/intelligence review

Deleting removes the record from the **live** tables (no orphaned/stale data) and writes a full
JSON snapshot to the append-only **`archivedRecord`** table. Nothing in the archive is ever
deleted by the application.

| Entity | On delete | Live table | Archive |
|---|---|---|---|
| **Journey** | snapshot → hard delete; bus returns to `ACTIVE` | removed | `JOURNEY` snapshot |
| **Route** | snapshot (route + stops + geometry) → hard delete | removed | `ROUTE` snapshot |
| **Bus** | snapshot (bus + sessions) → hard delete | removed | `BUS` snapshot |
| **Incident / IncidentDispatch** | *Not deletable* — immutable evidence | kept | — |
| **TelemetryPoint** | *Not deletable* — track history | kept | — |

**Rules**
- A **route** can't be deleted while any journey references it — delete/archive those journeys first.
- A **bus** can't be deleted while it has journeys or incident evidence.
- **Bus lifecycle:** `ACTIVE` → `ON_JOURNEY` (on assignment) → `ACTIVE` (when the driver ends it).
- Incidents keep their own coordinates/type/severity/timestamp and `bus_id`, so they remain
  traceable even after the related journey/route snapshots move to the archive.

**Review deleted items** (e.g. for a report):

```bash
docker exec fyp-postgres psql -U postgres -d fyp_db -c "
  SELECT id, entity_type, entity_id, company_id, deleted_by, deleted_at,
         left(snapshot, 100) AS snapshot_preview
  FROM \"archivedRecord\"
  ORDER BY deleted_at DESC
  LIMIT 20;"
```

To inspect one record's full snapshot:

```bash
docker exec fyp-postgres psql -U postgres -d fyp_db -tAc \
  "SELECT snapshot FROM \"archivedRecord\" WHERE entity_type='JOURNEY' ORDER BY id DESC LIMIT 1;" \
  | python3 -m json.tool
```

**Incident evidence** stays in `incident`/`incidentDispatch` and can be listed with:

```bash
docker exec fyp-postgres psql -U postgres -d fyp_db -c "
  SELECT i.id, i.type, i.severity, i.status, i.detected_at, b.plate_number
  FROM incident i LEFT JOIN bus b ON b.id = i.bus_id
  ORDER BY i.detected_at DESC;"
```

---

## Appendix — developer checks (optional, not needed for the UI walkthrough)

- **Automated suite:** `npm test` at the repo root (or `bash scripts/run-all-tests.sh`) runs the
  backend unit tests (anomaly rules) plus the Phase 1–4 API integration suites.
- **Per-phase suites:** `npm run test:phase1` … `test:phase4`.
- **Unit tests only:** `npm run test:unit`.
- These hit the API directly; the UI calls the same endpoints, so a green suite means the
  console's actions will work. Use them when you want a fast regression before a demo.
