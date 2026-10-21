#!/usr/bin/env bash
# Phase 2 smoke test — Redis live cache + write-back to PostgreSQL.
# Starts its own backend on port 3100 with a fast flush interval.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3100}"
BASE="${BASE:-http://localhost:${PORT}}"
DB_CONT="${DB_CONT:-fyp-postgres}"
REDIS_CONT="${REDIS_CONT:-fyp-redis}"
DB_NAME="${DB_NAME:-fyp_db}"
DB_USER="${DB_USER:-postgres}"
LOG="/tmp/transit-phase2-server.log"
TS="$(date +%s)$RANDOM"
EMAIL="org_${TS}@phase2.test"
PLATE="P2-${TS}"
PASSED=0
FAILED=0

pass() { echo "  PASS  $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1 [$3]"; else fail "$1 [expected $2, got $3]"; fi; }
jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

cleanup_db() {
  docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q \
    -c "DELETE FROM company WHERE email LIKE '%@phase2.test';" \
    -c "DELETE FROM \"telemetryPoint\" WHERE device_id LIKE 'P2-%';" \
    >/dev/null 2>&1 || true
  docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:live:P2-*" \
    | xargs -r -n1 docker exec "$REDIS_CONT" redis-cli del >/dev/null 2>&1 || true
}

echo "== TRANSIT Phase 2 smoke test =="

if docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q -c "SELECT 1" >/dev/null 2>&1; then
  pass "postgres reachable"
else
  fail "postgres not reachable"; exit 1
fi
if docker exec "$REDIS_CONT" redis-cli ping >/dev/null 2>&1; then
  pass "redis reachable"
else
  fail "redis not reachable"; exit 1
fi

echo "-- building backend --"
if (cd "$ROOT/Back-End" && npm run build >/dev/null 2>&1); then pass "backend build"; else fail "backend build"; exit 1; fi

pushd "$ROOT/Back-End" >/dev/null
PORT="$PORT" TELEMETRY_FLUSH_MS=800 node dist/server.js >"$LOG" 2>&1 &
SRV=$!
popd >/dev/null
cleanup() { kill "$SRV" 2>/dev/null; cleanup_db; }
trap cleanup EXIT
for _ in $(seq 1 30); do curl -s -m 1 "$BASE/health" >/dev/null 2>&1 && break; sleep 0.5; done
if curl -s -m 1 "$BASE/health" >/dev/null 2>&1; then pass "server started on :$PORT"; else fail "server start"; exit 1; fi

# Infrastructure status reports Redis as the cache backend.
STATUS="$(curl -s "$BASE/telemetry/status")"
BACKEND="$(echo "$STATUS" | jget '["cache"]["backend"]')"
check "cache backend is redis" "redis" "$BACKEND"
POSTGIS="$(echo "$STATUS" | python3 -c 'import sys,json;print("yes" if json.load(sys.stdin)["spatial"]["postgis"] else "no")')"
check "postgis reported by API" "yes" "$POSTGIS"

# Company -> bus -> driver session -> driver login
TOKEN="$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"company_name\":\"Phase2 Co\",\"password\":\"password123\"}" | jget '["token"]')"
AUTH="Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/buses" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"company_id\":1,\"plate_number\":\"$PLATE\",\"capacity\":30}" >/dev/null
SESSION_CODE="$(curl -s -X POST "$BASE/sessions" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"plate_number\":\"$PLATE\"}" | jget '["session_code"]')"
DTOKEN="$(curl -s -X POST "$BASE/driver/login" -H 'Content-Type: application/json' \
  -d "{\"session_code\":\"$SESSION_CODE\",\"plate_number\":\"$PLATE\"}" | jget '["token"]')"
if [ -n "$DTOKEN" ]; then pass "driver logged in (session $SESSION_CODE)"; else fail "driver login"; fi

# Session hardening: the code is single-use (consumed on first login).
RELOGIN="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/driver/login" -H 'Content-Type: application/json' \
  -d "{\"session_code\":\"$SESSION_CODE\",\"plate_number\":\"$PLATE\"}")"
check "session code is single-use" "401" "$RELOGIN"

# Driver pushes a position -> goes to Redis live cache.
POS="$(curl -s -X POST "$BASE/driver/position" -H "Authorization: Bearer $DTOKEN" -H 'Content-Type: application/json' \
  -d '{"lat":6.5244,"lng":3.3792,"speed":42.5,"heading":90}')"
OK="$(echo "$POS" | python3 -c 'import sys,json;print("ok" if json.load(sys.stdin).get("ok") else "no")')"
check "driver position accepted" "ok" "$OK"

# Live cache read
LIVE="$(curl -s "$BASE/telemetry/live")"
COUNT="$(echo "$LIVE" | jget '["count"]')"
DEVICE="$(echo "$LIVE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["positions"];print(d[0]["deviceId"] if d else "NONE")')"
check "live cache has 1 device" "1" "$COUNT"
check "live cache device is the bus plate" "$PLATE" "$DEVICE"
SPEED="$(curl -s "$BASE/telemetry/live/$PLATE" | jget '["speed"]')"
check "single live lookup returns the sample" "42.5" "$SPEED"

# Redis actually holds the key with a TTL
RKEY="$(docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:live:$PLATE" | head -1)"
check "redis holds the live key" "transit:live:$PLATE" "$RKEY"
TTL="$(docker exec "$REDIS_CONT" redis-cli ttl "transit:live:$PLATE" | tr -d '[:space:]')"
if [ "$TTL" -gt 0 ] 2>/dev/null; then pass "redis key has a TTL [${TTL}s]"; else fail "redis key TTL [$TTL]"; fi

# Write-back: wait for flush, then check PostgreSQL
sleep 2
ROWS="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM \"telemetryPoint\" WHERE device_id='$PLATE';" | tr -d '[:space:]')"
if [ "$ROWS" -ge 1 ] 2>/dev/null; then pass "write-back persisted $ROWS row(s)"; else fail "write-back persisted rows [$ROWS]"; fi
GEOMT="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT ST_GeometryType(geom) FROM \"telemetryPoint\" WHERE device_id='$PLATE' LIMIT 1;" | tr -d '[:space:]')"
check "persisted point is a PostGIS Point" "ST_Point" "$GEOMT"
BUSLINK="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM \"telemetryPoint\" WHERE device_id='$PLATE' AND bus_id IS NOT NULL;" | tr -d '[:space:]')"
if [ "$BUSLINK" -ge 1 ] 2>/dev/null; then pass "write-back linked the bus"; else fail "write-back bus link [$BUSLINK]"; fi

echo
echo "== Result: $PASSED passed, $FAILED failed =="
if [ "$FAILED" -eq 0 ]; then echo "PHASE 2 SMOKE TEST: PASS"; else echo "PHASE 2 SMOKE TEST: FAIL"; fi
exit "$FAILED"
