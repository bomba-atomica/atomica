#!/usr/bin/env bash
# Checks that every product pin of the atomica-aptos fork names one revision.
#
# Usage: check-fork-pin.sh [ROOT]   (ROOT defaults to the repo root)
#
# APTOS_VERSION comes from the top-level env of ROOT/.github/workflows/test-web.yaml.
# Exits 1 with an ::error line when:
#   - the AptosFramework rev in ROOT/source/atomica-move-contracts/Move.toml is
#     not a 40-character SHA that starts with the APTOS_VERSION hash;
#   - any binary-<hex> tag in ROOT/.github/workflows/*.yml or *.yaml differs
#     from APTOS_VERSION (this covers APTOS_PROOF_RELEASE);
#   - an APTOS_PROOF_COMMIT is not a 40-character SHA equal to the Move.toml rev.
# The validator image digest in source/docker-testnet/config is not checked:
# a digest cannot be compared with a tag without a registry read.
set -euo pipefail

ROOT="${1:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"
WORKFLOWS="$ROOT/.github/workflows"
TEST_WEB="$WORKFLOWS/test-web.yaml"
MOVE_TOML="$ROOT/source/atomica-move-contracts/Move.toml"
status=0

fail() {
  echo "::error file=$1::$2"
  status=1
}

for f in "$TEST_WEB" "$MOVE_TOML"; do
  if [ ! -f "$f" ]; then
    echo "::error file=$f::missing"
    exit 1
  fi
done

# The top-level env entry is indented by exactly two spaces.
APTOS_VERSION=$(sed -n 's/^  APTOS_VERSION: *"\{0,1\}\(binary-[0-9a-f]*\)"\{0,1\} *$/\1/p' "$TEST_WEB" | head -n 1)
if ! [[ "$APTOS_VERSION" =~ ^binary-[0-9a-f]{10,40}$ ]]; then
  echo "::error file=$TEST_WEB::no top-level APTOS_VERSION binary-<hex> in the env block"
  exit 1
fi
APTOS_HASH="${APTOS_VERSION#binary-}"
echo "APTOS_VERSION: $APTOS_VERSION"

REV=$(sed -n 's/^AptosFramework = .*rev = "\([^"]*\)".*/\1/p' "$MOVE_TOML")
echo "Move.toml rev: ${REV:-<none>}"
if ! [[ "$REV" =~ ^[0-9a-f]{40}$ ]]; then
  fail "$MOVE_TOML" "AptosFramework rev '${REV}' is not a full 40-character commit SHA"
elif [[ "$REV" != "$APTOS_HASH"* ]]; then
  fail "$MOVE_TOML" "AptosFramework rev ${REV} does not match ${APTOS_VERSION}"
fi

shopt -s nullglob
for wf in "$WORKFLOWS"/*.yml "$WORKFLOWS"/*.yaml; do
  while IFS=: read -r line tag; do
    [ -n "$tag" ] || continue
    if [ "$tag" != "$APTOS_VERSION" ]; then
      fail "$wf" "line ${line}: ${tag} differs from APTOS_VERSION ${APTOS_VERSION}"
    fi
  done < <(grep -noE 'binary-[0-9a-f]{7,40}\b' "$wf" || true)

  while IFS=: read -r line commit; do
    commit="${commit//[\"\' ]/}"
    if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
      fail "$wf" "line ${line}: APTOS_PROOF_COMMIT '${commit}' is not a full 40-character commit SHA"
    elif [ "$commit" != "$REV" ]; then
      fail "$wf" "line ${line}: APTOS_PROOF_COMMIT ${commit} differs from the Move.toml rev ${REV}"
    fi
  done < <(grep -nE '^ *APTOS_PROOF_COMMIT:' "$wf" | sed -E 's/^([0-9]+):[^:]*APTOS_PROOF_COMMIT: *([^ #]*).*/\1:\2/' || true)
done

if [ "$status" -eq 0 ]; then
  echo "Every fork pin matches ${APTOS_VERSION}"
fi
exit "$status"
