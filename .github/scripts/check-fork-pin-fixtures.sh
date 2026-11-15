#!/usr/bin/env bash
# Runs the static fork pin check against the product tree and a scratch copy
# whose Move.toml commit has been deliberately changed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/check-fork-pin.sh"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
mkdir -p "$HOME/tmp"
TMP_DIR=$(mktemp -d "$HOME/tmp/fork-pin-fixture.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

bash "$CHECK" --skip-remote "$ROOT"

evil="$TMP_DIR/move-toml-rev-mismatch"
mkdir -p "$evil"
for path in \
  .github/workflows \
  source/atomica-move-contracts \
  source/docker-testnet/config \
  source/docker-testnet/aptos-testnet/src \
  source/state-proofs/typescript/tests/fixtures \
  source/evm-contracts/test/fixtures/aptos; do
  mkdir -p "$evil/$path"
done
cp "$ROOT/.github/workflows/"* "$evil/.github/workflows/"
cp "$ROOT/source/atomica-move-contracts/Move.toml" "$evil/source/atomica-move-contracts/Move.toml"
cp "$ROOT/source/docker-testnet/config/docker-compose.yaml" "$evil/source/docker-testnet/config/"
cp "$ROOT/source/docker-testnet/aptos-testnet/src/genesis.ts" "$evil/source/docker-testnet/aptos-testnet/src/"
cp "$ROOT/source/state-proofs/typescript/tests/fixtures/ibe_v2_golden_vectors.json" "$evil/source/state-proofs/typescript/tests/fixtures/"
cp "$ROOT/source/evm-contracts/test/fixtures/aptos/aptos_outcome_proof_vectors.json" "$evil/source/evm-contracts/test/fixtures/aptos/"
sed -i 's/rev = "[0-9a-f]\{40\}"/rev = "0000000000000000000000000000000000000000"/' "$evil/source/atomica-move-contracts/Move.toml"
if bash "$CHECK" --skip-remote "$evil"; then
  echo "::error::check-fork-pin.sh accepted a deliberately mismatched Move.toml rev"
  exit 1
fi
echo "ok: static pin guard rejects a mutated Move.toml rev"
