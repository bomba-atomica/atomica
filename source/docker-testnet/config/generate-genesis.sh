#!/bin/bash
# Generate Aptos genesis for Docker testnet using deterministic credentials.
#
# All key material is provided via environment variables (from source/.env.test).
# No random key generation occurs — every run produces identical artifacts.
set -e

if [ -n "$ATOMICA_DEBUG_TESTNET" ]; then set -x; fi

debug() {
    if [ -n "$ATOMICA_DEBUG_TESTNET" ]; then
        echo "[DEBUG $(date -Iseconds)] $*" >&2
    fi
}

if [ -z "$ATOMICA_DEBUG_TESTNET" ]; then
    APTOS_OUTPUT="/dev/null"
else
    APTOS_OUTPUT="/dev/stdout"
fi

NUM_VALIDATORS="${1:-4}"
CHAIN_ID="${2:-4}"
BASE_IP="${3:-172.19.0.10}"
STAKE_AMOUNT="100000000000000"  # 1M APT in octas

WORKSPACE="${WORKSPACE:-/workspace}"
cd "$WORKSPACE"

echo "=== Generating genesis for $NUM_VALIDATORS validators (chain_id=$CHAIN_ID) ==="

# Validate required env vars
for var in APTOS_ROOT_ACCOUNT_PUBLIC_KEY; do
    if [ -z "${!var}" ]; then
        echo "ERROR: ${var} is required"; exit 1
    fi
done
for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
    var="APTOS_VALIDATOR_${i}_SEED"
    if [ -z "${!var}" ]; then
        echo "ERROR: ${var} is required"; exit 1
    fi
done

IFS='.' read -r ip1 ip2 ip3 ip4 <<< "$BASE_IP"

# Build usernames list for layout.yaml
USERNAMES=""
for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
    [ -n "$USERNAMES" ] && USERNAMES="${USERNAMES}, "
    USERNAMES="${USERNAMES}\"validator-${i}\""
done

# Step 1: Generate validator key files from deterministic seeds
echo "Step 1/6: Writing validator key files..."
for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
    username="validator-${i}"
    mkdir -p "$username"

    seed_var="APTOS_VALIDATOR_${i}_SEED"
    seed="${!seed_var}"

    aptos genesis generate-keys \
        --output-dir "$username" \
        --random-seed "$seed" \
        --assume-yes > "$APTOS_OUTPUT"

    debug "Generated key files for $username from seed $seed"
done

# Step 2: Create layout.yaml
echo "Step 2/6: Creating layout.yaml..."
cat > layout.yaml <<EOF
---
root_key: "${APTOS_ROOT_ACCOUNT_PUBLIC_KEY}"
users: [${USERNAMES}]
chain_id: ${CHAIN_ID}
allow_new_validators: false
epoch_duration_secs: 7200
is_test: true
min_stake: 100000000000000
min_voting_threshold: 100000000000000
max_stake: 100000000000000000
recurring_lockup_duration_secs: 86400
required_proposer_stake: 100000000000000
rewards_apy_percentage: 10
voting_duration_secs: 43200
voting_power_increase_limit: 20
EOF

# Step 3: Set validator configurations
echo "Step 3/6: Setting validator configurations..."
mkdir -p genesis-repo

for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
    username="validator-${i}"
    validator_ip="${ip1}.${ip2}.${ip3}.$((ip4 + i))"
    mkdir -p "genesis-repo/${username}"

    aptos genesis set-validator-configuration \
        --username "$username" \
        --owner-public-identity-file "${username}/public-keys.yaml" \
        --validator-host "${validator_ip}:6180" \
        --full-node-host "${validator_ip}:6182" \
        --stake-amount "$STAKE_AMOUNT" \
        --commission-percentage 0 \
        --local-repository-dir genesis-repo > "$APTOS_OUTPUT"

    debug "Configured $username at ${validator_ip}"
done

# Step 4: Copy layout and find framework
echo "Step 4/6: Setting up genesis repository..."
cp layout.yaml genesis-repo/

FRAMEWORK_PATHS=("/framework.mrb" "/aptos-framework/move/head.mrb" "/opt/aptos/framework/head.mrb" "/usr/local/share/aptos/framework/head.mrb")
FRAMEWORK_FOUND=false
for path in "${FRAMEWORK_PATHS[@]}"; do
    if [ -f "$path" ]; then
        cp "$path" genesis-repo/framework.mrb
        FRAMEWORK_FOUND=true
        debug "Found framework at: $path"
        break
    fi
done

if [ "$FRAMEWORK_FOUND" = false ]; then
    REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
    if [ -n "$REPO_ROOT" ]; then
        FOUND=$(find "$REPO_ROOT" -type f -name "*.mrb" | head -n 1)
        if [ -n "$FOUND" ]; then
            cp "$FOUND" genesis-repo/framework.mrb
            FRAMEWORK_FOUND=true
        fi
    fi
fi

if [ "$FRAMEWORK_FOUND" = false ]; then
    echo "ERROR: Could not find framework.mrb"; exit 1
fi

# Step 5: Setup git structure
echo "Step 5/6: Finalizing genesis repository..."
aptos genesis setup-git \
    --layout-file layout.yaml \
    --local-repository-dir genesis-repo > "$APTOS_OUTPUT"

# Step 6: Generate genesis blob and waypoint
echo "Step 6/6: Generating genesis.blob and waypoint..."
mkdir -p output
aptos genesis generate-genesis \
    --local-repository-dir genesis-repo \
    --output-dir output > "$APTOS_OUTPUT"

# Write node configs for each validator
for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
    username="validator-${i}"
    cat > "${username}/node-config.yaml" <<EOF
base:
  role: "validator"
  data_dir: "/opt/aptos/var/data"
  waypoint:
    from_file: "/opt/aptos/var/genesis/waypoint.txt"

execution:
  genesis_file_location: "/opt/aptos/var/genesis/genesis.blob"

consensus:
  safety_rules:
    service:
      type: "local"
    backend:
      type: "on_disk_storage"
      path: "/opt/aptos/var/data/safety-rules.bin"
    initial_safety_rules_config:
      from_file:
        identity_blob_path: "/opt/aptos/var/identity/validator-identity.yaml"
        waypoint:
          from_file: "/opt/aptos/var/genesis/waypoint.txt"

validator_network:
  discovery_method: "onchain"
  listen_address: "/ip4/0.0.0.0/tcp/6180"
  mutual_authentication: true
  identity:
    type: "from_file"
    path: "/opt/aptos/var/identity/validator-identity.yaml"

full_node_networks: []

api:
  enabled: true
  address: "0.0.0.0:8080"

storage:
  rocksdb_configs:
    enable_storage_sharding: false
EOF
done

echo "=== Genesis generation complete! ==="
echo "Waypoint:"
cat output/waypoint.txt
