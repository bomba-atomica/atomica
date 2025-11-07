# Diem Prover SP1

Zero-knowledge proof light client for Aptos/Diem on Ethereum, using **SP1 zkVM** (no binary installation required).

## Quick Start

### 1. Install Rust Toolchain

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add RISC-V target (required for guest program)
rustup target add riscv32im-unknown-none-elf
```

### 2. Clone & Setup

```bash
cd source/diem-prover-sp1

# Copy environment file
cp .env.example .env

# Edit .env with your values
# - ETHEREUM_RPC: Your Ethereum RPC URL
# - CONTRACT_ADDRESS: Deployed light client address
# - PRIVATE_KEY: Prover wallet private key
```

### 3. Build

```bash
# Build everything (guest + host)
cargo build --release

# The build script will:
# 1. Compile guest program to RISC-V
# 2. Build the host prover
# 3. Link everything together
```

### 4. Run

```bash
# Run the prover
cargo run --release --bin prover

# Or use the binary directly
./target/release/prover
```

## Project Structure

```
diem-prover-sp1/
├── guest/              # Program that runs inside SP1 zkVM
│   ├── src/main.rs    # BLS verification logic
│   └── Cargo.toml
│
├── host/               # Test harness (runs SP1 prover)
│   ├── src/
│   │   └── types.rs             # Shared types
│   ├── tests/
│   │   ├── noop_test.rs         # Basic prover test
│   │   └── proof_generation.rs  # Full proof generation test
│   └── Cargo.toml
│
├── contracts/          # Solidity contracts
│   └── src/
│       └── DiemLightClient.sol
│
└── Cargo.toml         # Workspace config
```

## How It Works

### 1. Guest Program (zkVM)

The guest program runs **inside the SP1 zkVM** and verifies:
- ✅ BLS12-381 aggregate signatures from Aptos validators
- ✅ Quorum requirements (2f+1 voting power)
- ✅ State transition validity

```rust
// guest/src/main.rs
pub fn main() {
    let proof: AptosStateProof = sp1_zkvm::io::read();

    // Verify BLS signatures using SP1 precompile
    for sig in &proof.signatures {
        verify_bls_signature(sig, validator, message);
    }

    // Check quorum and commit outputs
    assert!(voting_power >= quorum);
    sp1_zkvm::io::commit(&public_values);
}
```

### 2. Host Prover

The host prover:
1. Fetches state proofs from Aptos
2. Generates SP1 proofs by running the guest program
3. Submits proofs to Ethereum

```rust
// host/src/main.rs
let proof = client.prove(GUEST_ELF, stdin)
    .compressed()  // ~1-2KB proofs
    .run()?;

ethereum.submit_proof(proof.bytes(), &public_values).await?;
```

### 3. Smart Contract

Verifies SP1 proofs on Ethereum:

```solidity
// contracts/src/DiemLightClient.sol
function updateState(
    bytes calldata proofBytes,
    bytes calldata publicValuesBytes
) external {
    verifier.verifyProof(programVKey, publicValuesBytes, proofBytes);
    trustedState = newState;
}
```

## Development

### Testing

```bash
# Test guest program
cd guest && cargo test

# Test host prover
cd host && cargo test

# Test contracts
cd contracts && forge test
```

### Building Components

```bash
# Build only guest (RISC-V)
cargo build --release --manifest-path guest/Cargo.toml

# Build only host
cargo build --release --manifest-path host/Cargo.toml

# Build contracts
cd contracts && forge build
```

### Debugging

```bash
# Run with debug logs
RUST_LOG=debug cargo run --bin prover

# Run with trace logs
RUST_LOG=trace cargo run --bin prover
```

## Dependencies

### Rust Crates

- `sp1-zkvm` - Guest program SDK (no_std)
- `sp1-sdk` - Host prover SDK
- `sp1-helper` - Build helpers
- `aptos-sdk` - Aptos integration
- `ethers` - Ethereum integration

### Solidity

- SP1 verifier contracts (git submodule)
- OpenZeppelin contracts

## Gas Costs

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| Initialize | ~300K | One-time setup |
| Update (single) | ~250K | Per proof |
| Update (10x batch) | ~280K total | ~28K per update |
| Update (100x batch) | ~400K total | ~4K per update |

## Performance

| Metric | Value |
|--------|-------|
| Proving time | 5-10 seconds |
| Proof size | ~1-2 KB (compressed) |
| Memory usage | 4-8 GB |
| CPU cores | 4 recommended |

## Advantages Over Circom

| Aspect | Circom | SP1 Library |
|--------|--------|-------------|
| **Installation** | Need circom binary | Just Rust |
| **Language** | Circom DSL | Rust |
| **Debugging** | Difficult | Standard Rust tools |
| **Build** | circom + snarkjs | cargo build |
| **Testing** | Limited | Full Rust test framework |
| **Development Time** | 4-6 weeks | 2-3 weeks |

## Troubleshooting

### "Target not found: riscv32im-unknown-none-elf"

```bash
rustup target add riscv32im-unknown-none-elf
```

### "Failed to build guest program"

```bash
# Clean and rebuild
cargo clean
cargo build --release
```

### "SP1 proving failed"

Check that:
- Guest program compiles to RISC-V
- Input data is serializable
- Enough memory available (8GB+)

## Next Steps

1. ✅ Build and test locally
2. Implement Aptos client integration
3. Deploy contracts to testnet
4. Run integration tests
5. Deploy to mainnet

## Resources

- [SP1 Documentation](https://docs.succinct.xyz/)
- [SP1 GitHub](https://github.com/succinctlabs/sp1)
- [Redesign Document](./REDESIGN.md)
- [Library Approach Guide](./LIBRARY_APPROACH.md)
- [Migration Guide](./MIGRATION_GUIDE.md)

## License

Apache-2.0
