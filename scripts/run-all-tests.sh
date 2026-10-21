#!/usr/bin/env bash
# Runs the full TRANSIT test suite: backend unit tests + Phase 1–4 integration smoke tests.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

declare -a NAMES=()
declare -a RESULTS=()

run() {
  local name="$1"; shift
  echo
  echo "============================================================"
  echo "  $name"
  echo "============================================================"
  if "$@"; then
    NAMES+=("$name"); RESULTS+=("PASS")
  else
    NAMES+=("$name"); RESULTS+=("FAIL")
  fi
}

# Unit tests (compiles the backend as part of `npm test`).
run "Backend unit tests (anomaly rules)" bash -c "cd '$ROOT/Back-End' && npm test"

# Integration smoke tests.
run "Phase 1 — fleet, routes, journeys, PostGIS" bash "$ROOT/scripts/phase1-smoke.sh"
run "Phase 2 — Redis live cache + write-back" bash "$ROOT/scripts/phase2-smoke.sh"
run "Phase 3 — anomaly engine + SOS + incidents" bash "$ROOT/scripts/phase3-smoke.sh"
run "Phase 4 — dispatch + responder flow" bash "$ROOT/scripts/phase4-smoke.sh"

echo
echo "============================================================"
echo "  SUMMARY"
echo "============================================================"
failed=0
for i in "${!NAMES[@]}"; do
  printf '  %-45s %s\n' "${NAMES[$i]}" "${RESULTS[$i]}"
  [ "${RESULTS[$i]}" = "FAIL" ] && failed=$((failed + 1))
done
echo
if [ "$failed" -eq 0 ]; then
  echo "ALL SUITES PASSED"
else
  echo "$failed SUITE(S) FAILED"
fi
exit "$failed"
