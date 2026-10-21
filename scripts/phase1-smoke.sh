#!/usr/bin/env bash
# Phase 1 smoke test — TRANSIT backend
# Covers: auth, buses, routes + stops, journeys, PostGIS geometry, nearest responder.
# Safe to re-run: creates throwaway @phase1.test rows and cleans them up at the end.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3101}"
BASE="${BASE:-http://localhost:${PORT}}"
DB_CONT="${DB_CONT:-fyp-postgres}"
DB_NAME="${DB_NAME:-fyp_db}"
DB_USER="${DB_USER:-postgres}"
LOG="/tmp/transit-phase1-server.log"
TS="$(date +%s)$RANDOM"
EMAIL="org_${TS}@phase1.test"
PLATE="P1-${TS}"
PASSED=0
FAILED=0

pass() { echo "  PASS  $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }
check() {
  if [ "$2" = "$3" ]; then pass "$1 [$3]"; else fail "$1 [expected $2, got $3]"; fi
}
jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

cleanup_db() {
  docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q \
    -c "DELETE FROM company WHERE email LIKE '%@phase1.test';" \
    -c "DELETE FROM \"emergencyResponders\" WHERE email LIKE '%@phase1.test';" \
    -c "DELETE FROM \"stop\" WHERE id NOT IN (SELECT stop_id FROM \"routeStop\");" \
    >/dev/null 2>&1 || true
}

echo "== TRANSIT Phase 1 smoke test =="

# 0. Postgres reachable
if docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q -c "SELECT 1" >/dev/null 2>&1; then
  pass "postgres reachable ($DB_CONT)"
else
  fail "postgres not reachable — is 'docker compose up -d' running in Database/?"
  exit 1
fi

echo "-- applying PostGIS layer (idempotent) --"
if docker exec -i "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q \
  < "$ROOT/Database/migrations/2026-10-14_postgis_spatial.sql" >/dev/null 2>&1; then
  pass "postgis migration applied"
else
  fail "postgis migration"
fi

# 1. Start server if not already running
SRV=""
if curl -s -m 1 "$BASE/health" >/dev/null 2>&1; then
  pass "server already running at $BASE"
else
  echo "-- building backend --"
  if (cd "$ROOT/Back-End" && npm run build >/dev/null 2>&1); then
    pass "backend build"
  else
    fail "backend build"
    exit 1
  fi
  pushd "$ROOT/Back-End" >/dev/null
  PORT="$PORT" node dist/server.js >"$LOG" 2>&1 &
  SRV=$!
  popd >/dev/null
  for _ in $(seq 1 30); do curl -s -m 1 "$BASE/health" >/dev/null 2>&1 && break; sleep 0.5; done
  if curl -s -m 1 "$BASE/health" >/dev/null 2>&1; then
    pass "server started (pid $SRV)"
  else
    fail "server failed to start — see $LOG"
    exit 1
  fi
fi

cleanup() {
  if [ -n "$SRV" ]; then kill "$SRV" 2>/dev/null; fi
  cleanup_db
}
trap cleanup EXIT

# 2. Register a company
TOKEN="$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"company_name\":\"Phase1 Co\",\"password\":\"password123\"}" | jget '["token"]')"
if [ -n "$TOKEN" ]; then pass "company registered"; else fail "company registration"; fi
AUTH="Authorization: Bearer $TOKEN"

# 3. Create a bus
BUS_ID="$(curl -s -X POST "$BASE/buses" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"company_id\":1,\"plate_number\":\"$PLATE\",\"capacity\":40}" | jget '["id"]')"
if [ -n "$BUS_ID" ]; then pass "bus created (id=$BUS_ID)"; else fail "bus create"; fi

# 3b. Edit the bus (fleet edit)
UBUS="$(curl -s -X PUT "$BASE/buses/$BUS_ID" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"capacity":45,"status":"MAINTENANCE"}')"
check "bus capacity updated" "45" "$(echo "$UBUS" | jget '["capacity"]')"
check "bus status updated" "MAINTENANCE" "$(echo "$UBUS" | jget '["status"]')"
# Put it back to a usable state for the journey tests below.
curl -s -X PUT "$BASE/buses/$BUS_ID" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"status":"OFFLINE"}' >/dev/null

# 4. Create a route with a LineString polyline + 2 stops
ROUTE_JSON="$(curl -s -X POST "$BASE/routes" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"route_code":"P1","name":"Phase 1 Route","polyline":"LINESTRING(3.3792 6.5244, 3.947 7.3775)","stops":[{"name":"Lagos","latitude":6.5244,"longitude":3.3792,"radius_meters":150},{"name":"Ibadan","latitude":7.3775,"longitude":3.947,"radius_meters":120}]}')"
RID="$(echo "$ROUTE_JSON" | jget '["id"]')"
NSTOPS="$(echo "$ROUTE_JSON" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["stops"]))' 2>/dev/null || echo 0)"
if [ -n "$RID" ]; then pass "route created (id=$RID)"; else fail "route create"; fi
check "route has 2 stops attached" "2" "$NSTOPS"

# 5. Route is scoped + readable
LIST="$(curl -s "$BASE/routes" -H "$AUTH")"
HAS="$(echo "$LIST" | python3 -c 'import sys,json;print(any(r["route_code"]=="P1" for r in json.load(sys.stdin)))' 2>/dev/null || echo False)"
check "route appears in company route list" "True" "$HAS"

# 6. Create (assign) a journey -> SCHEDULED; bus locked ON_JOURNEY
JID="$(curl -s -X POST "$BASE/journeys" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"bus_id\":$BUS_ID,\"route_id\":$RID}" | jget '["id"]')"
if [ -n "$JID" ]; then pass "journey created (id=$JID)"; else fail "journey create"; fi
GJ="$(curl -s "$BASE/journeys/$JID" -H "$AUTH")"
check "journey created as SCHEDULED" "SCHEDULED" "$(echo "$GJ" | jget '["status"]')"
check "journey fetch includes plate" "$PLATE" "$(echo "$GJ" | jget '["plate_number"]')"
BSTATUS="$(curl -s "$BASE/buses/$BUS_ID" -H "$AUTH" | jget '["status"]')"
check "bus locked ON_JOURNEY on assignment" "ON_JOURNEY" "$BSTATUS"
DUP="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/journeys" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"bus_id\":$BUS_ID,\"route_id\":$RID}")"
check "duplicate assignment rejected" "409" "$DUP"
RINUSE="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/routes/$RID" -H "$AUTH")"
check "assigned journey protects its route" "409" "$RINUSE"

# 6b. Driver session + lifecycle (driver starts/ends from their device)
SC="$(curl -s -X POST "$BASE/sessions" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"plate_number\":\"$PLATE\"}" | jget '["session_code"]')"
DTOKEN="$(curl -s -X POST "$BASE/driver/login" -H 'Content-Type: application/json' \
  -d "{\"session_code\":\"$SC\",\"plate_number\":\"$PLATE\"}" | jget '["token"]')"
DAUTH="Authorization: Bearer $DTOKEN"
[ -n "$DTOKEN" ] && pass "driver logged in" || fail "driver login"
# Journey owns the bus status while assigned: manual override must be rejected.
LOCK="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/driver/status" -H "$DAUTH" -H 'Content-Type: application/json' \
  -d '{"status":"ACTIVE"}')"
check "driver cannot override ON_JOURNEY lock" "409" "$LOCK"
DBUS="$(curl -s "$BASE/driver/bus" -H "$DAUTH")"
check "driver sees bus state ON_JOURNEY" "ON_JOURNEY" "$(echo "$DBUS" | jget '["status"]')"
DJ="$(curl -s "$BASE/driver/journey" -H "$DAUTH")"
check "driver sees SCHEDULED journey" "SCHEDULED" "$(echo "$DJ" | jget '["journey"]["status"]')"
check "driver journey includes route stops" "2" "$(echo "$DJ" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["stops"]))')"
START="$(curl -s -X POST "$BASE/driver/journey/start" -H "$DAUTH")"
check "driver starts journey -> ACTIVE" "ACTIVE" "$(echo "$START" | jget '["status"]')"
BSTATUS2="$(curl -s "$BASE/buses/$BUS_ID" -H "$AUTH" | jget '["status"]')"
check "bus stays ON_JOURNEY while active" "ON_JOURNEY" "$BSTATUS2"
ENDJ="$(curl -s -X POST "$BASE/driver/journey/end" -H "$DAUTH")"
check "driver ends journey -> COMPLETED" "COMPLETED" "$(echo "$ENDJ" | jget '["status"]')"
BSTATUS3="$(curl -s "$BASE/buses/$BUS_ID" -H "$AUTH" | jget '["status"]')"
check "bus released to ACTIVE after journey" "ACTIVE" "$BSTATUS3"
DBUS2="$(curl -s "$BASE/driver/bus" -H "$DAUTH")"
check "driver sees bus ACTIVE after end" "ACTIVE" "$(echo "$DBUS2" | jget '["status"]')"
UNLOCK="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/driver/status" -H "$DAUTH" -H 'Content-Type: application/json' \
  -d '{"status":"OFFLINE"}')"
check "driver can set status when off journey" "200" "$UNLOCK"
curl -s -X PATCH "$BASE/driver/status" -H "$DAUTH" -H 'Content-Type: application/json' \
  -d '{"status":"ACTIVE"}' >/dev/null

# 6c. A bus in maintenance cannot be assigned.
curl -s -X PUT "$BASE/buses/$BUS_ID" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"status":"MAINTENANCE"}' >/dev/null
MNT="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/journeys" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"bus_id\":$BUS_ID,\"route_id\":$RID}")"
check "maintenance bus cannot be assigned" "409" "$MNT"
curl -s -X PUT "$BASE/buses/$BUS_ID" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"status":"ACTIVE"}' >/dev/null

# 6d. PostGIS geometry (before hard-deleting the route)
GEOM="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT ST_GeometryType(geom) FROM route WHERE id=$RID;" | tr -d '[:space:]')"
check "route geometry stored as PostGIS LineString" "ST_LineString" "$GEOM"

# 7. Hard delete + archive (journey, then route)
JDEL="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/journeys/$JID" -H "$AUTH")"
check "journey hard-deleted" "204" "$JDEL"
GONE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/journeys/$JID" -H "$AUTH")"
check "deleted journey gone from detail" "404" "$GONE"
JROW="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM journey WHERE id=$JID;" | tr -d '[:space:]')"
check "journey removed from live table" "0" "$JROW"
JARCH="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM \"archivedRecord\" WHERE entity_type='JOURNEY' AND entity_id=$JID;" | tr -d '[:space:]')"
check "journey archived for audit" "1" "$JARCH"

RDEL="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/routes/$RID" -H "$AUTH")"
check "route hard-deleted" "204" "$RDEL"
RGONE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/routes/$RID" -H "$AUTH")"
check "deleted route gone from detail" "404" "$RGONE"
RROW="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM route WHERE id=$RID;" | tr -d '[:space:]')"
check "route removed from live table" "0" "$RROW"
RARCH="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM \"archivedRecord\" WHERE entity_type='ROUTE' AND entity_id=$RID;" | tr -d '[:space:]')"
check "route archived for audit" "1" "$RARCH"

# 7b. Google Maps link resolver (no external network needed for these cases)
BADLINK="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/maps/resolve-link" -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/evil"}')"
check "maps link rejects non-google host" "400" "$BADLINK"
LONG="$(curl -s -X POST "$BASE/maps/resolve-link" -H 'Content-Type: application/json' \
  -d '{"url":"https://www.google.com/maps/place/X/@6.5244,3.3792,17z"}')"
check "maps link parses coordinates" "6.5244" "$(echo "$LONG" | jget '["latitude"]')"

# 8. Auth is enforced
UNAUTH="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/routes")"
check "routes require a token" "401" "$UNAUTH"

# 9. PostGIS: nearest responder ordering
NEAR="$(curl -s -X POST "$BASE/auth/register-responder" -H 'Content-Type: application/json' \
  -d "{\"name\":\"FRSC $TS\",\"email\":\"frsc_${TS}@phase1.test\",\"password\":\"password123\",\"agency_type\":\"FRSC\"}" | jget '["token"]')"
FARR="$(curl -s -X POST "$BASE/auth/register-responder" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Police $TS\",\"email\":\"police_${TS}@phase1.test\",\"password\":\"password123\",\"agency_type\":\"POLICE\"}" | jget '["token"]')"
curl -s -X POST "$BASE/responders/me/locations" -H "Authorization: Bearer $NEAR" -H 'Content-Type: application/json' \
  -d '{"branch_name":"Lagos Base","latitude":6.53,"longitude":3.38}' >/dev/null
curl -s -X POST "$BASE/responders/me/locations" -H "Authorization: Bearer $FARR" -H 'Content-Type: application/json' \
  -d '{"branch_name":"Kano Base","latitude":12.0,"longitude":8.5}' >/dev/null
NEAREST="$(curl -s "$BASE/responders/nearest?latitude=6.5244&longitude=3.3792&limit=1" -H "$AUTH")"
FIRST="$(echo "$NEAREST" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["location"]["branch_name"] if d else "NONE")' 2>/dev/null || echo NONE)"
check "nearest responder is the closest branch" "Lagos Base" "$FIRST"

# 10. Bus hard delete + archive; plate becomes reusable
BDEL="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/buses/$BUS_ID" -H "$AUTH")"
check "bus hard-deleted" "204" "$BDEL"
BGONE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/buses/$BUS_ID" -H "$AUTH")"
check "deleted bus gone from detail" "404" "$BGONE"
BROW="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM bus WHERE id=$BUS_ID;" | tr -d '[:space:]')"
check "bus removed from live table" "0" "$BROW"
BARCH="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM \"archivedRecord\" WHERE entity_type='BUS' AND entity_id=$BUS_ID;" | tr -d '[:space:]')"
check "bus archived for audit" "1" "$BARCH"
BREUSE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/buses" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"company_id\":1,\"plate_number\":\"$PLATE\",\"capacity\":40}")"
check "plate reusable after hard delete" "201" "$BREUSE"

echo
echo "== Result: $PASSED passed, $FAILED failed =="
if [ "$FAILED" -eq 0 ]; then
  echo "PHASE 1 SMOKE TEST: PASS"
else
  echo "PHASE 1 SMOKE TEST: FAIL"
fi
exit "$FAILED"
