#!/bin/bash
set -e

# Script to build the Move framework release bundle (.mrb file) with content-based versioning
# This is much faster than rebuilding the entire aptos binary
# The .mrb file is named head-{hash}.mrb where {hash} is based on all .move source files

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$SCRIPT_DIR"
ZAPATOS_DIR="$SOURCE_ROOT/zapatos"
OUTPUT_DIR="$SOURCE_ROOT/move-framework-fixtures"
FRAMEWORK_DIR="$ZAPATOS_DIR/aptos-move/framework"

# Compute hash of all .move files in the framework
# This creates a deterministic hash based on content of all Move source files
echo "Computing hash of Move framework sources..."
MOVE_HASH=$(find "$FRAMEWORK_DIR" -name "*.move" -type f -exec shasum -a 256 {} \; | sort | shasum -a 256 | cut -d' ' -f1 | cut -c1-16)

OUTPUT_FILE="$OUTPUT_DIR/head-${MOVE_HASH}.mrb"
LATEST_FILE="$OUTPUT_DIR/head.mrb"

echo "Building Move framework release bundle..."
echo "Zapatos directory: $ZAPATOS_DIR"
echo "Move sources hash: $MOVE_HASH"
echo "Output: $OUTPUT_FILE"

# Check if this exact version already exists
if [ -f "$OUTPUT_FILE" ]; then
  echo "✅ Framework bundle already exists (cached): $OUTPUT_FILE"
  echo "Copying to head.mrb..."
  cp "$OUTPUT_FILE" "$LATEST_FILE"
  echo "✅ Latest version: $LATEST_FILE"
  echo "Hash: $MOVE_HASH"
  exit 0
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Change to the framework directory
cd "$FRAMEWORK_DIR"

# Build the release bundle using the framework's build tool
# This compiles all framework packages and creates the .mrb file
# The 'release' command uses ReleaseTarget::Head which includes all packages
# TODO: do release bundles have all the debugging for trace and error maps?
echo "Building framework (this will take a few minutes)..."

cargo run -p aptos-framework -- release --target head

# Move the generated file to our fixtures directory with hash-based name
mv head.mrb "$OUTPUT_FILE"

# Copy to head.mrb for easy reference
cp "$OUTPUT_FILE" "$LATEST_FILE"

echo "✅ Framework bundle built successfully: $OUTPUT_FILE"
echo "✅ Latest version: $LATEST_FILE"
echo "Hash: $MOVE_HASH"
echo ""
echo "You can now run tests without rebuilding the aptos binary:"
echo "  npx vitest run SimpleTransfer"
