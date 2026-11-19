#!/usr/bin/env bash
# Asserts the v0.1 trust model wording from owner decisions D4a and D4b
# (review decisions 30 and 31, issue 285) does not regress:
#   - the PRD and the unwinding ADR name the admin as trusted until the freeze;
#   - the PRD, the unwinding ADR and the timelock ADR state that bid secrecy
#     holds against any coalition holding less than two thirds of stake;
#   - no canonical doc states a one-half secrecy bound;
#   - no SCOUT(#242) marker for decision 30 or 31 remains in the docs;
#   - the review action list marks decisions 30 and 31 resolved.
#
# Usage: scripts/check-trust-model.sh [--self-test] [ROOT]
#   ROOT defaults to the repository root.
#   --self-test copies the docs to a temp dir, injects regressions, and
#   asserts the check fails on each of them.
set -euo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

PRD=docs/specifications/prd.md
UNWIND=docs/decisions/trustless-v0-1-unwinding.md
TIMELOCK=docs/decisions/aptos-validator-timelock.md
ACTIONS=docs/code-reviews/2026-11-11-2005-fable/09-action-list.md
CANONICAL=(docs/specifications docs/decisions docs/roadmap.md docs/architecture)

check() {
  local root="$1" fail=0 f
  cd "$root"

  for f in "$PRD" "$UNWIND"; do
    if ! grep -qiE 'admin[^|]*trusted until[^|]*freeze' "$f"; then
      echo "FAIL: $f does not name the admin as trusted until the freeze" >&2
      fail=1
    fi
  done

  for f in "$PRD" "$UNWIND" "$TIMELOCK"; do
    if ! grep -iE 'two thirds of stake' "$f" | grep -qiE 'secre'; then
      echo "FAIL: $f has no secrecy statement naming two thirds of stake" >&2
      fail=1
    fi
  done

  if grep -rniE 'one half|half of (the )?stake' "${CANONICAL[@]}" >&2; then
    echo "FAIL: canonical docs state a one-half bound (lines above)" >&2
    fail=1
  fi

  if grep -rnE 'SCOUT\(#242\).*decision (30|31)([^0-9]|$)' docs >&2; then
    echo "FAIL: SCOUT(#242) markers for decision 30 or 31 remain (lines above)" >&2
    fail=1
  fi

  for n in 30 31; do
    if ! grep -qE "^\| $n \| \*\*Resolved" "$ACTIONS"; then
      echo "FAIL: $ACTIONS does not mark decision $n resolved" >&2
      fail=1
    fi
  done

  return "$fail"
}

self_test() {
  local repo="$1" tmp failures=0 name
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/check-trust-model.XXXXXX")"
  trap 'rm -rf "$tmp"' RETURN

  # Each case: a name and a sed edit applied to one file in a fresh copy.
  local cases=(
    "one-half-bound|$PRD|\$a Bid secrecy holds against one half of stake."
    "half-of-the-stake|$TIMELOCK|\$a Secrecy needs half of the stake."
    "admin-not-named|$UNWIND|s/trusted until/trusted before/Ig"
    "no-two-thirds|$TIMELOCK|s/two thirds of stake/most stake/Ig"
    "scout-marker|$PRD|\$a <!-- SCOUT(#242) DOC: x (owner decision 30). -->"
    "not-resolved|$ACTIONS|s/^| 31 | \\*\\*Resolved/| 31 | Open/"
  )

  if ! (check "$repo") >/dev/null 2>&1; then
    echo "SELF-TEST FAIL: the unmodified docs do not pass" >&2
    return 1
  fi

  local c file expr
  for c in "${cases[@]}"; do
    IFS='|' read -r name file expr <<<"$c"
    rm -rf "$tmp/root"
    mkdir -p "$tmp/root"
    cp -R "$repo/docs" "$tmp/root/docs"
    sed -i -e "$expr" "$tmp/root/$file"
    if (check "$tmp/root") >/dev/null 2>&1; then
      echo "SELF-TEST FAIL: $name: the check passed on a regressed doc" >&2
      failures=1
    else
      echo "self-test ok: $name is rejected"
    fi
  done
  return "$failures"
}

ROOT_DEFAULT="$(cd "$(dirname "$SCRIPT")/.." && pwd)"
if [ "${1:-}" = "--self-test" ]; then
  self_test "${2:-$ROOT_DEFAULT}"
  echo "check-trust-model self-test passed"
  exit 0
fi

check "${1:-$ROOT_DEFAULT}"
echo "check-trust-model: trust model wording is current"
