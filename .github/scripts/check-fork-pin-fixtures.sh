#!/usr/bin/env bash
# Runs check-fork-pin.sh on each fixture under fixtures/check-fork-pin/ and on
# the real tree. Exits 1 unless `good` and the real tree exit 0 and the three
# bad cases exit 1.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/check-fork-pin.sh"
FIXTURES="$HERE/fixtures/check-fork-pin"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
status=0

expect() {
  local want=$1 name=$2 dir=$3 got
  bash "$CHECK" "$dir" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then
    echo "ok: ${name} exits ${got}"
  else
    echo "::error::check-fork-pin.sh on ${name} exited ${got}, expected ${want}"
    bash "$CHECK" "$dir" || true
    status=1
  fi
}

expect 0 good "$FIXTURES/good"
expect 1 move-toml-rev-mismatch "$FIXTURES/move-toml-rev-mismatch"
expect 1 other-binary-tag "$FIXTURES/other-binary-tag"
expect 1 short-proof-commit "$FIXTURES/short-proof-commit"
expect 0 "the real tree" "$ROOT"
exit "$status"
