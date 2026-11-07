#!/usr/bin/env bash
# CI guard: fails when git tracks any build output under a dist/ directory.
#
# dist/ trees are build output (see .gitignore `**/dist/`). A tracked copy goes
# stale and a plain `bun install` of a dependent package then resolves the old
# code instead of the source. CI builds every dist it needs from source.
#
# Usage: scripts/check-no-tracked-dist.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

tracked="$(git ls-files | grep -E '(^|/)dist/' || true)"

if [ -n "$tracked" ]; then
  echo "FAIL: build output under dist/ is tracked by git:"
  echo "$tracked" | sed 's/^/  /'
  echo "Remove it from the index with: git rm -r --cached <path>/dist"
  exit 1
fi

echo "OK: no tracked paths under dist/"
