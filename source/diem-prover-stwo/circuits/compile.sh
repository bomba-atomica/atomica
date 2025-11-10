#!/bin/bash
set -e

CIRCUIT_NAME="noop"
BUILD_DIR="build"

echo "🔧 Compiling Circom circuit: ${CIRCUIT_NAME}"

# Create build directory
mkdir -p ${BUILD_DIR}

# Compile the circuit
echo "📦 Step 1: Compile circuit to R1CS and WASM..."
circom ${CIRCUIT_NAME}.circom \
    --r1cs \
    --wasm \
    --sym \
    --c \
    -o ${BUILD_DIR}

echo "✅ Circuit compiled successfully!"
echo ""
echo "Generated files:"
ls -lh ${BUILD_DIR}/${CIRCUIT_NAME}_js/

echo ""
echo "📊 Circuit info:"
echo "   R1CS: ${BUILD_DIR}/${CIRCUIT_NAME}.r1cs"
echo "   WASM: ${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"
echo "   Symbols: ${BUILD_DIR}/${CIRCUIT_NAME}.sym"
echo ""
echo "✅ Compilation complete!"
echo ""
echo "Next steps:"
echo "1. Generate proving/verification keys (if needed)"
echo "2. Run: cargo test --release"
