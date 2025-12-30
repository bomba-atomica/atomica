#!/bin/bash
# Generate Ethereum genesis for local PoS testnet
set -e

NUM_VALIDATORS="${1:-4}"
CHAIN_ID="${2:-12345}"
OUTPUT_DIR="./testnet"
JWT_SECRET="./jwtsecret"

# Clean up previous runs
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
mkdir -p "./validator_keys"

# 1. Generate JWT secret for EL/CL communication
if [ ! -f "$JWT_SECRET" ]; then
    echo "Generating JWT secret..."
    openssl rand -hex 32 > "$JWT_SECRET"
fi

# 2. Define Genesis Timestamp (now + small buffer)
GENESIS_TIMESTAMP=$(date +%s)
echo "Genesis Timestamp: $GENESIS_TIMESTAMP"

# 3. Create Geth genesis.json (Merge-Ready)
echo "Creating Geth genesis.json..."
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
    "terminalTotalDifficulty": 0,
    "clique": {
      "period": 5,
      "epoch": 30000
    }
  },
  "nonce": "0x0",
  "timestamp": "$(printf '0x%x' $GENESIS_TIMESTAMP)",
  "extraData": "$(printf '0x%0234d' 0)",
  "gasLimit": "0x8000000",
  "difficulty": "0x1",
  "mixHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "coinbase": "0x0000000000000000000000000000000000000000",
  "alloc": {
    "0xa550c18693891d4e0b021966a01490216b23023e": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" }
  }
}
EOF

# 4. Initialize Geth and fetch Genesis Hash
echo "Initializing Geth to generate genesis hash..."
# Init the datadir
docker run --rm \
  -v "$(pwd)/$OUTPUT_DIR:/data" \
  ethereum/client-go:v1.13.14 \
  init --datadir /data /data/genesis.json

# Start temp geth to query the hash
echo "Starting temporary Geth..."
CONTAINER_ID=$(docker run -d -p 8545:8545 \
  -v "$(pwd)/$OUTPUT_DIR:/data" \
  ethereum/client-go:v1.13.14 \
  --datadir /data \
  --networkid "$CHAIN_ID" \
  --nodiscover \
  --http --http.addr 0.0.0.0 --http.port 8545)

echo "Waiting for Geth to be ready..."
RETRIES=15
while [ $RETRIES -gt 0 ]; do
    if curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}' http://localhost:8545 > /dev/null; then
        break
    fi
    echo "Waiting for Geth RPC..."
    sleep 2
    RETRIES=$((RETRIES-1))
done

if [ $RETRIES -eq 0 ]; then
    echo "Timed out waiting for Geth RPC"
    docker logs $CONTAINER_ID
    docker rm -f $CONTAINER_ID
    exit 1
fi

echo "Fetching genesis block hash..."
JSON_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["0x0", false],"id":1}' \
  http://localhost:8545)

# Extract hash using sed to allow for flexible whitespace handling
GENESIS_HASH=$(echo "$JSON_RESPONSE" | grep -o '"hash":"0x[a-fA-F0-9]*"' | cut -d'"' -f4 | tr -d '\r\n')

echo "Raw Genesis Hash: '$GENESIS_HASH'"
docker rm -f $CONTAINER_ID

if [ -z "$GENESIS_HASH" ]; then
  echo "Error: Failed to fetch genesis hash. Response was: $JSON_RESPONSE"
  exit 1
fi

# 5. Generate Consensus Genesis
echo "Generating consensus genesis..."

# Check if lcli image exists, if not build it
if ! docker image inspect atomica-lcli:latest > /dev/null 2>&1; then
    echo "Building atomica-lcli image (this may take a while)..."
    docker build -t atomica-lcli:latest -f Dockerfile.genesis .
fi

docker run --rm \
  -v "$(pwd)/$OUTPUT_DIR:/testnet" \
  atomica-lcli:latest \
  new-testnet \
  --spec mainnet \
  --deposit-contract-address 4242424242424242424242424242424242424242 \
  --testnet-dir /testnet \
  --min-genesis-active-validator-count "$NUM_VALIDATORS" \
  --min-genesis-time "$GENESIS_TIMESTAMP" \
  --genesis-delay 0 \
  --eth1-id "$CHAIN_ID" \
  --eth1-block-hash "$GENESIS_HASH" \
  --eth1-follow-distance 1 \
  --seconds-per-slot 12 \
  --slots-per-epoch 32 \
  --force

# 6. Generate validator keys
echo "Generating $NUM_VALIDATORS validator keys..."
docker run --rm \
  -v "$(pwd)/$OUTPUT_DIR:/testnet" \
  -v "$(pwd)/validator_keys:/validator_keys" \
  atomica-lcli:latest \
  insecure-validators \
  --count "$NUM_VALIDATORS" \
  --base-dir /validator_keys \
  --node-dir /validator_keys
