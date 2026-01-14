#!/bin/bash
set -e

echo "🚀 Starting Genesis Artifact Generation..."

# Define paths in the shared volume
SHARED_ROOT="/data"
GETH_DIR="$SHARED_ROOT/geth"
BEACON_CONFIG_DIR="$SHARED_ROOT/beacon-config"
VALIDATOR_KEYS_DIR="$SHARED_ROOT/validator_keys"
JWT_SECRET_PATH="$SHARED_ROOT/jwtsecret"

# Clean shared volume
rm -rf $SHARED_ROOT/*
# Clean ephemeral /data volume (if inherited from base image)
rm -rf /data/*

mkdir -p $GETH_DIR
mkdir -p $BEACON_CONFIG_DIR
mkdir -p $VALIDATOR_KEYS_DIR

echo "🧬 Generating Artifacts..."

# Set Genesis Timestamp to NOW + 120s to ensure all containers start before genesis
# This prevents the "syncing" deadlock where BN thinks it's behind because we missed Slot 0 during startup.
DELAY=30
NOW=$(($(date +%s) + $DELAY))
export EL_CL_GENESIS_TIMESTAMP=$NOW
export GENESIS_TIMESTAMP=$NOW

echo "🕒 Genesis Timestamp set to: $NOW (NOW + $DELAY seconds)"

# Create values.env for python tools
mkdir -p /config
python3 -c 'import os; print("\n".join([f"{k}=\"{v}\"" for k,v in os.environ.items()]))' > /config/values.env
echo "📄 values.env content:"
cat /config/values.env

# EL Genesis
/work/entrypoint.sh el

# CL Genesis - Requires EL genesis.json to be in place!
/work/entrypoint.sh cl

# Patch config.yaml to set MIN_GENESIS_TIME to our explicit timestamp
# This ensures validators don't get confused by '0'
sed -i "s/MIN_GENESIS_TIME: 0/MIN_GENESIS_TIME: $NOW/g" /data/metadata/config.yaml

echo "📂 Debugging Metadata contents:"
ls -la /data/metadata/

# Now move artifacts to final locations
# EL Genesis
mv /data/metadata/genesis.json $GETH_DIR/genesis.json

# CL Genesis - Copy ALL metadata (config.yaml, genesis.ssz, deploy_block.txt, etc.)
cp -r /data/metadata/* $BEACON_CONFIG_DIR/

# Rename deposit_contract_block.txt to deploy_block.txt if needed by Lighthouse
if [ -f "$BEACON_CONFIG_DIR/deposit_contract_block.txt" ]; then
    cp "$BEACON_CONFIG_DIR/deposit_contract_block.txt" "$BEACON_CONFIG_DIR/deploy_block.txt"
else 
    echo "0" > "$BEACON_CONFIG_DIR/deploy_block.txt"
fi

echo "📂 Content of Beacon Config Dir:"
ls -la $BEACON_CONFIG_DIR/

echo "🔑 Creating JWT Secret..."
openssl rand -hex 32 | tr -d "\n" > $JWT_SECRET_PATH

echo "🔐 Generating Validator Keys..."
eth2-val-tools keystores \
  --insecure \
  --out-loc="/keys/out" \
  --source-mnemonic="giant issue aisle success illegal bike spike question tent bar rely arctic volcano long crawl hungry vocal artwork sniff fantasy very lucky have athlete" \
  --source-min=0 \
  --source-max=$NUMBER_OF_VALIDATORS

# Move raw keys to shared volume so the import container can see them
mkdir -p $VALIDATOR_KEYS_DIR/raw_keys
cp -r /keys/out/* $VALIDATOR_KEYS_DIR/raw_keys/

echo "✅ Artifact Generation Complete."

echo "🏗️ Initializing Geth..."
geth init --datadir=$GETH_DIR $GETH_DIR/genesis.json

echo "📥 Importing Validators into separate directories..."
i=1
for key in $VALIDATOR_KEYS_DIR/raw_keys/teku-keys/*.json; do
    filename=$(basename "$key")
    pubkey="${filename%.json}"
    secret="$VALIDATOR_KEYS_DIR/raw_keys/teku-secrets/${pubkey}.txt"
    
    val_dir="$SHARED_ROOT/validator-$i"
    mkdir -p "$val_dir"

    echo "Importing $pubkey into $val_dir"
    lighthouse account validator import \
        --datadir "$val_dir" \
        --keystore "$key" \
        --password-file "$secret" \
        --testnet-dir $BEACON_CONFIG_DIR \
        --reuse-password
    
    i=$((i + 1))
done

echo "🎉 All Setup Complete."
