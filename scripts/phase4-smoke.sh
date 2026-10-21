#!/usr/bin/env bash
# Phase 4 smoke test — nearest-responder dispatch + responder status flow + alerts.
# Runs its own backend on :3400. SMTP is intentionally unconfigured (mailer no-ops).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3400}"
BASE="http://localhost:${PORT}"
DB_CONT="${DB_CONT:-fyp-postgres}"
REDIS_CONT="${REDIS_CONT:-fyp-redis}"
DB_NAME="${DB_NAME:-fyp_db}"
DB_USER="${DB_USER:-postgres}"
LOG="/tmp/transit-phase4-server.log"
TS="$(date +%s)$RANDOM"
PLATE="P4-${TS: -8}"
PASSED=0; FAILED=0

pass() { echo "  PASS  $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1 [$3]"; else fail "$1 [expected $2, got $3]"; fi; }
jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
jcount() { python3 -c "import sys,json;print(len(json.load(sys.stdin)))"; }

cleanup_db() {
  docker exec "$DB_CONT" psql -U "$DB_USER" -d "$DB_NAME" -q \
    -c "DELETE FROM company WHERE email LIKE '%@phase4.test';" \
    -c "DELETE FROM \"emergencyResponders\" WHERE email LIKE '%@phase4.test';" \
    -c "DELETE FROM \"telemetryPoint\" WHERE device_id LIKE 'P4-%';" >/dev/null 2>&1 || true
  docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:route:*" | xargs -r docker exec "$REDIS_CONT" redis-cli del >/dev/null 2>&1 || true
  docker exec "$REDIS_CONT" redis-cli --scan --pattern "transit:live:P4-*" | xargs -r docker exec "$REDIS_CONT" redis-cli del >/dev/null 2>&1 || true
}

echo "== TRANSIT Phase 4 smoke test =="
( cd "$ROOT/Back-End" && npm run build >/dev/null 2>&1 ) && pass "backend build" || { fail "build"; exit 1; }

pushd "$ROOT/Back-End" >/dev/null
# SMTP_* / MAIL_FROM forced empty so the test never sends real email.
PORT="$PORT" ANOMALY_EVAL_MS=0 INCIDENT_COOLDOWN_MS=2000 DISPATCH_MAX_RESPONDERS=2 \
  TELEMETRY_FLUSH_MS=60000 REDIS_URL=redis://localhost:6379 \
  SMTP_HOST= SMTP_USER= SMTP_PASS= MAIL_FROM= \
  node dist/server.js >"$LOG" 2>&1 &
SRV=$!
popd >/dev/null
cleanup() { kill "$SRV" 2>/dev/null; cleanup_db; }
trap cleanup EXIT
for _ in $(seq 1 30); do curl -s -m 1 "$BASE/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -s -m 1 "$BASE/health" >/dev/null 2>&1 && pass "server started :$PORT" || { fail "server start"; exit 1; }

register_responder() { # name agency lat lng -> "TOKEN ID"
  local name="$1" agency="$2" lat="$3" lng="$4"
  local email="r_${agency}_${TS}@phase4.test"
  local reg token id
  reg="$(curl -s -X POST "$BASE/auth/register-responder" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"email\":\"$email\",\"password\":\"password123\",\"agency_type\":\"$agency\"}")"
  token="$(echo "$reg" | jget '["token"]')"
  id="$(echo "$reg" | jget '["user"]["id"]')"
  curl -s -X POST "$BASE/responders/me/locations" -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' -d "{\"branch_name\":\"$name Base\",\"latitude\":$lat,\"longitude\":$lng}" >/dev/null
  echo "$token $id"
}

# --- responders: near (0km), mid (~9km), far ---
read -r R1TOK R1ID <<<"$(register_responder "FRSC Near" FRSC 6.5244 3.3792)"
read -r R2TOK R2ID <<<"$(register_responder "Police Mid" POLICE 6.6 3.4)"
read -r R3TOK R3ID <<<"$(register_responder "NEMA Far" NEMA 9.0 7.5)"
[ -n "$R1ID" ] && [ -n "$R3ID" ] && pass "3 responders registered" || fail "responders"

# --- company + bus + route + journey + driver ---
EMAIL="org_${TS}@phase4.test"
TOKEN="$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"company_name\":\"Phase4 Co\",\"password\":\"password123\"}" | jget '["token"]')"
AUTH="Authorization: Bearer $TOKEN"
BUS_ID="$(curl -s -X POST "$BASE/buses" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"company_id\":1,\"plate_number\":\"$PLATE\",\"capacity\":30}" | jget '["id"]')"
RID="$(curl -s -X POST "$BASE/routes" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"route_code":"P4R","name":"Phase4 Route","polyline":"LINESTRING(3.3792 6.5244, 3.947 7.3775)","stops":[{"name":"Origin","latitude":6.5244,"longitude":3.3792}]}' | jget '["id"]')"
curl -s -X POST "$BASE/journeys" -H "$AUTH" -H 'Content-Type: application/json' -d "{\"bus_id\":$BUS_ID,\"route_id\":$RID}" >/dev/null
SC="$(curl -s -X POST "$BASE/sessions" -H "$AUTH" -H 'Content-Type: application/json' -d "{\"plate_number\":\"$PLATE\"}" | jget '["session_code"]')"
DTOKEN="$(curl -s -X POST "$BASE/driver/login" -H 'Content-Type: application/json' \
  -d "{\"session_code\":\"$SC\",\"plate_number\":\"$PLATE\"}" | jget '["token"]')"
DAUTH="Authorization: Bearer $DTOKEN"
# Driver starts the journey so SOS links to the route/journey.
curl -s -X POST "$BASE/driver/journey/start" -H "$DAUTH" >/dev/null

# --- raise SOS -> incident + auto-dispatch ---
SOS="$(curl -s -X POST "$BASE/incidents/sos" -H "$DAUTH" -H 'Content-Type: application/json' \
  -d '{"latitude":6.5244,"longitude":3.3792,"description":"SOS test"}')"
IID="$(echo "$SOS" | jget '["id"]')"
check "SOS incident created" "DRIVER_SOS" "$(echo "$SOS" | jget '["type"]')"
sleep 1.5

# --- company sees dispatches (top 2 nearest, not the far one) ---
DISP="$(curl -s "$BASE/dispatches/incident/$IID" -H "$AUTH")"
DN="$(echo "$DISP" | jcount)"
check "dispatched to top N responders" "2" "$DN"
HAS_R3="$(echo "$DISP" | python3 -c "import sys,json;print(any(d['responder_id']==$R3ID for d in json.load(sys.stdin)))")"
check "far responder not dispatched" "False" "$HAS_R3"
FIRST_RID="$(echo "$DISP" | jget '[0]["responder_id"]')"
check "nearest responder dispatched first" "$R1ID" "$FIRST_RID"
check "dispatch starts PENDING" "PENDING" "$(echo "$DISP" | jget '[0]["status"]')"

# --- incident moved to DISPATCHED ---
STATUS="$(curl -s "$BASE/incidents/$IID" -H "$AUTH" | jget '["status"]')"
check "incident marked DISPATCHED" "DISPATCHED" "$STATUS"

# --- responder 1 sees own dispatch and works the status flow ---
MY="$(curl -s "$BASE/dispatches" -H "Authorization: Bearer $R1TOK")"
DID="$(echo "$MY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((x['id'] for x in d if x['incident_id']==$IID), 'NONE'))")"
[ "$DID" != "NONE" ] && pass "responder sees assigned dispatch" || fail "responder dispatch missing"

ACC="$(curl -s -X PATCH "$BASE/dispatches/$DID/status" -H "Authorization: Bearer $R1TOK" -H 'Content-Type: application/json' -d '{"status":"ACCEPTED"}')"
check "dispatch ACCEPTED" "ACCEPTED" "$(echo "$ACC" | jget '["status"]')"
RM="$(echo "$ACC" | python3 -c 'import sys,json;v=json.load(sys.stdin)["response_minutes"];print("ok" if v is not None and v>=0 else "no")')"
check "response time measured" "ok" "$RM"
check "incident now IN_PROGRESS" "IN_PROGRESS" "$(curl -s "$BASE/incidents/$IID" -H "$AUTH" | jget '["status"]')"

curl -s -X PATCH "$BASE/dispatches/$DID/status" -H "Authorization: Bearer $R1TOK" -H 'Content-Type: application/json' -d '{"status":"EN_ROUTE"}' >/dev/null
ON="$(curl -s -X PATCH "$BASE/dispatches/$DID/status" -H "Authorization: Bearer $R1TOK" -H 'Content-Type: application/json' -d '{"status":"ON_SCENE"}')"
ARR="$(echo "$ON" | python3 -c 'import sys,json;print("yes" if json.load(sys.stdin)["arrived_at"] else "no")')"
check "arrival timestamp recorded" "yes" "$ARR"
DONE="$(curl -s -X PATCH "$BASE/dispatches/$DID/status" -H "Authorization: Bearer $R1TOK" -H 'Content-Type: application/json' -d '{"status":"COMPLETED"}')"
RES="$(echo "$DONE" | python3 -c 'import sys,json;print("yes" if json.load(sys.stdin)["resolved_at"] else "no")')"
check "completion timestamp recorded" "yes" "$RES"

# --- responder 2 cannot touch responder 1's dispatch ---
OTHER="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/dispatches/$DID/status" \
  -H "Authorization: Bearer $R3TOK" -H 'Content-Type: application/json' -d '{"status":"ACCEPTED"}')"
check "cross-responder update rejected" "404" "$OTHER"

# --- unauthenticated access blocked ---
UNAUTH="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/dispatches")"
check "dispatch API requires a token" "401" "$UNAUTH"

# --- mailer no-op when SMTP unconfigured ---
if grep -q "SMTP not configured" "$LOG"; then
  pass "email alerts no-op gracefully without SMTP"
else
  fail "expected mailer to log a skip"
fi

echo
echo "== Result: $PASSED passed, $FAILED failed =="
[ "$FAILED" -eq 0 ] && echo "PHASE 4 SMOKE TEST: PASS" || echo "PHASE 4 SMOKE TEST: FAIL"
exit "$FAILED"
