#!/usr/bin/env bash
# Proves pull-image-with-retry.sh retries exactly once, with a stub docker
# that counts calls, and proves check-ci-flake-guards.sh passes the good
# fixture and the real tree but fails each bad fixture.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/check-ci-flake-guards.sh"
PULL="$HERE/pull-image-with-retry.sh"
FIXTURES="$HERE/fixtures/check-ci-flake-guards"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
status=0

# pull_case NAME FAIL_FIRST WANT_CALLS WANT_EXIT(0|nonzero)
pull_case() {
  local name=$1 fail_first=$2 want_calls=$3 want_exit=$4 log rc calls ok=1
  log=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/flake-guard-pull.XXXXXX")
  PATH="$FIXTURES/stub-bin:$PATH" STUB_DOCKER_LOG="$log" STUB_DOCKER_FAIL_FIRST="$fail_first" \
    PULL_RETRY_DELAY_SECONDS=0 bash "$PULL" example/image:tag >/dev/null 2>&1
  rc=$?
  calls=$(wc -l < "$log")
  rm -f "$log"
  [ "$calls" -eq "$want_calls" ] || ok=0
  if [ "$want_exit" = 0 ]; then [ "$rc" -eq 0 ] || ok=0; else [ "$rc" -ne 0 ] || ok=0; fi
  if [ "$ok" -eq 1 ]; then
    echo "ok: pull ${name}: ${calls} calls, exit ${rc}"
  else
    echo "::error::pull ${name}: ${calls} calls, exit ${rc}; want ${want_calls} calls, exit ${want_exit}"
    status=1
  fi
}

pull_case first-success 0 1 0
pull_case fail-then-succeed 1 2 0
pull_case always-fail 99 2 nonzero

expect() {
  local want=$1 name=$2 dir=$3 got
  bash "$CHECK" "$dir" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then
    echo "ok: check-ci-flake-guards.sh on ${name} exits ${got}"
  else
    echo "::error::check-ci-flake-guards.sh on ${name} exited ${got}, expected ${want}"
    bash "$CHECK" "$dir" || true
    status=1
  fi
}

expect 0 good "$FIXTURES/good"
expect 1 bare-playwright-install "$FIXTURES/bare-playwright-install"
expect 1 cache-key-without-version "$FIXTURES/cache-key-without-version"
expect 1 pull-without-retry "$FIXTURES/pull-without-retry"
expect 1 pull-with-two-retries "$FIXTURES/pull-with-two-retries"
expect 0 "the real tree" "$ROOT"
exit "$status"
