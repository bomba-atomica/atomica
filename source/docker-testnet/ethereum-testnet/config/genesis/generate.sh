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

mkdir -p $GETH_DIR
mkdir -p $BEACON_CONFIG_DIR
mkdir -p $VALIDATOR_KEYS_DIR

echo "🧬 Generating Artifacts..."

# Create values.env from environment variables
mkdir -p /config
env > /config/values.env

# EL Genesis
/entrypoint.sh el
mv /data/metadata/genesis.json $GETH_DIR/genesis.json

# CL Genesis
/entrypoint.sh cl
mv /data/metadata/genesis.ssz $BEACON_CONFIG_DIR/genesis.ssz
mv /data/metadata/config.yaml $BEACON_CONFIG_DIR/config.yaml

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
