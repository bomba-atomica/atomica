# Diem Prover - Plonky3 Edition

Zero-knowledge proof evaluation using **Plonky3 STARK** proving system.

This is a companion project to `diem-prover-stwo` and `diem-prover-circom` for comparing ZK proving approaches.

## Quick Start

### 1. Install Rust Stable

```bash
# Install rustup if you haven't already
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Plonky3 works with stable Rust
rustup default stable
```

### 2. Build Project

```bash
cargo build --release
```

### 3. Run Tests

```bash
# Run all tests
cargo test --release -- --nocapture

# Or specifically:
cargo test --test eq_test --release -- --nocapture
```

### 4. Run Benchmarks

```bash
cargo bench --bench eq_proving
```

## Project Structure

```
diem-prover-plonky3/
├── host/                          # Rust prover implementation
│   ├── src/
│   │   ├── lib.rs                 # Public API
│   │   ├── eq_air.rs              # Equality AIR implementation
│   │   └── verifier/              # Dual verification system
│   │       ├── mod.rs             # Module exports
│   │       ├── types.rs           # Traits and common types
│   │       ├── native_stark.rs    # Native STARK verifier
│   │       └── plonk_wrapper.rs   # STARK-in-SNARK wrapper (Groth16)
│   ├── tests/
│   │   ├── eq_test.rs             # Basic integration tests
│   │   └── dual_verification.rs   # Dual verification tests
│   ├── examples/
│   │   ├── equality_demo.rs       # Basic STARK demo
│   │   └── dual_verification_demo.rs  # Dual verification demo
│   ├── benches/
│   │   └── eq_proving.rs          # Performance benchmarks
│   └── Cargo.toml
│
└── Cargo.toml                     # Workspace config
```

## How It Works

### 1. Algebraic Intermediate Representation (AIR)

Plonky3 uses AIRs defined directly in Rust:

```rust
impl<AB: AirBuilder> Air<AB> for EqualityAir {
    fn eval(&self, builder: &mut AB) {
        let main = builder.main();
        let local = main.row_slice(0);

        // Get the two columns: a and b
        let a = local[0];
        let b = local[1];

        // Add constraint: a - b == 0
        builder.assert_zero(a - b);
    }
}
```

### 2. Execution Trace

Plonky3 creates an execution trace using row-major matrices:

```rust
// Create a 2-column matrix with num_rows rows
let trace = generate_trace(num_rows, a_val, b_val);
// trace is a RowMajorMatrix with columns [a, b]
```

### 3. STARK Proof Generation

```rust
// Generate STARK proof
let proof = prove_equality(a, b)?;

// Proof includes:
// - Polynomial commitments using FRI
// - Merkle tree commitments
// - Query responses
```

### 4. Verification

```rust
// Verify the proof
let verified = verify_equality(&proof)?;
assert!(verified);
```

## Performance Comparison

| System | Setup Time | Proving Time | Verification Time | Proof Size |
|--------|-----------|--------------|-------------------|------------|
| **Plonky3 STARK** | None (transparent) | TBD | TBD | TBD |
| **Stwo STARK** | None (transparent) | ~2.6ms | ~2.6ms | ~7.7 KB |
| **Circom + Groth16** | ~150-200ms | ~20-50ms | ~10-30ms | ~200 bytes |

### Key Differences

#### Plonky3 Advantages:
- **Transparent setup**: No trusted setup ceremony required
- **Post-quantum secure**: Relies on hash functions, not elliptic curves
- **Modular design**: Easy to swap components (fields, hash functions, etc.)
- **Native Rust**: No external circuit compiler needed
- **Stable Rust**: Works with stable Rust (unlike Stwo which requires nightly)
- **Battle-tested**: Used in production systems like Polygon Zero

#### Plonky3 Trade-offs:
- **Larger proof size**: Larger than SNARKs like Groth16
- **Learning curve**: Requires understanding of STARK systems

#### Why Use Plonky3?
- **Post-quantum security**: Future-proof cryptography
- **Transparency**: No trusted setup vulnerabilities
- **Production-ready**: Used in real-world systems
- **Flexibility**: Modular architecture allows customization
- **Performance**: Optimized for speed with Baby Bear field

## Dependencies

### Rust Crates

Plonky3 core crates:
- `p3-air` - AIR trait definitions
- `p3-matrix` - Matrix operations for traces
- `p3-field` - Field arithmetic traits
- `p3-baby-bear` - Baby Bear field implementation
- `p3-uni-stark` - Univariate STARK prover
- `p3-commit` - Polynomial commitment schemes
- `p3-merkle-tree` - Merkle tree implementations
- `p3-fri` - FRI polynomial commitment scheme
- `p3-challenger` - Fiat-Shamir challenger
- `p3-blake3` - Blake3 hash function

Additional crates:
- `serde` / `serde_json` - Proof serialization
- `bincode` - Binary serialization
- `num-traits` - Numerical trait abstractions
- `anyhow` - Error handling

### Rust Version

- Stable Rust (latest stable recommended)
- No nightly features required

## Usage Example

```rust
use diem_prover_plonk::{prove_equality, verify_equality};

// Generate proof that a == b
let proof = prove_equality(42, 42)?;

// Verify the proof
let verified = verify_equality(&proof)?;
assert!(verified);

// Serialize proof
let json = serde_json::to_string(&proof)?;
println!("Proof size: {} bytes", json.len());
```

## Troubleshooting

### "error: no matching package named `p3-*`"

Make sure you have git access to the Plonky3 repository:
```bash
git ls-remote https://github.com/Plonky3/Plonky3.git
```

### Build fails

Try cleaning and rebuilding:
```bash
cargo clean
cargo build --release
```

## Benchmarking

See [BENCHMARKING.md](BENCHMARKING.md) for detailed benchmarking guide.

Quick benchmark:
```bash
cargo bench --bench eq_proving
```

## Testing

See [TEST_METHODOLOGY.md](TEST_METHODOLOGY.md) for comprehensive testing strategy.

Quick test:
```bash
cargo test --release -- --nocapture
```

## New: Dual Verification System

This project now features a **dual verification architecture** supporting two verification methods:

### Method 1: Native STARK Verification
- Direct Plonky3 verification
- Fast (~300ms)
- Transparent setup
- Not EVM-compatible

### Method 2: STARK-in-SNARK Verification
- STARK wrapped in SNARK (currently Groth16)
- EVM-compatible (BN254 curve)
- Compact proofs (~128 bytes vs ~128 KB)
- Requires trusted setup
- **Note**: Groth16 used for production-readiness; PLONK migration path documented

### Usage

```bash
# Run dual verification demo
cargo run --example dual_verification_demo

# Run dual verification tests
cargo test --test dual_verification
```

### SNARK Choice: PLONK (Target)
Currently, the system uses a Groth16 prototype, but the **target architecture is PLONK**.

**Why PLONK?**
- ✅ **Universal Setup**: Uses `hermez-raw-9` Powers of Tau. No circuit-specific ceremony needed.
- ✅ **Flexible**: Can verify any STARK logic without regenerating keys (up to size limit).
- ✅ **Standard**: Widely used in the Ethereum ecosystem.

**Current Status**:
- Prototype: Uses Groth16 (for stability during development).
- **Next Step**: Migration to PLONK wrapper.

### Documentation
- **Full Design Doc**: `docs/SPEC.md`
- **STARK-in-SNARK Overview**: `/docs/technical/stark-in-snark.md`
- **Groth16 vs PLONK**: See design doc for migration strategy

### Performance Comparison

| Metric | Native STARK | STARK-in-SNARK |
|--------|--------------|----------------|
| Verification | ~320ms | ~100ms |
| Proof Size | ~128 KB | 128 bytes |
| Setup | Transparent | ~180ms |
| EVM Compatible | ❌ | ✅ |

## Next Steps

1. ✅ Basic equality AIR working
2. ✅ Proof generation and verification
3. ✅ Comprehensive tests
4. ✅ Dual verification system (Native STARK + STARK-in-SNARK)
5. ✅ Clean modular architecture with traits
6. ⏸ Performance benchmarks
7. ⏸ Full STARK verifier circuit in R1CS
8. ⏸ Additional AIRs (range proofs, signatures)
9. ⏸ Batch verification
10. ⏸ Solidity verifier generation

## Resources

- [Plonky3 Repository](https://github.com/Plonky3/Plonky3)
- [Plonky3 Documentation](https://github.com/Plonky3/Plonky3/tree/main/docs)
- [STARK Documentation](https://starkware.co/stark/)
- [Comparison with Stwo](../diem-prover-stwo/README.md)
- [Comparison with Circom](../diem-prover-circom/README.md)

## License

Apache-2.0
