#!/bin/bash
set -e

echo "🚀 Starting Genesis Artifact Generation..."

# Define paths in the shared volume
SHARED_ROOT="/shared"
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

# Set Genesis Timestamp to Now + 60s
export EL_CL_GENESIS_TIMESTAMP=$(($(date +%s) + 60))
export GENESIS_TIMESTAMP=$EL_CL_GENESIS_TIMESTAMP

# Create values.env from environment variables safely (quoting values with spaces)
mkdir -p /config
python3 -c 'import os; print("\n".join([f"{k}=\"{v}\"" for k,v in os.environ.items()]))' > /config/values.env
echo "📄 values.env content:"
cat /config/values.env

# EL Genesis
/work/entrypoint.sh el

# CL Genesis - Requires EL genesis.json to be in place!
/work/entrypoint.sh cl

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
  --source-max=8

# Move raw keys to shared volume so the import container can see them
mkdir -p $VALIDATOR_KEYS_DIR/raw_keys
cp -r /keys/out/* $VALIDATOR_KEYS_DIR/raw_keys/

echo "� Creating Import Script for Validator Service..."
# We create this script here so the 'validator-import' container (which has lighthouse)
# can just execute it.
cat <<EOF > $SHARED_ROOT/import_keys.sh
#!/bin/sh
set -e
echo "📥 Importing Validators..."
mkdir -p /data/validator_keys/lighthouse-data

for key in /data/validator_keys/raw_keys/teku-keys/*.json; do
    filename=\$(basename "\$key")
    pubkey="\${filename%.json}"
    secret="/data/validator_keys/raw_keys/teku-secrets/\${pubkey}.txt"
    
    echo "Importing \$pubkey"
    lighthouse account validator import \\
        --datadir /data \\
        --keystore "\$key" \\
        --password-file "\$secret" \\
        --testnet-dir /data/beacon-config \\
        --reuse-password
done
EOF
chmod +x $SHARED_ROOT/import_keys.sh

echo "✅ Artifact Generation Complete."
