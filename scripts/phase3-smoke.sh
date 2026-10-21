#!/usr/bin/env bash
# Phase 3 smoke test — anomaly engine + SOS + incident API.
# Runs its own backend on :3300 with tightened thresholds for a fast test.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3300}"
BASE="http://localhost:${PORT}"
DB_CONT="${DB_CONT:-fyp-postgres}"
REDIS_CONT="${REDIS_CONT:-fyp-redis}"
DB_NAME="${DB_NAME:-fyp_db}"
DB_USER="${DB_USER:-postgres}"
LOG="/tmp/transit-phase3-server.log"
TS="$(date +%s)$RANDOM"
PLATE="P3-${TS: -8}"
EMAIL="org_${TS}@phase3.test"
PASSED=0; FAILED=0

pass() { echo "  PASS  $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1 [$3]"; else fail "$1 [expected $2, got $3]"; fi; }
jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
jcount() { python3 -c "import sys,json;print(len(json.load(sys.stdin)))"; }

cleanup_db() {
  docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q \
    -c "DELETE FROM company WHERE email LIKE '%@phase3.test';" \
    -c "DELETE FROM \"telemetryPoint\" WHERE device_id LIKE 'P3-%';" >/dev/null 2>&1 || true
  docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:route:*" | xargs -r docker exec "$REDIS_CONT" redis-cli del >/dev/null 2>&1 || true
  docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:live:P3-*" | xargs -r docker exec "$REDIS_CONT" redis-cli del >/dev/null 2>&1 || true
}

echo "== TRANSIT Phase 3 smoke test =="
( cd "$ROOT/Back-End" && npm run build >/dev/null 2>&1 ) && pass "backend build" || { fail "build"; exit 1; }

pushd "$ROOT/Back-End" >/dev/null
# SMTP_* / MAIL_FROM forced empty so incident alerts never send real email in tests.
PORT="$PORT" \
  ANOMALY_EVAL_MS=0 ANOMALY_DEVIATION_METERS=200 ANOMALY_STOP_SECONDS=3 \
  ANOMALY_STOP_SPEED_KMH=2 ANOMALY_ACCIDENT_DECEL_KMH=30 ANOMALY_ACCIDENT_WINDOW_MS=30000 \
  INCIDENT_COOLDOWN_MS=2000 TELEMETRY_FLUSH_MS=60000 \
  SMTP_HOST= SMTP_USER= SMTP_PASS= MAIL_FROM= \
  node dist/server.js >"$LOG" 2>&1 &
SRV=$!
popd >/dev/null
cleanup() { kill "$SRV" 2>/dev/null; cleanup_db; }
trap cleanup EXIT
for _ in $(seq 1 30); do curl -s -m 1 "$BASE/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -s -m 1 "$BASE/health" >/dev/null 2>&1 && pass "server started :$PORT" || { fail "server start"; exit 1; }

# --- setup: company, bus, route (with stop), journey, driver session ---
TOKEN="$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"company_name\":\"Phase3 Co\",\"password\":\"password123\"}" | jget '["token"]')"
AUTH="Authorization: Bearer $TOKEN"
BUS_ID="$(curl -s -X POST "$BASE/buses" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"company_id\":1,\"plate_number\":\"$PLATE\",\"capacity\":30}" | jget '["id"]')"
ROUTE="$(curl -s -X POST "$BASE/routes" -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "route_code":"P3R","name":"Phase3 Route","polyline":"LINESTRING(3.3792 6.5244, 3.947 7.3775)",
  "stops":[{"name":"Origin","latitude":6.5244,"longitude":3.3792,"radius_meters":150}]}')"
RID="$(echo "$ROUTE" | jget '["id"]')"
curl -s -X POST "$BASE/journeys" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"bus_id\":$BUS_ID,\"route_id\":$RID}" >/dev/null
SC="$(curl -s -X POST "$BASE/sessions" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"plate_number\":\"$PLATE\"}" | jget '["session_code"]')"
DTOKEN="$(curl -s -X POST "$BASE/driver/login" -H 'Content-Type: application/json' \
  -d "{\"session_code\":\"$SC\",\"plate_number\":\"$PLATE\"}" | jget '["token"]')"
DAUTH="Authorization: Bearer $DTOKEN"
[ -n "$RID" ] && [ -n "$DTOKEN" ] && pass "fleet set up (bus=$BUS_ID route=$RID)" || fail "setup"

# Driver sees the assigned journey + route stops (mobile/web home screen).
JOURNEY="$(curl -s "$BASE/driver/journey" -H "$DAUTH")"
check "driver sees assigned journey code" "P3R" "$(echo "$JOURNEY" | jget '["journey"]["route_code"]')"
check "driver journey includes route stops" "1" "$(echo "$JOURNEY" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["stops"]))')"
check "assigned journey starts SCHEDULED" "SCHEDULED" "$(echo "$JOURNEY" | jget '["journey"]["status"]')"

# Driver starts the journey (required before anomaly detection).
STARTED="$(curl -s -X POST "$BASE/driver/journey/start" -H "$DAUTH")"
check "driver starts journey" "ACTIVE" "$(echo "$STARTED" | jget '["status"]')"

position() { # lat lng speed
  curl -s -X POST "$BASE/driver/position" -H "$DAUTH" -H 'Content-Type: application/json' \
    -d "{\"lat\":$1,\"lng\":$2,\"speed\":$3,\"heading\":90}" >/dev/null
}
count_type() { curl -s "$BASE/incidents?bus_id=$BUS_ID&type=$1" -H "$AUTH" | jcount; }

# --- negative: a normal moving sample on the corridor creates nothing ---
position 6.5244 3.3792 40
sleep 1
check "normal travel raises no incident" "0" "$(curl -s "$BASE/incidents?bus_id=$BUS_ID" -H "$AUTH" | jcount)"

# --- route deviation ---
position 6.9000 6.0000 50
sleep 1
[ "$(count_type ROUTE_DEVIATION)" -ge 1 ] && pass "ROUTE_DEVIATION detected" || fail "ROUTE_DEVIATION not detected"

# --- accident (sharp deceleration) ---
position 6.6000 3.4500 60
position 6.6000 3.4500 5
sleep 1
[ "$(count_type ACCIDENT)" -ge 1 ] && pass "ACCIDENT detected" || fail "ACCIDENT not detected"

# --- unanticipated stop (stationary off-stop for > threshold) ---
position 6.6000 3.5000 0
sleep 4
position 6.6000 3.5000 0
sleep 1
[ "$(count_type UNANTICIPATED_STOP)" -ge 1 ] && pass "UNANTICIPATED_STOP detected" || fail "UNANTICIPATED_STOP not detected"

# --- allowed-track cache populated in Redis ---
CACHED="$(docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:route:stops:$RID" | head -1)"
check "route stop cache present in Redis" "transit:route:stops:$RID" "$CACHED"

# --- SOS ---
SOS="$(curl -s -X POST "$BASE/incidents/sos" -H "$DAUTH" -H 'Content-Type: application/json' \
  -d '{"latitude":6.61,"longitude":3.51,"description":"Driver pressed SOS"}')"
STYPE="$(echo "$SOS" | jget '["type"]')"
SSEV="$(echo "$SOS" | jget '["severity"]')"
check "SOS raises DRIVER_SOS" "DRIVER_SOS" "$STYPE"
check "SOS severity is CRITICAL" "CRITICAL" "$SSEV"
DEDUP="$(curl -s -X POST "$BASE/incidents/sos" -H "$DAUTH" -H 'Content-Type: application/json' \
  -d '{"latitude":6.61,"longitude":3.51}' | jget '["deduplicated"]')"
check "duplicate SOS de-duplicated" "True" "$DEDUP"

# --- company incident API ---
LIST="$(curl -s "$BASE/incidents" -H "$AUTH" | jcount)"
[ "$LIST" -ge 4 ] && pass "incident feed lists incidents [$LIST]" || fail "incident feed [$LIST]"
FIRST_ID="$(curl -s "$BASE/incidents?limit=1" -H "$AUTH" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["id"] if d else "NONE")')"
RESOLVED="$(curl -s -X PATCH "$BASE/incidents/$FIRST_ID/status" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"status":"RESOLVED"}')"
RSTATUS="$(echo "$RESOLVED" | jget '["status"]')"
RAT="$(echo "$RESOLVED" | python3 -c 'import sys,json;print("yes" if json.load(sys.stdin)["resolved_at"] else "no")')"
check "incident can be resolved" "RESOLVED" "$RSTATUS"
check "resolved incident gets resolved_at" "yes" "$RAT"

echo
echo "== Result: $PASSED passed, $FAILED failed =="
[ "$FAILED" -eq 0 ] && echo "PHASE 3 SMOKE TEST: PASS" || echo "PHASE 3 SMOKE TEST: FAIL"
exit "$FAILED"
