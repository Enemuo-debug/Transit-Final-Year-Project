#!/usr/bin/env bash
# Phase 2 deep verification:
#  A) WebSocket telemetry -> Redis -> live API
#  B) WS disconnect removes the live key
#  C) Redis TTL actually counts down
#  D) graceful fallback to in-process cache when Redis URL is unreachable
#  E) write-back persists to PostgreSQL and does not duplicate unchanged samples
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONT="${DB_CONT:-fyp-postgres}"
REDIS_CONT="${REDIS_CONT:-fyp-redis}"
DB_NAME="${DB_NAME:-fyp_db}"
DB_USER="${DB_USER:-postgres}"
TS="$(date +%s)$RANDOM"
WSCLIENT="$ROOT/Back-End/.transit-ws-ping.mjs"
PASSED=0; FAILED=0
PIDS=()

pass() { echo "  PASS  $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1 [$3]"; else fail "$1 [expected $2, got $3]"; fi; }
jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

cleanup() {
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done
  rm -f "$WSCLIENT"
  docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q \
    -c "DELETE FROM company WHERE email LIKE '%@phase2d.test';" \
    -c "DELETE FROM \"telemetryPoint\" WHERE device_id LIKE 'P2D-%';" >/dev/null 2>&1 || true
  docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:live:P2D-*" \
    | xargs -r -n1 docker exec "$REDIS_CONT" redis-cli del >/dev/null 2>&1 || true
}
trap cleanup EXIT

cat > "$WSCLIENT" <<'JS'
import WebSocket from "ws";
const [url, plate, lat, lng, holdMs] = process.argv.slice(2);
const ws = new WebSocket(url);
ws.on("open", () => {
  ws.send(JSON.stringify({ type: "ping", deviceId: plate, lat: Number(lat), lng: Number(lng), speed: 33, heading: 180, timestamp: new Date().toISOString() }));
});
ws.on("error", () => process.exit(1));
setTimeout(() => ws.close(), Number(holdMs) || 4000);
ws.on("close", () => process.exit(0));
JS

start_server() { # port extra_env...
  local port="$1"; shift
  pushd "$ROOT/Back-End" >/dev/null
  env PORT="$port" "$@" node dist/server.js >"/tmp/transit-deep-$port.log" 2>&1 &
  PIDS+=("$!")
  popd >/dev/null
  for _ in $(seq 1 30); do curl -s -m 1 "http://localhost:$port/health" >/dev/null 2>&1 && break; sleep 0.5; done
  curl -s -m 1 "http://localhost:$port/health" >/dev/null 2>&1
}

# register_fleet <base> <label> -> "TOKEN DTOKEN PLATE"
register_fleet() {
  local base="$1" label="$2"
  local plate="P2D-${label}-${TS: -8}"
  local email="org_${label}_${TS}@phase2d.test"
  local token sc dtoken
  token="$(curl -s -X POST "$base/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"company_name\":\"Deep $label\",\"password\":\"password123\"}" | jget '["token"]')"
  curl -s -X POST "$base/buses" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "{\"company_id\":1,\"plate_number\":\"$plate\",\"capacity\":30}" >/dev/null
  sc="$(curl -s -X POST "$base/sessions" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "{\"plate_number\":\"$plate\"}" | jget '["session_code"]')"
  dtoken="$(curl -s -X POST "$base/driver/login" -H 'Content-Type: application/json' \
    -d "{\"session_code\":\"$sc\",\"plate_number\":\"$plate\"}" | jget '["token"]')"
  echo "$token $dtoken $plate"
}

echo "== Phase 2 deep verification =="
docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q -c "SELECT 1" >/dev/null 2>&1 && pass "postgres reachable" || { fail "postgres"; exit 1; }
docker exec "$REDIS_CONT" redis-cli ping >/dev/null 2>&1 && pass "redis reachable" || { fail "redis"; exit 1; }
( cd "$ROOT/Back-End" && npm run build >/dev/null 2>&1 ) && pass "backend build" || { fail "build"; exit 1; }

echo "-- A) WebSocket -> Redis --"
start_server 3202 TELEMETRY_FLUSH_MS=800 || { fail "redis server start"; exit 1; }
read -r TOKEN DTOKEN PLATE_A <<<"$(register_fleet http://localhost:3202 A)"
check "driver token issued" "yes" "$([ -n "$DTOKEN" ] && echo yes || echo no)"

node "$WSCLIENT" "ws://localhost:3202/ws/telemetry?token=$DTOKEN" "$PLATE_A" 6.5244 3.3792 6000 &
WSPID=$!
sleep 1.5
LIVE="$(curl -s "http://localhost:3202/telemetry/live/$PLATE_A")"
SPEED="$(echo "$LIVE" | jget '["speed"]' 2>/dev/null || echo NONE)"
check "WS sample visible via live API" "33" "$SPEED"
RKEY="$(docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:live:$PLATE_A" | head -1)"
check "WS sample stored in Redis" "transit:live:$PLATE_A" "$RKEY"

echo "-- C) TTL counts down --"
TTL1="$(docker exec "$REDIS_CONT" redis-cli ttl "transit:live:$PLATE_A" | tr -d '[:space:]')"
sleep 2
TTL2="$(docker exec "$REDIS_CONT" redis-cli ttl "transit:live:$PLATE_A" | tr -d '[:space:]')"
if [ "$TTL2" -lt "$TTL1" ] 2>/dev/null && [ "$TTL2" -gt 0 ] 2>/dev/null; then
  pass "TTL decreasing [$TTL1 -> $TTL2]"
else
  fail "TTL not decreasing [$TTL1 -> $TTL2]"
fi

echo "-- E) write-back --"
sleep 2
ROWS1="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM \"telemetryPoint\" WHERE device_id='$PLATE_A';" | tr -d '[:space:]')"
[ "${ROWS1:-0}" -ge 1 ] 2>/dev/null && pass "write-back row present [$ROWS1]" || fail "write-back row [$ROWS1]"
sleep 2
ROWS2="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM \"telemetryPoint\" WHERE device_id='$PLATE_A';" | tr -d '[:space:]')"
if [ "$ROWS1" = "$ROWS2" ]; then pass "unchanged sample not duplicated [$ROWS2]"; else fail "duplicate write-back [$ROWS1 -> $ROWS2]"; fi

echo "-- B) WS disconnect clears live key --"
kill "$WSPID" 2>/dev/null
sleep 1.5
RKEY2="$(docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:live:$PLATE_A" | head -1)"
if [ -z "$RKEY2" ]; then pass "live key removed on disconnect"; else fail "live key still present [$RKEY2]"; fi

echo "-- D) graceful fallback (unreachable Redis) --"
start_server 3201 TELEMETRY_FLUSH_MS=800 REDIS_URL=redis://localhost:6399 || { fail "fallback server start"; exit 1; }
STATUS="$(curl -s "http://localhost:3201/telemetry/status")"
BACKEND="$(echo "$STATUS" | jget '["cache"]["backend"]')"
check "cache falls back to memory" "memory" "$BACKEND"
read -r TOKEN2 DTOKEN2 PLATE_B <<<"$(register_fleet http://localhost:3201 B)"
curl -s -X POST "http://localhost:3201/driver/position" -H "Authorization: Bearer $DTOKEN2" -H 'Content-Type: application/json' \
  -d '{"lat":7.3775,"lng":3.947,"speed":15,"heading":10}' >/dev/null
FCOUNT="$(curl -s "http://localhost:3201/telemetry/live" | jget '["count"]')"
check "telemetry still served during Redis outage" "1" "$FCOUNT"
sleep 2
FROWS="$(docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM \"telemetryPoint\" WHERE device_id='$PLATE_B' AND latitude=7.3775;" | tr -d '[:space:]')"
[ "${FROWS:-0}" -ge 1 ] 2>/dev/null && pass "write-back works from fallback cache" || fail "fallback write-back [$FROWS]"

echo
echo "== Result: $PASSED passed, $FAILED failed =="
[ "$FAILED" -eq 0 ] && echo "PHASE 2 DEEP TEST: PASS" || echo "PHASE 2 DEEP TEST: FAIL"
exit "$FAILED"
