#!/bin/bash
set -e

OUTPUT_DIR="testnet"
NUM_VALIDATORS=8
cd "$(dirname "$0")"

# Clean previous data
rm -rf ../$OUTPUT_DIR
mkdir -p ../$OUTPUT_DIR

# Set Genesis Timestamp to now + 60s
NOW=$(date +%s)
GENESIS_TIMESTAMP=$((NOW + 60))
echo "Setting GENESIS_TIMESTAMP to $GENESIS_TIMESTAMP"

# Create temp values.env with timestamp
cp values.env values.env.tmp
echo "GENESIS_TIMESTAMP=$GENESIS_TIMESTAMP" >> values.env.tmp

# Run the generator in steps to allow patching
echo "Generating EL genesis..."
docker run --rm \
  -v "$(pwd)/values.env.tmp:/config/values.env" \
  -v "$(pwd)/../$OUTPUT_DIR:/data" \
  ethpandaops/ethereum-genesis-generator:5.2.2 \
  el

# Geth v1.16.8+ natively supports the genesis format from the generator
# No patching required


echo "Generating CL genesis..."
docker run --rm \
  -v "$(pwd)/values.env.tmp:/config/values.env" \
  -v "$(pwd)/../$OUTPUT_DIR:/data" \
  ethpandaops/ethereum-genesis-generator:5.2.2 \
  cl

# Cleanup temp file
rm values.env.tmp

echo "Genesis generation complete."

# Re-organize output for our docker-compose structure
echo "Restructuring output for docker-compose..."

mkdir -p ../$OUTPUT_DIR/geth
mkdir -p ../$OUTPUT_DIR/beacon
mkdir -p ../$OUTPUT_DIR/validator_keys

# Move EL genesis
# Found in metadata/genesis.json
if [ -f "../$OUTPUT_DIR/metadata/genesis.json" ]; then
    cp ../$OUTPUT_DIR/metadata/genesis.json ../$OUTPUT_DIR/geth/genesis.json
else
    echo "Error: EL genesis.json not found in metadata"
    ls -R ../$OUTPUT_DIR
    exit 1
fi

# Move CL genesis
# Found in metadata/genesis.ssz
if [ -f "../$OUTPUT_DIR/metadata/genesis.ssz" ]; then
    cp ../$OUTPUT_DIR/metadata/genesis.ssz ../$OUTPUT_DIR/beacon/genesis.ssz
else
    echo "Error: CL genesis.ssz not found in metadata"
    ls -R ../$OUTPUT_DIR
    exit 1
fi

# Initialize Geth
echo "Initializing Geth datadir..."
docker run --rm \
  -v "$(pwd)/../$OUTPUT_DIR/geth:/data" \
  ethereum/client-go:v1.16.8 \
  init /data/genesis.json

# Create jwtsecret
openssl rand -hex 32 | tr -d "\n" > ../jwtsecret

# Keys loop
echo "Generating Validator Keys..."
docker run --rm \
  --entrypoint eth2-val-tools \
  -v "$(pwd)/../$OUTPUT_DIR/validator_keys:/keys" \
  ethpandaops/ethereum-genesis-generator:5.2.2 \
  keystores \
  --insecure \
  --out-loc="/keys/out" \
  --source-mnemonic="giant issue aisle success illegal bike spike question tent bar rely arctic volcano long crawl hungry vocal artwork sniff fantasy very lucky have athlete" \
  --source-min=0 \
  --source-max="$NUM_VALIDATORS"

echo "Importing keys to Lighthouse format..."
# Create persistent data dir for validator client
mkdir -p ../$OUTPUT_DIR/validator_keys/lighthouse-data
# Create import script
cat <<EOF > ../$OUTPUT_DIR/import_keys.sh
#!/bin/sh
for key in /keys/out/teku-keys/*.json; do
    filename=\$(basename "\$key")
    pubkey="\${filename%.json}"
    secret="/keys/out/teku-secrets/\${pubkey}.txt"
    echo "Importing \$pubkey"
    lighthouse account validator import \\
        --datadir /data \\
        --keystore "\$key" \\
        --password-file "\$secret" \\
        --network mainnet \\
        --reuse-password
done
EOF
chmod +x ../$OUTPUT_DIR/import_keys.sh

# Run import
docker run --rm \
  -v "$(pwd)/../$OUTPUT_DIR/validator_keys:/keys" \
  -v "$(pwd)/../$OUTPUT_DIR/validator_keys/lighthouse-data:/data" \
  -v "$(pwd)/../$OUTPUT_DIR/import_keys.sh:/import_keys.sh" \
  atomica-lighthouse:latest \
  /bin/sh /import_keys.sh

# Create deploy_block.txt
echo "0" > ../$OUTPUT_DIR/beacon/deploy_block.txt
# Copy missing config files
cp ../$OUTPUT_DIR/metadata/config.yaml ../$OUTPUT_DIR/beacon/config.yaml
cp ../$OUTPUT_DIR/metadata/deposit_contract.txt ../$OUTPUT_DIR/beacon/deposit_contract.txt
cp ../$OUTPUT_DIR/metadata/deposit_contract_block.txt ../$OUTPUT_DIR/beacon/deposit_contract_block.txt

echo "Setup complete. Data in ../$OUTPUT_DIR"
