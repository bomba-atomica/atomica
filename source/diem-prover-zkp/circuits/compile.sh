#!/bin/bash
set -e

echo "🔧 Compiling Diem BLS Verification Circuit"
echo "=========================================="

# Check if circom is installed
if ! command -v circom &> /dev/null; then
    echo "❌ Error: circom not found"
    echo "Install from: https://docs.circom.io/getting-started/installation/"
    exit 1
fi

# Create build directory
mkdir -p build

# Compile main circuit
echo "📦 Compiling diem_bls_verify.circom..."
circom diem_bls_verify.circom \
    --r1cs \
    --wasm \
    --sym \
    --c \
    -o build/

echo "✅ R1CS generated: build/diem_bls_verify.r1cs"
echo "✅ WASM generated: build/diem_bls_verify_js/"
echo "✅ Symbols generated: build/diem_bls_verify.sym"

# Print circuit info
echo ""
echo "📊 Circuit Statistics:"
snarkjs r1cs info build/diem_bls_verify.r1cs

# Print circuit summary
echo ""
echo "✅ Circuit compilation complete!"
echo ""
echo "Next steps:"
echo "  1. Run trusted setup: ./setup-ceremony.sh"
echo "  2. Generate Solidity verifier"
echo "  3. Build prover service"
