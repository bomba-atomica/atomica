#!/bin/bash
set -e

# Validator entrypoint with inline genesis generation
# Each validator generates the same deterministic genesis blob

VALIDATOR_INDEX="${VALIDATOR_INDEX:-0}"
NUM_VALIDATORS="${NUM_VALIDATORS:-4}"
CHAIN_ID="${CHAIN_ID:-4}"
DATA_DIR="/opt/aptos/var/data"
GENESIS_DIR="/opt/aptos/var/genesis"
IDENTITY_DIR="/opt/aptos/var/identity"

echo "[Validator $VALIDATOR_INDEX] Starting up..."

# Generate node config from template if it doesn't exist
if [ ! -f "/opt/aptos/var/etc/node-config.yaml" ]; then
    echo "[Validator $VALIDATOR_INDEX] Generating node config from template..."
    mkdir -p /opt/aptos/var/etc
    cp /opt/aptos/config/node-config.template.yaml /opt/aptos/var/etc/node-config.yaml
fi

# Check if genesis already exists
if [ -f "$GENESIS_DIR/genesis.blob" ] && [ -f "$GENESIS_DIR/waypoint.txt" ]; then
    echo "[Validator $VALIDATOR_INDEX] Genesis artifacts already exist, skipping generation"
else
    echo "[Validator $VALIDATOR_INDEX] Generating genesis artifacts..."

    # Create temporary workspace for genesis generation
    GENESIS_WORKSPACE=$(mktemp -d)
    cd "$GENESIS_WORKSPACE"

    echo "[Validator $VALIDATOR_INDEX] Workspace: $GENESIS_WORKSPACE"

    # Build users list
    USERS_LIST=""
    for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
        if [ $i -eq 0 ]; then
            USERS_LIST="\"validator-$i\""
        else
            USERS_LIST="$USERS_LIST, \"validator-$i\""
        fi
    done

    # Create layout.yaml with all validators
    cat > layout.yaml <<EOF
---
root_key: "0x654d264eba67b1b50943b198804848f4bf695f988c958a38be97b520bc0db1e3"
users: [$USERS_LIST]
chain_id: $CHAIN_ID
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

    # Copy all validator identity files from shared location
    for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
        VALIDATOR_NAME="validator-$i"
        echo "[Validator $VALIDATOR_INDEX] Setting up $VALIDATOR_NAME..."

        mkdir -p "$VALIDATOR_NAME"

        # Copy validator public keys from genesis-artifacts
        if [ -f "/opt/aptos/genesis-artifacts/$VALIDATOR_NAME-public-keys.yaml" ]; then
            cp "/opt/aptos/genesis-artifacts/$VALIDATOR_NAME-public-keys.yaml" "$VALIDATOR_NAME/public-keys.yaml"
        else
            echo "[Validator $VALIDATOR_INDEX] ERROR: Missing /opt/aptos/genesis-artifacts/$VALIDATOR_NAME-public-keys.yaml"
            exit 1
        fi

        # Set validator config
        VALIDATOR_IP="172.19.0.$((10 + i))"
        /usr/local/bin/aptos genesis set-validator-configuration \
            --local-repository-dir . \
            --username "$VALIDATOR_NAME" \
            --owner-public-identity-file "$VALIDATOR_NAME/public-keys.yaml" \
            --validator-host "$VALIDATOR_IP:6180" \
            --full-node-host "$VALIDATOR_IP:6181" \
            --stake-amount 100000000000000
    done

    # Copy framework.mrb
    cp /opt/aptos/genesis-artifacts/framework.mrb .

    # Create genesis
    echo "[Validator $VALIDATOR_INDEX] Creating genesis blob..."
    /usr/local/bin/aptos genesis generate-genesis \
        --local-repository-dir . \
        --output-dir .

    # Copy genesis artifacts to shared location
    mkdir -p "$GENESIS_DIR"
    cp genesis.blob "$GENESIS_DIR/"
    cp waypoint.txt "$GENESIS_DIR/"

    # Cleanup
    cd /
    rm -rf "$GENESIS_WORKSPACE"

    echo "[Validator $VALIDATOR_INDEX] Genesis generation complete!"
    echo "[Validator $VALIDATOR_INDEX] Waypoint: $(cat $GENESIS_DIR/waypoint.txt)"
fi

# Start the validator
echo "[Validator $VALIDATOR_INDEX] Starting aptos-node..."
exec /usr/local/bin/aptos-node -f /opt/aptos/var/etc/node-config.yaml
