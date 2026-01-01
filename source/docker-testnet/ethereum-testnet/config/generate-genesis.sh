#!/bin/bash
# Generate Ethereum genesis for local PoS testnet (mainnet-like)
# This creates a proper Beacon Chain genesis with validators, NOT Clique PoA
set -e

NUM_VALIDATORS="${1:-4}"
CHAIN_ID="${2:-32382}"  # Unique testnet chain ID
OUTPUT_DIR="./testnet"
VALIDATOR_DIR="./validator_keys"
JWT_SECRET="./jwtsecret"

# Mainnet-like timing (can adjust for faster local testing)
SECONDS_PER_SLOT=12
SLOTS_PER_EPOCH=32

echo "=== Ethereum PoS Testnet Genesis Generator ==="
echo "Validators: $NUM_VALIDATORS"
echo "Chain ID: $CHAIN_ID"
echo "Seconds per slot: $SECONDS_PER_SLOT"
echo ""

# Clean up previous runs
rm -rf "$OUTPUT_DIR"
rm -rf "$VALIDATOR_DIR"
mkdir -p "$OUTPUT_DIR"
mkdir -p "$VALIDATOR_DIR"

# 1. Generate JWT secret for EL/CL communication
if [ ! -f "$JWT_SECRET" ]; then
    echo "Generating JWT secret..."
    openssl rand -hex 32 > "$JWT_SECRET"
fi

# 2. Define Genesis Timestamp (now + 30s buffer for setup)
GENESIS_TIME=$(($(date +%s) + 30))
echo "Genesis Time: $GENESIS_TIME ($(date -r $GENESIS_TIME 2>/dev/null || date -d @$GENESIS_TIME))"

# 3. Pre-funded test accounts (deterministic for reproducible testing)
# These are insecure keys - ONLY for local testing
TEST_ACCOUNTS=(
    "0x8943545177806ED17B9F23F0a21ee5948eCaa776:1000000000000000000000"  # 1000 ETH
    "0x71bE63f3384f5fb98995898A86B02Fb2426c5788:1000000000000000000000"  # 1000 ETH
    "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a:1000000000000000000000"  # 1000 ETH
    "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec:1000000000000000000000"  # 1000 ETH
)

# Build alloc JSON
ALLOC_JSON=""
for account in "${TEST_ACCOUNTS[@]}"; do
    ADDR="${account%%:*}"
    BALANCE="${account##*:}"
    if [ -n "$ALLOC_JSON" ]; then
        ALLOC_JSON="$ALLOC_JSON,"
    fi
    ALLOC_JSON="$ALLOC_JSON\"$ADDR\": { \"balance\": \"$BALANCE\" }"
done

# 4. Create Geth genesis.json (PoS / The Merge ready)
# Key: NO clique config, terminalTotalDifficulty=0 means PoS from genesis
echo "Creating Geth genesis.json (PoS from genesis)..."
cat > "$OUTPUT_DIR/genesis.json" <<EOF
{
  "config": {
    "chainId": $CHAIN_ID,
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "istanbulBlock": 0,
    "muirGlacierBlock": 0,
    "berlinBlock": 0,
    "londonBlock": 0,
    "arrowGlacierBlock": 0,
    "grayGlacierBlock": 0,
    "mergeNetsplitBlock": 0,
    "shanghaiTime": 0,
    "cancunTime": 0,
    "terminalTotalDifficulty": 0,
    "terminalTotalDifficultyPassed": true
  },
  "nonce": "0x0",
  "timestamp": "$(printf '0x%x' $GENESIS_TIME)",
  "extraData": "0x",
  "gasLimit": "0x1c9c380",
  "difficulty": "0x1",
  "mixHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "coinbase": "0x0000000000000000000000000000000000000000",
  "alloc": {
    $ALLOC_JSON
  }
}
EOF

# 5. Check if lcli image exists, if not build it
if ! docker image inspect atomica-lcli:latest > /dev/null 2>&1; then
    echo "Building atomica-lcli image (this may take a while on first run)..."
    docker build -t atomica-lcli:latest -f Dockerfile.genesis .
fi

# 6. Initialize Geth datadir
echo "Initializing Geth datadir..."
docker run --rm \
  -v "$(pwd)/$OUTPUT_DIR:/data" \
  ethereum/client-go:v1.13.14 \
  init --datadir /data /data/genesis.json

# 7. Generate validator keys using lcli
echo "Generating $NUM_VALIDATORS validator keys..."
docker run --rm \
  -v "$(pwd)/$VALIDATOR_DIR:/validator_keys" \
  atomica-lcli:latest \
  insecure-validators \
  --count "$NUM_VALIDATORS" \
  --base-dir /validator_keys \
  --node-count 1

# 8. Extract validator pubkeys for reference
echo "Extracting validator public keys..."
docker run --rm \
  -v "$(pwd)/$VALIDATOR_DIR:/validator_keys" \
  --entrypoint /bin/sh \
  atomica-lcli:latest \
  -c 'find /validator_keys -name "voting-keystore.json" -exec cat {} \; 2>/dev/null | grep -o "\"pubkey\":\"[^\"]*\"" | cut -d\" -f4' \
  > "$VALIDATOR_DIR/pubkeys.txt" 2>/dev/null || true

# Convert to JSON array
if [ -s "$VALIDATOR_DIR/pubkeys.txt" ]; then
    echo "[" > "$VALIDATOR_DIR/pubkeys.json"
    first=true
    while read -r pubkey; do
        if [ -n "$pubkey" ]; then
            if [ "$first" = true ]; then
                first=false
            else
                echo "," >> "$VALIDATOR_DIR/pubkeys.json"
            fi
            echo "  \"$pubkey\"" >> "$VALIDATOR_DIR/pubkeys.json"
        fi
    done < "$VALIDATOR_DIR/pubkeys.txt"
    echo "]" >> "$VALIDATOR_DIR/pubkeys.json"
fi

# 9. Generate Beacon Chain genesis state
echo "Generating Beacon Chain genesis..."
docker run --rm \
  -v "$(pwd)/$OUTPUT_DIR:/testnet" \
  -v "$(pwd)/$VALIDATOR_DIR:/validator_keys" \
  atomica-lcli:latest \
  new-testnet \
  --spec mainnet \
  --deposit-contract-address 0x4242424242424242424242424242424242424242 \
  --testnet-dir /testnet \
  --min-genesis-active-validator-count "$NUM_VALIDATORS" \
  --min-genesis-time "$GENESIS_TIME" \
  --genesis-delay 0 \
  --genesis-fork-version 0x00000000 \
  --altair-fork-epoch 0 \
  --bellatrix-fork-epoch 0 \
  --capella-fork-epoch 0 \
  --deneb-fork-epoch 0 \
  --eth1-id "$CHAIN_ID" \
  --eth1-follow-distance 1 \
  --seconds-per-slot "$SECONDS_PER_SLOT" \
  --seconds-per-eth1-block 14 \
  --validator-count "$NUM_VALIDATORS" \
  --interop-genesis-state \
  --force

# 10. Create deploy_block.txt (genesis block = 0)
echo "0" > "$OUTPUT_DIR/deploy_block.txt"

# 11. Summary
echo ""
echo "=== Genesis Generation Complete ==="
echo "Execution Layer genesis: $OUTPUT_DIR/genesis.json"
echo "Beacon Chain config:     $OUTPUT_DIR/config.yaml"
echo "Genesis state:           $OUTPUT_DIR/genesis.ssz"
echo "Validator keys:          $VALIDATOR_DIR/"
echo "JWT secret:              $JWT_SECRET"
echo ""
echo "Test accounts (1000 ETH each):"
for account in "${TEST_ACCOUNTS[@]}"; do
    echo "  ${account%%:*}"
done
echo ""
echo "To start the testnet: docker compose up -d"
