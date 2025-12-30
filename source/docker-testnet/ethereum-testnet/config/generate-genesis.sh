#!/bin/bash
# Generate Ethereum genesis for local PoS testnet
set -e

NUM_VALIDATORS="${1:-4}"
CHAIN_ID="${2:-12345}"
OUTPUT_DIR="./testnet"
JWT_SECRET="./jwtsecret"

# Create output directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "./validator_keys"

# 1. Generate JWT secret for EL/CL communication
if [ ! -f "$JWT_SECRET" ]; then
    echo "Generating JWT secret..."
    openssl rand -hex 32 > "$JWT_SECRET"
fi

# 2. Generate testnet configuration using lcli
# We use a docker container with lighthouse to run lcli
echo "Generating consensus genesis for $NUM_VALIDATORS validators..."

docker run --rm \
  -v "$(pwd)/$OUTPUT_DIR:/testnet" \
  sigp/lighthouse:v5.1.0 \
  lighthouse \
  lcli \
  new-testnet \
  --spec mainnet \
  --deposit-contract-address 4242424242424242424242424242424242424242 \
  --testnet-dir /testnet \
  --min-genesis-active-validator-count "$NUM_VALIDATORS" \
  --min-genesis-time 0 \
  --genesis-delay 0 \
  --eth1-id "$CHAIN_ID" \
  --eth1-follow-distance 1 \
  --seconds-per-slot 12 \
  --slots-per-epoch 32 \
  --force

# 3. Generate validator keys
echo "Generating $NUM_VALIDATORS validator keys..."
docker run --rm \
  -v "$(pwd)/$OUTPUT_DIR:/testnet" \
  -v "$(pwd)/validator_keys:/validator_keys" \
  sigp/lighthouse:v5.1.0 \
  lighthouse \
  lcli \
  insecure-validators \
  --count "$NUM_VALIDATORS" \
  --base-dir /validator_keys \
  --node-dir /validator_keys

# 4. Extract public keys for the SDK
echo "Extracting public keys..."
PUBKEYS_JSON="./validator_keys/pubkeys.json"
echo "[" > "$PUBKEYS_JSON"
for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
    # Lighthouse lcli insecure-validators stores the pubkey in a file
    # or we can use lcli to show it.
    # For now, let's assume we can read it from the generated files.
    # Actually, lcli insecure-validators creates validator_keys/node_i/voting_pubkey.txt
    if [ -f "./validator_keys/node_$i/voting_pubkey.txt" ]; then
        PUBKEY=$(cat "./validator_keys/node_$i/voting_pubkey.txt")
        if [ $i -eq $((NUM_VALIDATORS - 1)) ]; then
            echo "  \"$PUBKEY\"" >> "$PUBKEYS_JSON"
        else
            echo "  \"$PUBKEY\"," >> "$PUBKEYS_JSON"
        fi
    fi
done
echo "]" >> "$PUBKEYS_JSON"

# 4. Create Geth genesis (Execution Layer)
# For simplicity in dev mode, we might just use --dev, 
# but for a real PoS transition we'd need a genesis.json.
# Since Lighthouse lcli doesn't generate geth genesis easily, 
# we'll rely on the --dev flag in docker-compose for now, 
# or generate a basic one if needed.

echo "Ethereum testnet configuration generated in $OUTPUT_DIR"
echo "Validator keys in ./validator_keys"
