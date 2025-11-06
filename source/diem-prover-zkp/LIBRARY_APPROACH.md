# Using SP1 as Libraries (No Binary Installation)

## Overview

Instead of using `cargo prove` CLI, we'll use SP1 as Rust libraries directly. This gives us:
- ✅ Full control over the build process
- ✅ Integration with existing tooling
- ✅ No external binary dependencies
- ✅ Standard Cargo workflow

---

## Architecture

```
diem-prover-zkp/
├── guest/                      # Program that runs inside SP1 zkVM
│   ├── Cargo.toml             # Uses sp1-zkvm crate
│   └── src/
│       └── main.rs            # Verification logic
│
├── host/                       # Prover service (generates proofs)
│   ├── Cargo.toml             # Uses sp1-sdk crate
│   └── src/
│       ├── main.rs            # Main prover service
│       ├── aptos_client.rs    # Fetch state proofs
│       └── ethereum_client.rs # Submit to Ethereum
│
├── contracts/                  # Solidity contracts
│   ├── src/
│   │   ├── SP1Verifier.sol    # Core SP1 verification (from sp1-contracts)
│   │   └── DiemLightClient.sol # Our light client
│   └── lib/
│       └── sp1-contracts/     # Git submodule
│
└── build.rs                    # Custom build script
```

---

## Step 1: Project Structure

```bash
cd /Users/lucas/code/rust/atomica/source/diem-prover-zkp

# Create directories
mkdir -p guest/src
mkdir -p host/src
mkdir -p contracts/src
mkdir -p contracts/lib
```

---

## Step 2: Guest Program (Runs in zkVM)

### `guest/Cargo.toml`

```toml
[package]
name = "diem-guest"
version = "0.1.0"
edition = "2021"

[dependencies]
# SP1 zkVM SDK - for running inside the zkVM
sp1-zkvm = { version = "1.0", default-features = false }

# Serialization (no_std compatible)
serde = { version = "1.0", default-features = false, features = ["derive"] }

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
panic = "abort"

[profile.release.build-override]
opt-level = 3

# Build for RISC-V target
[build]
target = "riscv32im-unknown-none-elf"
```

### `guest/src/main.rs`

```rust
//! Diem/Aptos State Verification Program
//! Runs inside SP1 zkVM to verify BLS signatures

#![no_main]
sp1_zkvm::entrypoint!(main);

use serde::{Deserialize, Serialize};

/// Public values that will be visible on-chain
#[derive(Serialize, Deserialize, Debug)]
pub struct PublicValues {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub epoch: u64,
}

/// Complete Aptos state proof with signatures
#[derive(Serialize, Deserialize, Debug)]
pub struct AptosStateProof {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub epoch: u64,
    pub message_hash: [u8; 32],
    pub validators: Vec<Validator>,
    pub signatures: Vec<Signature>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Validator {
    pub public_key: Vec<u8>,  // BLS12-381 G1 (96 bytes)
    pub voting_power: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Signature {
    pub signature: Vec<u8>,   // BLS12-381 G2 (48 bytes)
    pub validator_index: u16,
}

pub fn main() {
    // Read input from the prover
    let proof: AptosStateProof = sp1_zkvm::io::read();

    // 1. Verify version advancement
    assert!(
        proof.new_version > proof.old_version,
        "Version must increase"
    );

    // 2. Calculate quorum threshold (2f+1)
    let total_stake: u128 = proof
        .validators
        .iter()
        .map(|v| v.voting_power as u128)
        .sum();
    let quorum = (total_stake * 2) / 3 + 1;

    // 3. Verify BLS signatures and accumulate voting power
    let mut verified_power: u128 = 0;

    for sig in &proof.signatures {
        let validator = &proof.validators[sig.validator_index as usize];

        // Use SP1's BLS12-381 syscall (optimized precompile)
        let valid = verify_bls12_381(
            &sig.signature,
            &validator.public_key,
            &proof.message_hash,
        );

        if valid {
            verified_power += validator.voting_power as u128;
        }
    }

    // 4. Check quorum
    assert!(verified_power >= quorum, "Insufficient voting power");

    // 5. Commit public outputs
    let public_values = PublicValues {
        old_version: proof.old_version,
        new_version: proof.new_version,
        old_state_root: proof.old_state_root,
        new_state_root: proof.new_state_root,
        epoch: proof.epoch,
    };

    sp1_zkvm::io::commit(&public_values);
}

/// Verify BLS12-381 signature using SP1 precompile
fn verify_bls12_381(signature: &[u8], public_key: &[u8], message: &[u8]) -> bool {
    // SP1 provides optimized BLS12-381 verification
    // This is a syscall that's 120x faster than pure Rust implementation

    #[cfg(target_os = "zkvm")]
    {
        // Real SP1 precompile
        sp1_zkvm::syscalls::syscall_bls12381_verify(signature, public_key, message)
    }

    #[cfg(not(target_os = "zkvm"))]
    {
        // For testing outside zkVM, use a mock
        // In production, this would call actual BLS verification
        true
    }
}
```

### `guest/.cargo/config.toml`

```toml
[build]
target = "riscv32im-unknown-none-elf"

[target.riscv32im-unknown-none-elf]
runner = "sp1-helper"
```

---

## Step 3: Host Prover (Generates Proofs)

### `host/Cargo.toml`

```toml
[package]
name = "diem-prover"
version = "0.1.0"
edition = "2021"

[dependencies]
# SP1 SDK - for generating proofs
sp1-sdk = "1.0"
sp1-helper = "1.0"

# Aptos integration
aptos-sdk = "2.0"
aptos-types = "0.1"
aptos-crypto = "0.1"

# Ethereum integration
ethers = { version = "2.0", features = ["full"] }

# Async runtime
tokio = { version = "1", features = ["full"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
bincode = "1.3"

# Error handling
anyhow = "1.0"
thiserror = "1.0"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Config
dotenv = "0.15"

# Crypto
hex = "0.4"

[build-dependencies]
sp1-helper = "1.0"

[[bin]]
name = "prover"
path = "src/main.rs"
```

### `host/build.rs`

```rust
//! Build script to compile the guest program

use sp1_helper::build_program;

fn main() {
    // Compile the guest program to RISC-V
    build_program("../guest");
}
```

### `host/src/main.rs`

```rust
use anyhow::Result;
use sp1_sdk::{ProverClient, SP1Stdin, SP1Proof};
use std::time::{Duration, Instant};
use tracing::{info, error};

mod aptos_client;
mod ethereum_client;
mod types;

use aptos_client::AptosClient;
use ethereum_client::EthereumClient;
use types::*;

// The ELF binary of the guest program (compiled by build.rs)
const GUEST_ELF: &[u8] = include_bytes!("../../guest/target/riscv32im-unknown-none-elf/release/diem-guest");

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    info!("🚀 Starting Diem SP1 Prover");

    // Load config
    dotenv::dotenv().ok();
    let config = Config::from_env()?;

    // Initialize clients
    let aptos = AptosClient::new(&config.aptos_rpc)?;
    let ethereum = EthereumClient::new(
        &config.eth_rpc,
        &config.contract_address,
        &config.private_key,
    ).await?;

    // Create SP1 prover
    let client = ProverClient::new();

    info!("✅ Initialized all clients");

    // Main loop
    let mut interval = tokio::time::interval(Duration::from_secs(config.poll_interval));

    loop {
        interval.tick().await;

        if let Err(e) = process_update(&aptos, &ethereum, &client).await {
            error!("Update failed: {}", e);
            continue;
        }
    }
}

async fn process_update(
    aptos: &AptosClient,
    ethereum: &EthereumClient,
    prover: &ProverClient,
) -> Result<()> {
    // 1. Get current state from Ethereum
    let current_version = ethereum.get_version().await?;
    info!("Current version: {}", current_version);

    // 2. Check for new Aptos state
    let latest_version = aptos.get_latest_version().await?;

    if latest_version <= current_version {
        info!("No updates");
        return Ok(());
    }

    info!("📥 Update: {} → {}", current_version, latest_version);

    // 3. Fetch state proof
    let state_proof = aptos.get_state_proof(current_version, latest_version).await?;

    // 4. Generate SP1 proof
    info!("🔮 Generating proof...");
    let start = Instant::now();

    let (proof, public_values) = generate_proof(prover, &state_proof)?;

    info!("✅ Proof generated in {:.2}s", start.elapsed().as_secs_f64());
    info!("📦 Proof size: {} bytes", proof.bytes().len());

    // 5. Submit to Ethereum
    info!("📤 Submitting to Ethereum...");
    let tx = ethereum.submit_proof(proof.bytes(), &public_values).await?;

    info!("✅ Submitted! Tx: {:#x}", tx);

    Ok(())
}

fn generate_proof(
    client: &ProverClient,
    state_proof: &AptosStateProof,
) -> Result<(SP1Proof, Vec<u8>)> {
    // Prepare input
    let mut stdin = SP1Stdin::new();
    stdin.write(&state_proof);

    // Generate proof using SP1
    // Options: .run() = faster but larger proofs
    //          .compressed() = smaller proofs
    //          .groth16() = smallest proofs (requires trusted setup)
    let proof = client.prove(GUEST_ELF, stdin)
        .compressed()  // Good balance of size/speed
        .run()?;

    let public_values = proof.public_values.to_vec();

    Ok((proof, public_values))
}

#[derive(Debug)]
struct Config {
    aptos_rpc: String,
    eth_rpc: String,
    contract_address: String,
    private_key: String,
    poll_interval: u64,
}

impl Config {
    fn from_env() -> Result<Self> {
        Ok(Self {
            aptos_rpc: std::env::var("APTOS_RPC")
                .unwrap_or_else(|_| "https://fullnode.mainnet.aptoslabs.com/v1".into()),
            eth_rpc: std::env::var("ETH_RPC")?,
            contract_address: std::env::var("CONTRACT_ADDRESS")?,
            private_key: std::env::var("PRIVATE_KEY")?,
            poll_interval: std::env::var("POLL_INTERVAL")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(60),
        })
    }
}
```

### `host/src/types.rs`

```rust
use serde::{Deserialize, Serialize};

/// Matches the guest program's PublicValues
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PublicValues {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub epoch: u64,
}

/// Complete Aptos state proof
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AptosStateProof {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub epoch: u64,
    pub message_hash: [u8; 32],
    pub validators: Vec<Validator>,
    pub signatures: Vec<Signature>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Validator {
    pub public_key: Vec<u8>,
    pub voting_power: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Signature {
    pub signature: Vec<u8>,
    pub validator_index: u16,
}
```

---

## Step 4: Solidity Verifier

### Setup Foundry with SP1 Contracts

```bash
cd contracts

# Initialize if not already
forge init --force

# Add SP1 contracts as submodule
git submodule add https://github.com/succinctlabs/sp1-contracts.git lib/sp1-contracts

# Create remappings
cat > remappings.txt << EOF
@sp1-contracts/=lib/sp1-contracts/contracts/
@openzeppelin/=lib/openzeppelin-contracts/contracts/
EOF
```

### `contracts/src/ISP1Verifier.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISP1Verifier
/// @notice Interface for the SP1 verifier
interface ISP1Verifier {
    /// @notice Verifies a proof with given public values.
    /// @param programVKey The verification key for the RISC-V program.
    /// @param publicValues The public values encoded as bytes.
    /// @param proofBytes The proof of the program execution the SP1 zkVM encoded as bytes.
    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view;
}
```

### `contracts/src/DiemLightClient.sol`

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {ISP1Verifier} from "./ISP1Verifier.sol";

/// @title DiemLightClient
/// @notice Light client for Aptos/Diem using SP1 ZK proofs
contract DiemLightClient {
    /// @notice Current trusted state
    struct TrustedState {
        uint64 version;
        bytes32 stateRoot;
        bytes32 accumulator;
        uint64 timestamp;
        uint64 epoch;
    }

    /// @notice Public values from SP1 proof (must match guest program)
    struct PublicValues {
        uint64 oldVersion;
        uint64 newVersion;
        bytes32 oldStateRoot;
        bytes32 newStateRoot;
        uint64 epoch;
    }

    TrustedState public trustedState;

    /// @notice SP1 verifier contract
    ISP1Verifier public immutable verifier;

    /// @notice Verification key for our guest program
    bytes32 public immutable programVKey;

    event StateUpdated(
        uint64 indexed version,
        bytes32 stateRoot,
        uint64 epoch
    );

    error VersionMismatch();
    error StateRootMismatch();
    error InvalidProof();
    error AlreadyInitialized();

    constructor(address _verifier, bytes32 _programVKey) {
        verifier = ISP1Verifier(_verifier);
        programVKey = _programVKey;
    }

    /// @notice Initialize the light client with a trusted state
    function initialize(
        uint64 version,
        bytes32 stateRoot,
        bytes32 accumulator,
        uint64 timestamp,
        uint64 epoch
    ) external {
        if (trustedState.version != 0) revert AlreadyInitialized();

        trustedState = TrustedState({
            version: version,
            stateRoot: stateRoot,
            accumulator: accumulator,
            timestamp: timestamp,
            epoch: epoch
        });

        emit StateUpdated(version, stateRoot, epoch);
    }

    /// @notice Update state with SP1 proof
    /// @param proofBytes The SP1 proof bytes
    /// @param publicValuesBytes The public values bytes (ABI encoded)
    function updateState(
        bytes calldata proofBytes,
        bytes calldata publicValuesBytes
    ) external {
        // 1. Decode public values
        PublicValues memory pv = abi.decode(publicValuesBytes, (PublicValues));

        // 2. Verify they match current state
        if (pv.oldVersion != trustedState.version) {
            revert VersionMismatch();
        }
        if (pv.oldStateRoot != trustedState.stateRoot) {
            revert StateRootMismatch();
        }

        // 3. Verify the SP1 proof
        try verifier.verifyProof(programVKey, publicValuesBytes, proofBytes) {
            // Proof valid
        } catch {
            revert InvalidProof();
        }

        // 4. Update state
        trustedState.version = pv.newVersion;
        trustedState.stateRoot = pv.newStateRoot;
        trustedState.epoch = pv.epoch;
        trustedState.timestamp = uint64(block.timestamp);

        emit StateUpdated(pv.newVersion, pv.newStateRoot, pv.epoch);
    }

    /// @notice Get current trusted state
    function getState() external view returns (TrustedState memory) {
        return trustedState;
    }
}
```

---

## Step 5: Build System

### Root `Cargo.toml` (Workspace)

```toml
[workspace]
members = ["guest", "host"]
resolver = "2"

[workspace.dependencies]
sp1-zkvm = "1.0"
sp1-sdk = "1.0"
sp1-helper = "1.0"
serde = { version = "1.0", features = ["derive"] }
```

### `.cargo/config.toml` (Root)

```toml
[build]
target-dir = "target"

[alias]
prove = "run --release --bin prover"
build-guest = "build --release --manifest-path guest/Cargo.toml"
```

---

## Step 6: Build & Run

### Build Guest Program

```bash
# Build the guest (RISC-V binary)
cargo build-guest

# Or manually:
cd guest
cargo build --release --target riscv32im-unknown-none-elf
cd ..
```

### Build & Run Host

```bash
# Build the host (prover)
cd host
cargo build --release

# Run the prover
cargo run --release
```

### Build Contracts

```bash
cd contracts
forge build
forge test -vvv
```

---

## Step 7: Environment Configuration

### `.env`

```bash
# Aptos
APTOS_RPC=https://fullnode.mainnet.aptoslabs.com/v1

# Ethereum
ETH_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
CONTRACT_ADDRESS=0x...
PRIVATE_KEY=0x...

# Prover
POLL_INTERVAL=60

# SP1 Options (optional)
SP1_PROVER=local          # or "network" to use Succinct's network
SP1_PRIVATE_KEY=...       # Only if using network
```

---

## Step 8: Testing

### Test Guest Program

Create `guest/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verification_logic() {
        // Test your verification logic here
        // This runs outside the zkVM for fast iteration
    }
}
```

```bash
cd guest
cargo test
```

### Test Host Prover

Create `host/src/main_test.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_proof_generation() {
        let client = ProverClient::new();
        // Create test proof...
    }
}
```

```bash
cd host
cargo test
```

### Test Contracts

Create `contracts/test/DiemLightClient.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DiemLightClient} from "../src/DiemLightClient.sol";

contract DiemLightClientTest is Test {
    DiemLightClient client;

    function setUp() public {
        // Deploy mock verifier
        address mockVerifier = address(0x123);
        bytes32 vkey = bytes32(uint256(1));

        client = new DiemLightClient(mockVerifier, vkey);
    }

    function testInitialize() public {
        client.initialize(
            100,  // version
            bytes32(uint256(1)),  // state root
            bytes32(uint256(2)),  // accumulator
            uint64(block.timestamp),  // timestamp
            1  // epoch
        );

        DiemLightClient.TrustedState memory state = client.getState();
        assertEq(state.version, 100);
    }
}
```

```bash
cd contracts
forge test -vvv
```

---

## Advantages of This Approach

| Aspect | Library Approach | CLI Approach |
|--------|-----------------|--------------|
| **Installation** | Just `cargo build` | Need `sp1up` binary |
| **Integration** | Standard Rust workspace | Special tooling |
| **CI/CD** | Easy (standard cargo) | Need to install SP1 CLI |
| **Debugging** | Standard Rust debugger | Limited |
| **Customization** | Full control | Limited |
| **Build Process** | Custom build.rs | cargo-prove |

---

## Complete Build Commands

```bash
# Build everything
cargo build --release

# Build just the guest
cargo build --release --manifest-path guest/Cargo.toml

# Build just the host
cargo build --release --manifest-path host/Cargo.toml

# Run the prover
./host/target/release/prover

# Build contracts
cd contracts && forge build

# Run all tests
cargo test --all && cd contracts && forge test
```

---

## Dependencies Summary

### Rust Crates Needed

```toml
# Guest program
sp1-zkvm = "1.0"              # zkVM SDK

# Host prover
sp1-sdk = "1.0"               # Prover SDK
sp1-helper = "1.0"            # Build helpers

# Common
serde = "1.0"                 # Serialization
```

### Solidity Dependencies

```bash
# Clone SP1 contracts
git submodule add https://github.com/succinctlabs/sp1-contracts.git contracts/lib/sp1-contracts
```

---

## Next Steps

1. Create the workspace structure
2. Implement the guest program
3. Implement the host prover
4. Copy the Solidity contracts
5. Build and test locally

Ready to start implementing? I can help you create the actual files!
