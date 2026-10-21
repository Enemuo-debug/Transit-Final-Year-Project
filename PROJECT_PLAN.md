# TRANSIT — Emergency Response System for Transport Organizations

Plan to take the current codebase from its present state to a working system that
fully implements the requirements in `Final Year Project Report.pdf`
("Development of an Emergency Response System for Transport Organizations",
July 2026).

Status: **PLAN ONLY — nothing below has been implemented yet.**

---

## 1. Verified current state (tested 2026-09-20, as-is)

The app boots and the core loop works end to end:

| # | Flow | Result |
|---|------|--------|
| 1 | Backend `/health` | OK on port 3000 |
| 2 | Frontend dev server | Up on port 5174, all SPA routes `200` |
| 3 | Company login (`5ylqkecan@mozmail.com` / `password123`) | JWT `COMPANY` role |
| 4 | List buses (`GET /buses?company_id=1`) | Returns `ABC-123-XY` (company-scoped) |
| 5 | Driver sessions (`GET /sessions`) | `TEST42` visible + active |
| 6 | Driver login (`session_code` + `plate_number`) | JWT `DRIVER` role, resolves session/bus id |
| 7 | Driver REST position (`POST /driver/position`) | Recorded in `/telemetry/live` |
| 8 | Driver WS telemetry (`/ws/telemetry?token=...`) | Opens, pings broadcast back as `position` samples |
| 9 | Responder register/login/`/me` | JWT `RESPONDER` role |
| 10 | DB tables | `company`, `bus`, `driverSession`, `emergencyResponders`, PostGIS `spatial_ref_sys` |
| 11 | Mobile app | `tsc --noEmit` clean, Expo export bundles, WS + REST contract matches backend |

Known gaps found during testing:
- `GET /maps/config` returns `{"configured":false}` — **Google Maps API key missing**;
  all geocode / static-map / traffic endpoints will fail until it's set.
- Live telemetry is **in-memory only** (Node Map); cleared on server restart, no history.
- Class Analyser/flag logic absent. Session code can be reused (no expiry/consumption tracking).

---

## 2. What the report requires (gap analysis)

### 2.1 Architecture/orientation
- V-Model SDLC + Object-Oriented Analysis & Design (OOADM); actors:
  **Transport Organization (Admin)**, **Pilot/Driver (vehicle interface)**,
  **Emergency Responder**.
- Domain classes: Fleet Management, Route Construction, Emergency Incident Dispatch.
- Client–server with **full-duplex WebSockets**; backend ↔ **Redis** in-memory cache;
  persistent **PostgreSQL + PostGIS** spatial store.

### 2.2 Required entities (from report's database design)
- `Company` ✓ (exists), `Buses` ✓ (exists), `Emergency_Responders` ✓ (exists).
- **`Routes`** ✗ — actually a *route definition* (id, company, route_code, name).
- **`Stops`** ✗ — stop points (site name, lat/lon, optional radius).
- **`RouteStops`** ✗ — ordered link Route→Stop (stop_order).
- **`Journeys`** ✗ — a vehicle instance running a route at a time (links bus + route + driver session + started_at).
- **`Incidents`** ✗ — anomaly records (type, bus, lat/lon, timestamp, severity, resolution).
- **`IncidentDispatches`** ✗ — which responders were alerted for an incident + response time.
- **`ResponderLocations`** ✗ — physical branch/station coordinates for a responder org
  (needed for "nearest responder" logic). Note: `emergencyResponders` table exists but has **no lat/lon**.

### 2.3 Required functional features vs. current code
| Report feature | Current state | Needed |
|---|---|---|
| Real-time GPS telemetry via WebSocket | ✓ `telemetry.service.ts` broadcast loop | Secure auth-in-WS is present; need per-session deviceId validation |
| Redis in-memory cache (write-back) | ✗ plain Node `Map`, `fyp-redis` container exists but unused | Use Redis for live positions + route cache ("allowed track") |
| Persistent spatial DB (PostGIS) | ✓ extension + driverSession, ✗ no geometry columns | Geometry columns (Linestring routes, Point stops) |
| Route construction + geofencing | ✗ | Route/Stop/RouteStop models + stop-point radius checks |
| Anomaly detection: deviation / stop / accident / breakdown / kidnapping | ✗ | Analyser engine comparing telemetry against allowed track + halt detection |
| Detour via Google Maps (Traffic + Distance Matrix) | ✗ key missing, only geocode/static exist | Traffic API + Directions/DistanceMatrix for re-route + congestion classification |
| Automated dispatch to nearest responders | ✗ | Nearest-responder query (PostGIS `ST_DWithin`/`ORDER BY distance`) + dispatch records |
| Email alert to transport managers | ✗ no mailer | Nodemailer/Resend on incident creation |
| Incident log + audit trail | ✗ | `Incidents` + `IncidentDispatches` persistence |
| Admin dashboard visibility | partial (live map + fleet list) | Incident feed, journey view, geofence violations |
| Responder dashboard | partial (deployment list only) | Active incidents, accept/respond, navigation vector to incident |

---

## 3. Implementation plan (ordered tasks)

### Phase 0 — Foundations
1. **Fix Prisma migrations** — `migration plan` is broken because snapshot
   `contract.d.ts` files are gitignored. Un-ignore `Back-End/prisma/migrations/**/contract.d.ts`
   (or commit snapshots) so schema changes move through `migration plan` cleanly.
2. **Environments/config** — `.env` for backend (JWT secret, DB URL, Redis URL,
   `GOOGLE_MAPS_API_KEY`, SMTP creds) and frontend (Vite `VITE_GOOGLE_MAPS_API_KEY`,
   API base). Add `.env.example`. Obtain a real Google Maps API key with Traffic +
   DistanceMatrix enabled. Surface clear 503s → helpful setup messages.
3. **Wire Redis** — replace in-memory `livePositions` with Redis `fyp-redis`
   (hash `transit:live:*`, TTL ~30–60s, write-back to Postgres on flush/interval).
   Keep WS broadcast as-is.

### Phase 1 — Spatial schema & domain
4. **Schema additions** (`Back-End/prisma/contract.prisma`):
   - `Route` (company_id, code, name, polyline/geometry)
   - `Stop` (name, geom Point, radius)
   - `RouteStop` (route_id, stop_id, stop_order)
   - `Journey` (bus_id, route_id, session_id, started_at, ended_at, status)
   - `Incident` (bus_id, journey_id?, type, lat/lng, geo geometry, severity, status)
   - `IncidentDispatch` (incident_id, responder_id, dispatched_at, accepted_at, response_minutes)
   - `ResponderLocation` (responder_id, branch_name, geom Point) + add lat/lon to emergencyResponders
5. **Migration** via `migration plan` + apply (or raw SQL with `tsc -b` if broken).
   Create PostGIS geometry columns + spatial index (`usegist`).
6. **PostGIS helper service** — raw-SQL helpers: `ST_MakePoint`, `ST_SetSRID`,
   `ST_DWithin`, distance ordering.

### Phase 2 — Route construction
7. **Routes CRUD + UI** — company admin builds a route: select bus, create ordered
   stops (map picker), store as LineString. New frontend page
   `/dashboard/organization/routes` (RouteBuilder component, reuses LiveMap).
8. **Journey start** — starting a driver session attaches bus to a route → creates a
   Journey; telemetry then correlates to that journey's allowed track.

### Phase 3 — Anomaly engine (the "smart" core)
9. **Class /service `anomaly.engine.ts`** — input: telemetry sample + journey track.
   - *Route deviation*: distance from sample to Linestring corridor > threshold (Redis-cached track).
   - *Unanticipated stop*: speed≈0 at a non-stop location for N seconds.
   - *Accident*: sudden high ∆-deceleration, or driver distress flag (body-fixed number/sustained halt).
   - *Breakdown vs congestion classification*: query Google Maps **Traffic** for the segment —
     traffic congested → route to FRSC only; clear roadway while stopped → likely breakdown/crash → alert Police+FRSC+NEMA.
   - *Detour*: Google Maps Directions/DistanceMatrix from current pos to next stop, write new polyline to Redis cache.
10. **SOS / distress** — driver dashboard + mobile: an explicit emergency button that
    raises `Incident` immediately (kidnapping/attack case, bypasses analyzer thresholds).

### Phase 4 — Incident dispatch
11. **Nearest responder dispatch** — on Incident/CONFIRMED → `SELECT` responders with
    `ResponderLocation` nearest to incident (PostGIS), top N → create `IncidentDispatch`
    (status PENDING), fan-out alert via WS to responder dashboards + store.
12. **Email alerts** — mailer service (Nodemailer/Resend) on new Incident: transport
    managers of the owning company + dispatch notifications to responder heads.
13. **Responder console** — live incident feed, Accept/En route/On scene/Resolved
    status transitions, navigation link to incident coords, response-time metrics
    surfaced on org dashboard (audit trail).

### Phase 5 — Dashboards & hardening
14. **Org dashboard completion** — journeys view, route/geofence violations list,
    incident log with dispatch/response-times, bus detail w/ recent track history
    (from Postgres write-back, not just live map).
15. **Driver/mobile gates** — session code consumed on successful first login
    (prevent reuse), deviceId pinned to JWT.
16. **Testing** — per report objective: unit tests for anomaly engine (10+ cases),
    API integration tests, load/smoke for WS throughput, and a documented UAT walkthrough
    matching the report's evaluation.

### Phase 6 — Polish
17. **READMEs** — setup .env, seed responder stations, run full-stack quick-start.
18. **Deployment config** — scripts to boot Postgres+Redis+backend+frontend; (optional) Dockerfiles.

---

## 4. Test credentials (for demo/UAT)
- Org: `5ylqkecan@mozmail.com` / `password123` — Peace Mass Transit (company 1)
- Driver: session code `TEST42`, plate `ABC-123-XY`
- API base: backend `http://localhost:3000`, frontend `http://localhost:5174`

## 5. Out of scope (per report)
- Passenger-facing booking/ticketing module (report covers org-admin, driver, responder only).