#!/usr/bin/env bash
# Checks that every product pin of the atomica-aptos fork names one revision
# and that the pinned validator image is built from that revision.
#
# Usage: check-fork-pin.sh [--skip-remote] [ROOT]
#
# --skip-remote is for the local fixtures. The Move Framework Pin job runs the
# full check, including GitHub release-vector and OCI-manifest verification.
set -euo pipefail

SKIP_REMOTE=0
if [[ "${1:-}" == "--skip-remote" ]]; then
  SKIP_REMOTE=1
  shift
fi
ROOT="${1:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"
WORKFLOWS="$ROOT/.github/workflows"
TEST_WEB="$WORKFLOWS/test-web.yaml"
MOVE_TOML="$ROOT/source/atomica-move-contracts/Move.toml"
COMPOSE="$ROOT/source/docker-testnet/config/docker-compose.yaml"
GENESIS="$ROOT/source/docker-testnet/aptos-testnet/src/genesis.ts"
IBE_FIXTURE="$ROOT/source/state-proofs/typescript/tests/fixtures/ibe_v2_golden_vectors.json"
OUTCOME_FIXTURE="$ROOT/source/evm-contracts/test/fixtures/aptos/aptos_outcome_proof_vectors.json"
status=0

fail() {
  echo "::error file=$1::$2"
  status=1
}

for f in "$TEST_WEB" "$MOVE_TOML" "$COMPOSE" "$GENESIS" "$IBE_FIXTURE" "$OUTCOME_FIXTURE"; do
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

done

PROOF_RELEASES=()
while IFS=: read -r line value; do
  [ -n "$value" ] && PROOF_RELEASES+=("$value")
done < <(grep -hnoE '^[[:space:]]*APTOS_PROOF_RELEASE:[[:space:]]*[^ #]+' "$WORKFLOWS"/*.yml "$WORKFLOWS"/*.yaml \
  | sed -E 's/^([0-9]+):[[:space:]]*APTOS_PROOF_RELEASE:[[:space:]]*([^ #]+)$/\1:\2/' || true)
if [ "${#PROOF_RELEASES[@]}" -ne 1 ]; then
  fail "$WORKFLOWS" "expected one APTOS_PROOF_RELEASE, found ${#PROOF_RELEASES[@]}"
elif [ "${PROOF_RELEASES[0]#*:}" != "$APTOS_VERSION" ]; then
  fail "$WORKFLOWS" "APTOS_PROOF_RELEASE ${PROOF_RELEASES[0]#*:} differs from APTOS_VERSION ${APTOS_VERSION}"
fi

PROOF_COMMITS=()
while IFS=: read -r line value; do
  [ -n "$value" ] && PROOF_COMMITS+=("$value")
done < <(grep -hnoE '^[[:space:]]*APTOS_PROOF_COMMIT:[[:space:]]*[^ #]+' "$WORKFLOWS"/*.yml "$WORKFLOWS"/*.yaml \
  | sed -E 's/^([0-9]+):[[:space:]]*APTOS_PROOF_COMMIT:[[:space:]]*([^ #]+)$/\1:\2/' || true)
if [ "${#PROOF_COMMITS[@]}" -eq 0 ]; then
  fail "$WORKFLOWS" "no APTOS_PROOF_COMMIT pin found"
fi
for row in "${PROOF_COMMITS[@]}"; do
  line="${row%%:*}"
  commit="${row#*:}"
  commit="${commit//[\"\' ]/}"
  if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
    fail "$WORKFLOWS" "line ${line}: APTOS_PROOF_COMMIT '${commit}' is not a full 40-character commit SHA"
  elif [ "$commit" != "$REV" ]; then
    fail "$WORKFLOWS" "line ${line}: APTOS_PROOF_COMMIT ${commit} differs from the Move.toml rev ${REV}"
  fi
done

IMAGE_NAMES=()
while IFS=: read -r line value; do
  [ -n "$value" ] && IMAGE_NAMES+=("$value")
done < <(grep -hnoE '^[[:space:]]*IMAGE_NAME:[[:space:]]*[^ #]+' "$WORKFLOWS"/*.yml "$WORKFLOWS"/*.yaml \
  | sed -E 's/^([0-9]+):[[:space:]]*IMAGE_NAME:[[:space:]]*([^ #]+)$/\1:\2/' || true)
if [ "${#IMAGE_NAMES[@]}" -ne 1 ]; then
  fail "$WORKFLOWS" "expected one pinned IMAGE_NAME, found ${#IMAGE_NAMES[@]}"
else
  image_name="${IMAGE_NAMES[0]#*:}"
  image_tag="${image_name##*:}"
  if [ "$image_tag" != "$APTOS_HASH" ]; then
    fail "$WORKFLOWS" "IMAGE_NAME ${image_name} does not use APTOS_VERSION hash ${APTOS_HASH}"
  fi
fi

mapfile -t compose_images < <(grep -oE 'IMAGE_NAME:-[^}\"]+' "$COMPOSE" | sed 's/^IMAGE_NAME:-//')
if [ "${#compose_images[@]}" -ne 4 ]; then
  fail "$COMPOSE" "expected four validator image defaults, found ${#compose_images[@]}"
else
  compose_image="${compose_images[0]}"
  if ! [[ "$compose_image" =~ ^ghcr\.io/bomba-atomica/atomica-aptos/validator@sha256:[0-9a-f]{64}$ ]]; then
    fail "$COMPOSE" "validator image default is not a pinned 64-character SHA-256 digest: ${compose_image}"
  fi
  for image in "${compose_images[@]}"; do
    if [ "$image" != "$compose_image" ]; then
      fail "$COMPOSE" "validator image defaults disagree: ${image} differs from ${compose_image}"
    fi
  done
fi

mapfile -t genesis_pins < <(grep -oE 'ghcr\.io/bomba-atomica/atomica-aptos/validator@sha256:[0-9a-f]{64}' "$GENESIS" | sort -u)
if [ "${#genesis_pins[@]}" -ne 1 ]; then
  fail "$GENESIS" "expected one shared genesis/validator fallback digest, found ${#genesis_pins[@]}"
elif [ "${#compose_images[@]}" -eq 4 ] && [ "${genesis_pins[0]}" != "$compose_image" ]; then
  fail "$GENESIS" "genesis fallback ${genesis_pins[0]} differs from compose default ${compose_image}"
fi
if ! grep -Fq 'const validatorImage = genesisImage;' "$GENESIS"; then
  fail "$GENESIS" "validator image must use the same fallback as genesisImage"
fi

for fixture in "$IBE_FIXTURE" "$OUTCOME_FIXTURE"; do
  source_commit=$(jq -r '._source.commit // empty' "$fixture")
  if [ "$source_commit" != "$REV" ]; then
    fail "$fixture" "_source.commit ${source_commit:-<missing>} differs from APTOS_PROOF_COMMIT ${REV}"
  fi
done

if [ "$status" -ne 0 ]; then
  exit "$status"
fi
if [ "$SKIP_REMOTE" -eq 1 ]; then
  echo "Static fork pins and fixture source headers agree with ${APTOS_VERSION} (remote checks skipped)"
  exit 0
fi

mkdir -p "$HOME/tmp"
TMP_DIR=$(mktemp -d "$HOME/tmp/check-fork-pin.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

compare_fork_fixture() {
  local path=$1 local_file=$2 name=$3 encoded
  encoded=$(gh api "repos/bomba-atomica/atomica-aptos/contents/${path}?ref=${REV}" --jq .content)
  if [ -z "$encoded" ]; then
    fail "$local_file" "gh api returned no content for atomica-aptos/${path} at ${REV}"
    return
  fi
  printf '%s' "$encoded" | base64 --decode > "$TMP_DIR/${name}.upstream.json"
  jq -S -c 'del(._source)' "$local_file" > "$TMP_DIR/${name}.local.normalized.json"
  jq -S -c 'del(._source)' "$TMP_DIR/${name}.upstream.json" > "$TMP_DIR/${name}.upstream.normalized.json"
  if ! cmp -s "$TMP_DIR/${name}.local.normalized.json" "$TMP_DIR/${name}.upstream.normalized.json"; then
    fail "$local_file" "fixture content differs from atomica-aptos/${path} at ${REV} (excluding the product _source header)"
  fi
}

compare_fork_fixture \
  "atomica/golden_vectors/ibe_v2_golden_vectors.json" \
  "$IBE_FIXTURE" "ibe-v2"
compare_fork_fixture \
  "atomica/golden_vectors/aptos_outcome_proof_vectors.json" \
  "$OUTCOME_FIXTURE" "aptos-outcome-proof"

if ! command -v docker >/dev/null 2>&1; then
  fail "$COMPOSE" "docker is required to inspect the pinned validator image manifest"
else
  manifest=$(docker buildx imagetools inspect "$compose_image" --format '{{json .Manifest}}' 2>&1) || {
    fail "$COMPOSE" "cannot inspect validator manifest ${compose_image}: ${manifest}"
    manifest=""
  }
  if [ -n "$manifest" ]; then
    inspected_digest=$(jq -r '.digest // empty' <<<"$manifest")
    expected_digest="${compose_image##*@}"
    if [ "$inspected_digest" != "$expected_digest" ]; then
      fail "$COMPOSE" "inspected digest ${inspected_digest:-<missing>} differs from pinned digest ${expected_digest}"
    fi
    revision=$(jq -r '
      if (.annotations | type) == "object" then
        .annotations["org.opencontainers.image.revision"] // empty
      elif (.annotations | type) == "array" then
        [.annotations[] | select(test("(^|:)org\\.opencontainers\\.image\\.revision=")) | sub("^.*org\\.opencontainers\\.image\\.revision="; "")][0] // empty
      else empty end
    ' <<<"$manifest")
    if [ "$revision" != "$REV" ]; then
      fail "$COMPOSE" "validator image OCI revision ${revision:-<missing>} differs from APTOS_PROOF_COMMIT ${REV}"
    fi
  fi
fi

if [ "$status" -eq 0 ]; then
  echo "Every fork pin and release artifact matches ${APTOS_VERSION} (${REV})"
fi
exit "$status"
