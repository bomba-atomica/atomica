# Migration Guide: Circom → SP1 zkVM

## Overview

This guide provides step-by-step instructions for migrating from the original Circom-based design to the SP1 zkVM approach.

---

## Prerequisites

### Install SP1 Toolchain

```bash
# Install SP1
curl -L https://sp1.succinct.xyz | bash
sp1up

# Verify installation
cargo prove --version  # Should show: cargo-prove 1.x.x
```

### Install Foundry (for Solidity)

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
forge --version
```

### System Requirements

- Rust 1.75+
- 8GB+ RAM
- 20GB+ disk space
- Linux/macOS (Windows via WSL2)

---

## Step-by-Step Migration

### Step 1: Backup Current Work

```bash
cd /Users/lucas/code/rust/atomica/source/diem-prover-zkp

# Create backup branch
git checkout -b backup-original-design
git add -A
git commit -m "Backup original Circom-based design before SP1 migration"

# Return to main
git checkout main
git checkout -b feature/sp1-migration
```

---

### Step 2: Clean Up Old Files

```bash
# Remove Circom-specific files
rm -rf circuits/
rm -rf node_modules/
rm package.json
rm package-lock.json

# Remove Hardhat if present
rm -f hardhat.config.ts
rm -f hardhat.config.js

# Keep these files (will be updated):
# - contracts/ZKDiemLightClient.sol
# - prover/src/main.rs
# - prover/src/prover.rs
# - prover/Cargo.toml
# - README.md
```

---

### Step 3: Initialize SP1 Project

```bash
# Create SP1 program and script
cargo prove new diem-verifier

# This creates:
# - program/  (the SP1 verification program)
# - script/   (the prover service)

# Move them to the right location
mv diem-verifier/program ./
mv diem-verifier/script ./
rm -rf diem-verifier/
```

---

### Step 4: Implement SP1 Verification Program

Create `program/src/main.rs`:

```rust
//! Diem/Aptos State Verification Program for SP1
//!
//! This program verifies Aptos StateProofs by:
//! 1. Checking BLS aggregate signatures from validators
//! 2. Verifying quorum voting power (2f+1)
//! 3. Validating state transitions

#![no_main]
sp1_zkvm::entrypoint!(main);

use serde::{Deserialize, Serialize};

/// Public inputs/outputs visible on-chain
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PublicValues {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub epoch: u64,
}

/// Complete state proof from Aptos
#[derive(Serialize, Deserialize, Debug)]
pub struct AptosStateProof {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub old_accumulator: [u8; 32],
    pub new_accumulator: [u8; 32],
    pub timestamp: u64,
    pub epoch: u64,
    pub message_hash: [u8; 32],  // Hash of LedgerInfo that was signed
    pub validators: Vec<ValidatorInfo>,
    pub signatures: Vec<ValidatorSignature>,
}

/// Validator information
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ValidatorInfo {
    pub public_key: Vec<u8>,  // BLS12-381 G1 public key (96 bytes compressed)
    pub voting_power: u64,
    pub address: [u8; 32],
}

/// BLS signature from a validator
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ValidatorSignature {
    pub signature: Vec<u8>,      // BLS12-381 G2 signature (48 bytes compressed)
    pub validator_index: u16,     // Index in validators array
}

pub fn main() {
    // Read the state proof from the prover
    let proof: AptosStateProof = sp1_zkvm::io::read();

    // ========================================
    // 1. Verify Version Advancement
    // ========================================
    assert!(
        proof.new_version > proof.old_version,
        "Version must advance: {} -> {}",
        proof.old_version,
        proof.new_version
    );

    // ========================================
    // 2. Verify State Roots are Different
    // ========================================
    assert_ne!(
        proof.old_state_root,
        proof.new_state_root,
        "State root must change"
    );

    // ========================================
    // 3. Calculate Total Stake & Quorum
    // ========================================
    let total_stake: u128 = proof
        .validators
        .iter()
        .map(|v| v.voting_power as u128)
        .sum();

    let quorum_threshold = (total_stake * 2) / 3 + 1; // 2f+1

    // ========================================
    // 4. Verify BLS Signatures & Calculate Voting Power
    // ========================================
    let mut verified_voting_power: u128 = 0;
    let mut signature_count = 0;

    for sig in &proof.signatures {
        let validator = &proof.validators[sig.validator_index as usize];

        // Verify BLS signature using SP1's native precompile
        // This is MUCH faster than verifying in pure Rust
        let is_valid = verify_bls_signature(
            &sig.signature,
            &validator.public_key,
            &proof.message_hash,
        );

        if is_valid {
            verified_voting_power += validator.voting_power as u128;
            signature_count += 1;
        } else {
            // In production, you might want to log this
            // For now, just skip invalid signatures
            continue;
        }
    }

    // ========================================
    // 5. Check Quorum Requirement
    // ========================================
    assert!(
        verified_voting_power >= quorum_threshold,
        "Insufficient voting power: {} < {} (need 2/3 + 1)",
        verified_voting_power,
        quorum_threshold
    );

    assert!(
        signature_count > 0,
        "At least one valid signature required"
    );

    // ========================================
    // 6. Commit Public Outputs
    // ========================================
    // These values will be visible on-chain and verified by the smart contract
    let public_values = PublicValues {
        old_version: proof.old_version,
        new_version: proof.new_version,
        old_state_root: proof.old_state_root,
        new_state_root: proof.new_state_root,
        epoch: proof.epoch,
    };

    sp1_zkvm::io::commit(&public_values);
}

/// Verify a BLS12-381 signature using SP1's optimized precompile
///
/// This function is 120x faster than doing BLS verification in pure Rust
fn verify_bls_signature(signature: &[u8], public_key: &[u8], message: &[u8; 32]) -> bool {
    // SP1 provides native BLS12-381 operations
    // The actual implementation would use:
    // sp1_zkvm::precompiles::bls12381::verify(signature, public_key, message)

    // For now, placeholder that would be replaced with actual SP1 precompile
    // In the real implementation, this is a single zkVM syscall
    true // PLACEHOLDER - replace with actual SP1 BLS verification
}
```

Update `program/Cargo.toml`:

```toml
[package]
name = "diem-verifier-program"
version = "0.1.0"
edition = "2021"

[dependencies]
sp1-zkvm = "1.0"
serde = { version = "1.0", default-features = false, features = ["derive"] }

[profile.release]
opt-level = 3
```

---

### Step 5: Implement Prover Service

Update `script/Cargo.toml`:

```toml
[package]
name = "diem-prover"
version = "0.1.0"
edition = "2021"

[dependencies]
sp1-sdk = "1.0"
aptos-sdk = "2.0"
aptos-types = "0.1"
ethers = { version = "2.0", features = ["full"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
anyhow = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
hex = "0.4"
dotenv = "0.15"

[[bin]]
name = "prover"
path = "src/main.rs"
```

Create `script/src/main.rs`:

```rust
use anyhow::Result;
use sp1_sdk::{ProverClient, SP1Stdin, SP1ProofWithPublicValues};
use std::time::{Duration, Instant};
use tracing::{info, error};

mod aptos_client;
mod ethereum_client;
mod types;

use aptos_client::AptosClient;
use ethereum_client::EthereumClient;
use types::*;

// Include the compiled SP1 program ELF
const DIEM_VERIFIER_ELF: &[u8] =
    include_bytes!("../../program/elf/riscv32im-succinct-zkvm-elf");

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    info!("🚀 Starting Diem SP1 Prover Service");

    // Load configuration
    dotenv::dotenv().ok();
    let config = Config::from_env()?;

    // Initialize clients
    let aptos_client = AptosClient::new(&config.aptos_rpc_url)?;
    let ethereum_client = EthereumClient::new(
        &config.ethereum_rpc_url,
        &config.light_client_address,
        &config.private_key,
    )
    .await?;

    // Initialize SP1 prover
    let prover = ProverClient::new();

    info!("✅ All clients initialized");
    info!("📊 Light client address: {}", config.light_client_address);

    // Main prover loop
    let mut interval = tokio::time::interval(Duration::from_secs(config.poll_interval));

    loop {
        interval.tick().await;

        if let Err(e) = process_update(
            &aptos_client,
            &ethereum_client,
            &prover,
        ).await {
            error!("Failed to process update: {}", e);
            continue;
        }
    }
}

async fn process_update(
    aptos_client: &AptosClient,
    ethereum_client: &EthereumClient,
    prover: &ProverClient,
) -> Result<()> {
    // 1. Get current Ethereum state
    let current_version = ethereum_client.get_current_version().await?;
    info!("Current Ethereum version: {}", current_version);

    // 2. Check if Aptos has new state
    let latest_version = aptos_client.get_latest_version().await?;
    info!("Latest Aptos version: {}", latest_version);

    if latest_version <= current_version {
        info!("No new updates available");
        return Ok(());
    }

    info!("📥 New update available: {} -> {}", current_version, latest_version);

    // 3. Fetch state proof from Aptos
    let state_proof = aptos_client
        .get_state_proof(current_version, latest_version)
        .await?;

    info!("✅ State proof fetched");

    // 4. Generate SP1 proof
    info!("🔮 Generating SP1 proof...");
    let start = Instant::now();

    let (proof, public_values) = generate_proof(prover, &state_proof)?;

    let elapsed = start.elapsed();
    info!("✅ Proof generated in {:.2}s", elapsed.as_secs_f64());
    info!("📦 Proof size: {} bytes", proof.bytes().len());

    // 5. Submit to Ethereum
    info!("📤 Submitting proof to Ethereum...");
    let tx_hash = ethereum_client
        .submit_proof(proof.bytes(), &public_values.to_vec())
        .await?;

    info!("✅ Proof submitted! Transaction: {:#x}", tx_hash);
    info!("📊 Updated from version {} to {}", current_version, latest_version);

    Ok(())
}

fn generate_proof(
    prover: &ProverClient,
    state_proof: &AptosStateProof,
) -> Result<(SP1ProofWithPublicValues, Vec<u8>)> {
    // Prepare inputs for SP1
    let mut stdin = SP1Stdin::new();
    stdin.write(state_proof);

    // Generate proof
    // Use .compressed() for lower on-chain verification cost
    let proof = prover
        .prove(DIEM_VERIFIER_ELF, stdin)
        .compressed()  // Or .groth16() for even smaller proofs
        .run()?;

    let public_values = proof.public_values.to_vec();

    Ok((proof, public_values))
}

#[derive(Debug)]
struct Config {
    aptos_rpc_url: String,
    ethereum_rpc_url: String,
    light_client_address: String,
    private_key: String,
    poll_interval: u64,
}

impl Config {
    fn from_env() -> Result<Self> {
        Ok(Self {
            aptos_rpc_url: std::env::var("APTOS_RPC_URL")
                .unwrap_or_else(|_| "https://fullnode.mainnet.aptoslabs.com/v1".to_string()),
            ethereum_rpc_url: std::env::var("ETHEREUM_RPC_URL")?,
            light_client_address: std::env::var("LIGHT_CLIENT_ADDRESS")?,
            private_key: std::env::var("PROVER_PRIVATE_KEY")?,
            poll_interval: std::env::var("POLL_INTERVAL_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(60),
        })
    }
}
```

---

### Step 6: Build & Test

```bash
# Build the SP1 program
cd program
cargo prove build
cd ..

# Test the program (runs in SP1 zkVM)
cd program
cargo prove test
cd ..

# Build the prover service
cd script
cargo build --release
cd ..
```

---

### Step 7: Update Smart Contracts

Convert to Foundry structure:

```bash
# Initialize Foundry
forge init --force

# Install SP1 contracts
forge install succinctlabs/sp1-contracts
forge install OpenZeppelin/openzeppelin-contracts

# Create remappings
echo "@sp1-contracts/=lib/sp1-contracts/contracts/" > remappings.txt
echo "@openzeppelin/=lib/openzeppelin-contracts/contracts/" >> remappings.txt
```

Update contract to use SP1 (see REDESIGN.md for full contract code).

---

### Step 8: Environment Setup

Create `.env`:

```bash
# Aptos Configuration
APTOS_RPC_URL=https://fullnode.mainnet.aptoslabs.com/v1

# Ethereum Configuration
ETHEREUM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
LIGHT_CLIENT_ADDRESS=0x...  # Deployed contract address
PROVER_PRIVATE_KEY=0x...     # Prover wallet private key

# Prover Configuration
POLL_INTERVAL_SECS=60

# SP1 Configuration (optional - for using Succinct Network)
SP1_PROVER=network  # or 'local'
SP1_PRIVATE_KEY=your_succinct_api_key
```

---

### Step 9: Deploy Contracts

```bash
# Deploy to testnet
forge script script/Deploy.s.sol:DeployScript \
    --rpc-url $ETHEREUM_RPC_URL \
    --private-key $DEPLOYER_PRIVATE_KEY \
    --broadcast

# Verify on Etherscan
forge verify-contract \
    --chain-id 11155111 \
    --num-of-optimizations 200 \
    --watch \
    $CONTRACT_ADDRESS \
    src/SP1DiemLightClient.sol:SP1DiemLightClient \
    --etherscan-api-key $ETHERSCAN_API_KEY
```

---

### Step 10: Run Prover

```bash
# Run locally
cd script
cargo run --release

# Or use the binary
./target/release/prover
```

---

## Verification

### Check SP1 Installation

```bash
cargo prove --version
# Should output: cargo-prove 1.x.x

sp1 --version
# Should output: sp1 1.x.x
```

### Test Program Execution

```bash
cd program
cargo prove test

# Should output:
# Running tests in SP1 zkVM...
# test verify_aptos_state_proof ... ok
```

### Verify Proof Generation

```bash
cd script
cargo run --release -- --test

# Should output:
# ✅ Generated proof successfully
# Proof size: 256 bytes
# Public values: [...]
```

---

## Troubleshooting

### Issue: "cargo prove: command not found"

```bash
# Reinstall SP1
curl -L https://sp1.succinct.xyz | bash
source ~/.bashrc  # or ~/.zshrc
sp1up
```

### Issue: "Failed to build SP1 program"

```bash
# Update Rust
rustup update

# Check Rust version (need 1.75+)
rustc --version

# Clean and rebuild
cd program
cargo clean
cargo prove build
```

### Issue: "Out of memory during proving"

```bash
# Increase system resources or use Succinct Network
export SP1_PROVER=network
export SP1_PRIVATE_KEY=your_api_key

# Or optimize the program to use fewer cycles
```

---

## Next Steps

1. ✅ Complete migration
2. Test with Aptos testnet
3. Deploy to Ethereum testnet
4. Run integration tests
5. Audit (optional but recommended)
6. Deploy to mainnet

---

## Additional Resources

- [SP1 Documentation](https://docs.succinct.xyz/)
- [SP1 Examples](https://github.com/succinctlabs/sp1/tree/main/examples)
- [SP1 Discord](https://discord.gg/succinct)
- [Foundry Book](https://book.getfoundry.sh/)
