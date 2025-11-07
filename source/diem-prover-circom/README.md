# Diem Prover - Circom Edition

Zero-knowledge proof evaluation using **Circom circuits** and **Groth16** proving system.

This is a companion project to `diem-prover-sp1` for comparing ZK proving approaches.

## Quick Start

### 1. Install Circom

```bash
# Clone and install circom compiler
git clone https://github.com/iden3/circom.git
cd circom
cargo install --path circom

# Verify installation
circom --version
```

### 2. Compile Circuit

```bash
cd circuits
./compile.sh
```

This will:
- Compile `noop.circom` to R1CS and WASM
- Generate constraint system
- Output artifacts to `circuits/build/`

### 3. Run Test

```bash
# Run the noop test
cargo test --release -- --nocapture

# Or specifically:
cargo test --test noop_test test_noop_proof --release -- --nocapture
```

## Project Structure

```
diem-prover-circom/
├── circuits/           # Circom circuits
│   ├── noop.circom    # Simple no-op circuit
│   ├── compile.sh     # Compilation script
│   └── build/         # Compiled artifacts (generated)
│
├── host/              # Rust test harness
│   ├── src/
│   │   └── lib.rs
│   ├── tests/
│   │   └── noop_test.rs  # No-op proof test
│   ├── build.rs       # Build script
│   └── Cargo.toml
│
└── Cargo.toml         # Workspace config
```

## How It Works

### 1. Circom Circuit

The circuit is defined in `circuits/noop.circom`:

```circom
template Noop() {
    signal input in;
    signal output out;
    out <== in;
}
```

This is compiled to:
- **R1CS** (Rank-1 Constraint System) - the circuit constraints
- **WASM** (WebAssembly) - for witness generation

### 2. Rust Test Harness

The test (`host/tests/noop_test.rs`) uses **ark-circom** to:

1. Load compiled circuit (R1CS + WASM)
2. Generate proving/verification keys (Groth16 trusted setup)
3. Build witness from inputs
4. Generate Groth16 proof
5. Verify the proof

```rust
// Load circuit
let cfg = CircomConfig::<Bn254>::new(wasm_path, r1cs_path)?;
let mut builder = CircomBuilder::new(cfg);

// Set inputs
builder.push_input("in", 43);

// Generate keys
let params = Groth16::<Bn254>::generate_random_parameters(...)?;

// Build witness and prove
let circom = builder.build()?;
let proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)?;

// Verify
let verified = Groth16::<Bn254>::verify(...)?;
```

## Performance Comparison

| System | Setup Time | Proving Time | Proof Size |
|--------|-----------|--------------|------------|
| **Circom + Groth16** | ~50-100ms | ~50-200ms | ~200 bytes |
| **SP1 (core)** | ~38s | ~70s | N/A (not serializable) |
| **SP1 (compressed)** | ~38s | ~30 min | ~2 KB |

Circom is **significantly faster** for simple circuits because:
- Application-specific circuits (not a general VM)
- Groth16 has very fast proving
- Small constraint count for simple operations

## Dependencies

### Rust Crates

- `ark-circom` - Circom integration for arkworks
- `ark-bn254` - BN254 elliptic curve
- `ark-groth16` - Groth16 proving system
- `ark-relations` - R1CS relations
- `num-bigint` - Big integer support

### External Tools

- `circom` - Circuit compiler (must be installed separately)

## Troubleshooting

### "Circuit not compiled"

```bash
cd circuits
./compile.sh
```

### "circom: command not found"

Install circom:
```bash
git clone https://github.com/iden3/circom.git
cd circom
cargo install --path circom
```

### "Circuit files not found"

Make sure you've compiled the circuit before running tests:
```bash
cd circuits && ./compile.sh
cd .. && cargo test --release
```

## Next Steps

1. ✅ Basic noop circuit working
2. Create BLS signature verification circuit
3. Compare performance with SP1
4. Implement batch verification
5. Optimize constraint count

## Resources

- [Circom Documentation](https://docs.circom.io/)
- [arkworks Documentation](https://arkworks.rs/)
- [Groth16 Paper](https://eprint.iacr.org/2016/260)
- [Comparison with SP1](../diem-prover-sp1/PROVING_ALTERNATIVES.md)

## License

Apache-2.0
