# Diem Prover - Stwo Edition

Zero-knowledge proof evaluation using **stwo STARK** proving system.

This is a companion project to `diem-prover-circom` for comparing ZK proving approaches.

## Quick Start

### 1. Install Rust Nightly

```bash
# Install rustup if you haven't already
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# The project uses a specific nightly version (specified in rust-toolchain.toml)
# It will be automatically used when you're in this directory
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
diem-prover-stwo/
├── host/                # Rust prover implementation
│   ├── src/
│   │   ├── lib.rs       # Public API
│   │   └── eq_air.rs    # Equality AIR implementation
│   ├── tests/
│   │   └── eq_test.rs   # Integration tests
│   ├── benches/
│   │   └── eq_proving.rs # Performance benchmarks
│   └── Cargo.toml
│
├── rust-toolchain.toml  # Nightly Rust version pin
└── Cargo.toml           # Workspace config
```

## How It Works

### 1. Algebraic Intermediate Representation (AIR)

Unlike Circom circuits that use R1CS constraints, stwo uses AIRs defined directly in Rust:

```rust
impl FrameworkEval for EqualityEval {
    fn evaluate<E: EvalAtRow>(&self, mut eval: E) -> E {
        // Get the two trace columns: a and b
        let a = eval.next_trace_mask();
        let b = eval.next_trace_mask();

        // Add constraint: a - b == 0
        eval.add_constraint(a - b);

        eval
    }
}
```

### 2. Execution Trace

Instead of generating a witness, stwo creates an execution trace:

```rust
// Create two columns filled with values a and b
let trace = generate_trace(log_size, a_val, b_val);
// trace = [[a, a, a, ...], [b, b, b, ...]]
```

### 3. STARK Proof Generation

```rust
// Generate STARK proof
let proof = prove_equality(a, b)?;

// Proof includes:
// - Polynomial commitments
// - FRI (Fast Reed-Solomon IOP) queries
// - Out-of-domain samples
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
| **Stwo STARK** | None (transparent) | ~2.6ms | ~2.6ms | ~7.7 KB |
| **Circom + Groth16** | ~150-200ms | ~20-50ms | ~10-30ms | ~200 bytes |
| **SP1 (core)** | ~38s | ~70s | N/A | N/A |
| **SP1 (compressed)** | ~38s | ~30 min | N/A | ~2 KB |

### Key Differences

#### Stwo STARK Advantages:
- **Transparent setup**: No trusted setup ceremony required
- **Post-quantum secure**: Relies on hash functions, not elliptic curves
- **Simpler security assumptions**: Hash-based security
- **Native Rust**: No external circuit compiler needed

#### Stwo STARK Trade-offs:
- **Larger proof size**: ~7.7 KB vs 200 bytes for Groth16
- **Slower than Groth16**: ~2.6ms vs ~20-50ms for proving
- **More complex verification**: ~2.6ms vs ~10ms for Groth16

#### Why Use Stwo?
- **Post-quantum security**: Future-proof cryptography
- **Transparency**: No trusted setup vulnerabilities
- **Development speed**: Pure Rust, no external tooling
- **Flexibility**: Easy to modify and extend AIRs

## Dependencies

### Rust Crates

- `stwo` - STARK prover implementation
- `stwo-constraint-framework` - AIR constraint framework
- `serde` / `serde_json` - Proof serialization
- `num-traits` - Numerical trait abstractions
- `itertools` - Iterator helpers
- `anyhow` - Error handling

### Rust Version

- Nightly Rust (version pinned in `rust-toolchain.toml`)
- Required for stwo's use of unstable features

## Usage Example

```rust
use diem_prover_stwo::{prove_equality, verify_equality};

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

### "error: no matching package named `stwo`"

Make sure you have git access to the stwo repository:
```bash
git ls-remote https://github.com/starkware-libs/stwo.git
```

### "feature may not be used on the stable release channel"

The project requires nightly Rust. The `rust-toolchain.toml` file should automatically select the correct version when you're in this directory. Verify with:
```bash
rustc --version  # Should show nightly
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

Expected results:
- Proof generation: ~1-3ms
- Proof verification: ~1-3ms
- Proof size: ~7.7 KB
- Constant-time across different inputs

## Testing

See [TEST_METHODOLOGY.md](TEST_METHODOLOGY.md) for comprehensive testing strategy.

Quick test:
```bash
cargo test --release -- --nocapture
```

## Next Steps

1. ✅ Basic equality AIR working
2. ✅ Proof generation and verification
3. ✅ Comprehensive tests
4. ✅ Performance benchmarks
5. ⏸ Additional AIRs (range proofs, signatures)
6. ⏸ Batch verification
7. ⏸ EVM verification (complex, requires research)

## Resources

- [Stwo Repository](https://github.com/starkware-libs/stwo)
- [STARK Documentation](https://starkware.co/stark/)
- [Circle STARKs Paper](https://eprint.iacr.org/2024/278)
- [Comparison with Circom](../diem-prover-circom/README.md)

## License

Apache-2.0
