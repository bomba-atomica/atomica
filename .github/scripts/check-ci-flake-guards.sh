#!/usr/bin/env bash
# Checks that test-web.yaml absorbs infra flakes the agreed way (issue 276):
# - Playwright installs only through the cached setup-playwright action;
# - that action's cache key carries the runner OS and the Playwright version;
# - every job that starts the Aptos Docker testnet pulls the validator image
#   with pull-image-with-retry.sh, and the workflow has no bare docker pull;
# - pull-image-with-retry.sh tries an always-failing pull exactly twice.
# Usage: check-ci-flake-guards.sh [ROOT]   (ROOT defaults to the repo root)
# Exits 1 and prints every failed check.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-$(git -C "$HERE" rev-parse --show-toplevel)}"
WORKFLOW="$ROOT/.github/workflows/test-web.yaml"
ACTION="$ROOT/.github/actions/setup-playwright/action.yml"
PULL="$ROOT/.github/scripts/pull-image-with-retry.sh"
STUB_BIN="$HERE/fixtures/check-ci-flake-guards/stub-bin"
PULL_JOBS="aptos-testnet-sdk browser-tests-anvil browser-tests-docker"
status=0

fail() {
  echo "::error::$*"
  status=1
}

for f in "$WORKFLOW" "$ACTION" "$PULL"; do
  [ -f "$f" ] || { fail "missing ${f#"$ROOT"/}"; }
done
[ "$status" -eq 0 ] || exit 1

# Playwright: no bare install in the workflow, the cached action in use.
if bare=$(grep -nE 'playwright[[:space:]]+install' "$WORKFLOW"); then
  fail "test-web.yaml runs a bare playwright install; use ./.github/actions/setup-playwright: ${bare}"
fi
if ! grep -qE 'uses:[[:space:]]+\./\.github/actions/setup-playwright' "$WORKFLOW"; then
  fail "test-web.yaml never uses ./.github/actions/setup-playwright"
fi

# The cache key must change with the runner OS and the Playwright version.
key=$(grep -E '^[[:space:]]+key:' "$ACTION" || true)
if ! grep -qE 'uses:[[:space:]]+actions/cache@' "$ACTION"; then
  fail "setup-playwright does not use actions/cache"
fi
if ! grep -q 'runner.os' <<<"$key"; then
  fail "setup-playwright cache key lacks runner.os: ${key:-<none>}"
fi
if ! grep -qE 'steps\.playwright\.outputs\.version' <<<"$key"; then
  fail "setup-playwright cache key lacks the Playwright version: ${key:-<none>}"
fi
# The paths are matched as literal action.yml text, so the tilde stays unexpanded.
# shellcheck disable=SC2088
for p in '~/.cache/ms-playwright' '~/.cache/playwright-apt'; do
  grep -qF "$p" "$ACTION" || fail "setup-playwright does not cache ${p}"
done

# Image pulls: only through the retry script, in every testnet job.
if bare=$(grep -nE 'docker[[:space:]]+pull' "$WORKFLOW"); then
  fail "test-web.yaml runs a bare docker pull; use pull-image-with-retry.sh: ${bare}"
fi
for job in $PULL_JOBS; do
  block=$(awk -v job="  ${job}:" '
    $0 == job { on = 1; next }
    on && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { exit }
    on { print }' "$WORKFLOW")
  if [ -z "$block" ]; then
    fail "test-web.yaml has no job ${job}"
  elif ! grep -q 'bash .github/scripts/pull-image-with-retry.sh' <<<"$block"; then
    fail "job ${job} does not pull the validator image with pull-image-with-retry.sh"
  fi
done

# Behaviour: an always-failing pull is tried exactly twice, then fails.
log=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/flake-guard-pull.XXXXXX")
PATH="$STUB_BIN:$PATH" STUB_DOCKER_LOG="$log" STUB_DOCKER_FAIL_FIRST=99 \
  PULL_RETRY_DELAY_SECONDS=0 bash "$PULL" example/image:tag >/dev/null 2>&1
rc=$?
calls=$(wc -l < "$log")
rm -f "$log"
if [ "$rc" -eq 0 ] || [ "$calls" -ne 2 ]; then
  fail "pull-image-with-retry.sh on an always-failing pull made ${calls} calls and exited ${rc}; want 2 calls and nonzero"
fi

[ "$status" -eq 0 ] && echo "ok: test-web.yaml caches Playwright and retries the image pull once"
exit "$status"
