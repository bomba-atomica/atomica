# Diem Prover ZKP Redesign: Using Succinct Labs SP1

## Executive Summary

**Current Status**: Project is ~30% complete with stub implementations and missing circuits.

**New Approach**: Adopt **Succinct Labs SP1 zkVM** instead of building Circom circuits from scratch.

**Why SP1**:
- ✅ Production-ready (used by Across Protocol, Celestia, Polygon)
- ✅ Native BLS12-381 support with 120x performance improvement
- ✅ Write verification logic in **Rust** (not Circom)
- ✅ Audited by Veridise, Cantina, OpenZeppelin
- ✅ Secures $4B+ in value across 35+ protocols
- ✅ 5M+ proofs generated in production

**Timeline Reduction**: From 4-6 weeks → **2-3 weeks** by leveraging production code

---

## Architecture Comparison

### OLD: Circom-Based Approach (Original Plan)
```
┌─────────────────────────────────────────────────────────┐
│  Aptos Blockchain                                        │
│  └─> StateProof with BLS signatures                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│  Circom Circuits (MISSING - Need to implement)          │
│  ├─> bls12_381/pairing.circom         (~10M constraints)│
│  ├─> bls12_381/hash_to_curve.circom   (Complex)         │
│  ├─> diem_bls_verify.circom           (Main circuit)    │
│  └─> Trusted Setup Ceremony           (Multi-party)     │
└────────────────────┬────────────────────────────────────┘
                     │ R1CS + Witness
                     ↓
┌─────────────────────────────────────────────────────────┐
│  Rust Prover (Partially Implemented)                    │
│  ├─> ark-groth16                                        │
│  ├─> Generate proof (~45 seconds)                       │
│  └─> Missing: circuit.rs, config.rs, clients           │
└────────────────────┬────────────────────────────────────┘
                     │ Groth16 Proof
                     ↓
┌─────────────────────────────────────────────────────────┐
│  Ethereum                                                │
│  └─> ZKDiemLightClient.sol + Groth16Verifier.sol       │
└─────────────────────────────────────────────────────────┘
```

**Problems**:
- ❌ Complex Circom circuits to implement
- ❌ BLS12-381 pairing is extremely difficult (2000+ lines)
- ❌ Trusted setup ceremony required
- ❌ Hard to debug and maintain
- ❌ 10M+ constraints = long proving time

---

### NEW: SP1 zkVM Approach (Recommended)
```
┌─────────────────────────────────────────────────────────┐
│  Aptos Blockchain                                        │
│  └─> StateProof with BLS signatures                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│  SP1 Program (Rust - Easy to write!)                    │
│                                                          │
│  fn main() {                                             │
│    // 1. Read Aptos StateProof                          │
│    let state_proof = sp1_zkvm::io::read();              │
│                                                          │
│    // 2. Verify BLS signatures (native SP1 precompile)  │
│    for validator in validators {                        │
│        bls12_381_verify(sig, pubkey, msg)?; // Fast!    │
│    }                                                     │
│                                                          │
│    // 3. Check quorum                                   │
│    assert!(voting_power >= quorum);                     │
│                                                          │
│    // 4. Commit public outputs                          │
│    sp1_zkvm::io::commit(&new_state_root);               │
│  }                                                       │
└────────────────────┬────────────────────────────────────┘
                     │ Compiled to RISC-V ELF
                     ↓
┌─────────────────────────────────────────────────────────┐
│  SP1 Prover (Production-Ready)                          │
│  ├─> Uses SP1 zkVM with BLS12-381 precompiles           │
│  ├─> 120x faster than raw circuits                      │
│  ├─> Generates Groth16/Plonk proof                      │
│  └─> No trusted setup needed (PLONK)                    │
└────────────────────┬────────────────────────────────────┘
                     │ SP1 Proof (~200 bytes)
                     ↓
┌─────────────────────────────────────────────────────────┐
│  Ethereum                                                │
│  ├─> SP1DiemLightClient.sol (Adapted from SP1Helios)   │
│  └─> ISP1Verifier (Standard interface)                  │
└─────────────────────────────────────────────────────────┘
```

**Advantages**:
- ✅ Write verification in **Rust** (familiar, debuggable)
- ✅ SP1 handles BLS12-381 automatically (precompiles)
- ✅ No complex Circom circuits
- ✅ No trusted setup (using PLONK)
- ✅ Production-proven (Across, Celestia, etc.)
- ✅ 120x faster than naive approach
- ✅ Easy to test and maintain

---

## New Project Structure

```
diem-prover-zkp/
├── program/                          # SP1 Program (replaces circuits/)
│   ├── Cargo.toml
│   ├── src/
│   │   └── main.rs                   # Main verification logic in Rust
│   ├── elf/                          # Compiled RISC-V binary
│   └── build.rs
│
├── script/                           # SP1 Prover Service
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs                   # Prover service
│   │   ├── aptos_client.rs           # Fetch StateProofs from Aptos
│   │   ├── ethereum_client.rs        # Submit proofs to Ethereum
│   │   └── config.rs                 # Configuration
│   └── proof_data/                   # Cached proofs
│
├── contracts/                        # Solidity contracts
│   ├── src/
│   │   ├── SP1DiemLightClient.sol    # Main light client (adapted from SP1Helios)
│   │   ├── ISP1Verifier.sol          # SP1 verifier interface
│   │   └── MerkleVerifier.sol        # Merkle proof verification
│   └── test/
│       ├── SP1DiemLightClient.t.sol
│       └── Integration.t.sol
│
├── lib/                              # Dependencies
│   ├── sp1-contracts/                # SP1 verifier contracts (submodule)
│   └── aptos-types/                  # Aptos type definitions
│
├── foundry.toml                      # Foundry config (replaces hardhat)
├── rust-toolchain.toml               # Rust version
├── .env.example                      # Environment variables
└── README.md                         # Updated documentation
```

---

## Implementation Plan

### Phase 1: Setup SP1 Environment (Day 1)

**Install SP1**:
```bash
curl -L https://sp1.succinct.xyz | bash
sp1up
cargo prove --version  # Verify installation
```

**Initialize Project**:
```bash
cd source/diem-prover-zkp
cargo prove new diem-verifier  # Creates program/ and script/
```

**Add Dependencies**:
```toml
# program/Cargo.toml
[dependencies]
sp1-zkvm = "1.0"
serde = { version = "1.0", default-features = false, features = ["derive"] }

# script/Cargo.toml
[dependencies]
sp1-sdk = "1.0"
aptos-sdk = "2.0"
ethers = "2.0"
tokio = { version = "1", features = ["full"] }
```

### Phase 2: Implement SP1 Verification Program (Days 2-3)

**program/src/main.rs**:
```rust
#![no_main]
sp1_zkvm::entrypoint!(main);

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct AptosStateProof {
    old_version: u64,
    new_version: u64,
    old_state_root: [u8; 32],
    new_state_root: [u8; 32],
    epoch: u64,
    validators: Vec<ValidatorInfo>,
    signatures: Vec<BLSSignature>,
    message_hash: [u8; 32],
}

#[derive(Serialize, Deserialize)]
pub struct ValidatorInfo {
    public_key: [u8; 96],  // BLS12-381 G1
    voting_power: u64,
}

#[derive(Serialize, Deserialize)]
pub struct BLSSignature {
    signature: [u8; 48],   // BLS12-381 G2
    validator_index: u16,
}

pub fn main() {
    // 1. Read inputs from prover
    let proof: AptosStateProof = sp1_zkvm::io::read();

    // 2. Verify version advancement
    assert!(proof.new_version > proof.old_version, "Stale update");

    // 3. Aggregate voting power
    let mut total_voting_power: u128 = 0;
    let total_stake: u128 = proof.validators
        .iter()
        .map(|v| v.voting_power as u128)
        .sum();

    // 4. Verify each BLS signature using SP1 precompile
    for sig in &proof.signatures {
        let validator = &proof.validators[sig.validator_index as usize];

        // SP1 native BLS12-381 verification (fast!)
        let valid = sp1_zkvm::precompiles::bls12381::verify(
            &sig.signature,
            &validator.public_key,
            &proof.message_hash,
        );

        if valid {
            total_voting_power += validator.voting_power as u128;
        }
    }

    // 5. Check quorum (2f+1 = 2/3)
    let quorum = (total_stake * 2) / 3 + 1;
    assert!(
        total_voting_power >= quorum,
        "Insufficient voting power: {} < {}",
        total_voting_power,
        quorum
    );

    // 6. Commit public outputs (visible on-chain)
    sp1_zkvm::io::commit(&proof.old_version);
    sp1_zkvm::io::commit(&proof.new_version);
    sp1_zkvm::io::commit(&proof.old_state_root);
    sp1_zkvm::io::commit(&proof.new_state_root);
    sp1_zkvm::io::commit(&proof.epoch);
}
```

### Phase 3: Implement Prover Service (Days 4-5)

**script/src/main.rs**:
```rust
use sp1_sdk::{ProverClient, SP1Stdin};
use aptos_sdk::rest_client::Client as AptosClient;
use ethers::prelude::*;

const DIEM_VERIFIER_ELF: &[u8] = include_bytes!("../../program/elf/riscv32im-succinct-zkvm-elf");

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize clients
    let aptos_client = AptosClient::new("https://fullnode.mainnet.aptoslabs.com".parse()?);
    let eth_provider = Provider::<Http>::try_from("https://eth-mainnet.g.alchemy.com/v2/...")?;
    let prover = ProverClient::new();

    // Load light client contract
    let light_client = SP1DiemLightClient::new(
        "0x...".parse()?,
        eth_provider.clone(),
    );

    loop {
        // 1. Get current state from Ethereum
        let current_version = light_client.trusted_state().await?.version;

        // 2. Fetch new state proof from Aptos
        let state_proof = fetch_aptos_state_proof(&aptos_client, current_version).await?;

        // 3. Prepare SP1 inputs
        let mut stdin = SP1Stdin::new();
        stdin.write(&state_proof);

        // 4. Generate proof
        println!("Generating SP1 proof...");
        let (proof, public_values) = prover.prove(DIEM_VERIFIER_ELF, stdin)
            .compressed()  // Use compressed proofs for lower verification cost
            .run()?;

        // 5. Submit to Ethereum
        let tx = light_client
            .update_state(proof.bytes(), public_values.to_vec())
            .send()
            .await?
            .await?;

        println!("✅ Updated to version {}: {:#x}", state_proof.new_version, tx.transaction_hash);

        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}
```

### Phase 4: Adapt Smart Contracts (Days 6-7)

**contracts/src/SP1DiemLightClient.sol**:
```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {ISP1Verifier} from "sp1-contracts/ISP1Verifier.sol";

contract SP1DiemLightClient {
    struct TrustedState {
        uint64 version;
        bytes32 stateRoot;
        bytes32 accumulator;
        uint64 timestamp;
        uint64 epoch;
    }

    TrustedState public trustedState;
    ISP1Verifier public immutable verifier;
    bytes32 public immutable programVKey;  // Verification key for SP1 program

    event StateUpdated(
        uint64 indexed newVersion,
        bytes32 newStateRoot,
        uint64 epoch
    );

    constructor(
        address _verifier,
        bytes32 _programVKey
    ) {
        verifier = ISP1Verifier(_verifier);
        programVKey = _programVKey;
    }

    function initialize(
        uint64 version,
        bytes32 stateRoot,
        bytes32 accumulator,
        uint64 timestamp,
        uint64 epoch
    ) external {
        require(trustedState.version == 0, "Already initialized");

        trustedState = TrustedState({
            version: version,
            stateRoot: stateRoot,
            accumulator: accumulator,
            timestamp: timestamp,
            epoch: epoch
        });
    }

    function updateState(
        bytes calldata proof,
        bytes calldata publicValues
    ) external {
        // 1. Decode public values (outputs from SP1 program)
        (
            uint64 oldVersion,
            uint64 newVersion,
            bytes32 oldStateRoot,
            bytes32 newStateRoot,
            uint64 epoch
        ) = abi.decode(publicValues, (uint64, uint64, bytes32, bytes32, uint64));

        // 2. Verify matches current state
        require(oldVersion == trustedState.version, "Version mismatch");
        require(oldStateRoot == trustedState.stateRoot, "State root mismatch");

        // 3. Verify SP1 proof
        verifier.verifyProof(programVKey, publicValues, proof);

        // 4. Update state
        trustedState.version = newVersion;
        trustedState.stateRoot = newStateRoot;
        trustedState.epoch = epoch;

        emit StateUpdated(newVersion, newStateRoot, epoch);
    }

    // Same verifyAccountState and verifyTransaction as before...
}
```

### Phase 5: Testing & Integration (Days 8-10)

**Test SP1 program locally**:
```bash
cd program
cargo prove build
cargo prove test  # Runs tests in SP1 zkVM
```

**Test contracts**:
```bash
forge test -vvv
```

**Integration test**:
```rust
#[tokio::test]
async fn test_end_to_end() {
    // 1. Generate test state proof
    let proof = create_test_aptos_proof();

    // 2. Generate SP1 proof
    let prover = ProverClient::new();
    let mut stdin = SP1Stdin::new();
    stdin.write(&proof);
    let (sp1_proof, public_values) = prover.prove(ELF, stdin).run().unwrap();

    // 3. Verify on-chain
    let contract = deploy_light_client().await;
    contract.update_state(sp1_proof.bytes(), public_values.to_vec())
        .send()
        .await
        .unwrap();

    // 4. Verify state updated
    let state = contract.trusted_state().await.unwrap();
    assert_eq!(state.version, proof.new_version);
}
```

---

## Key Differences from Original Plan

| Aspect | Original (Circom) | New (SP1) |
|--------|------------------|-----------|
| **Circuit Language** | Circom (DSL) | Rust (familiar) |
| **Complexity** | 10M+ constraints | Handled by SP1 |
| **BLS Verification** | Manual implementation | Native precompile (120x faster) |
| **Setup** | Trusted ceremony | No ceremony (PLONK) |
| **Proving Time** | ~45 seconds | ~5-10 seconds |
| **Development Time** | 4-6 weeks | 2-3 weeks |
| **Debugging** | Very hard | Standard Rust debugging |
| **Maintenance** | Complex | Standard Rust code |
| **Audits** | Need custom audit | SP1 already audited |

---

## Migration Steps

### Step 1: Backup Current Work
```bash
cd source/diem-prover-zkp
git checkout -b backup-circom-approach
git commit -am "Backup original Circom-based design"
git checkout main
```

### Step 2: Remove Obsolete Files
```bash
# Remove Circom-specific files
rm -rf circuits/
rm -rf node_modules/
rm package.json
rm hardhat.config.ts

# Keep these:
# - contracts/ZKDiemLightClient.sol (will adapt)
# - prover/ (will refactor to use SP1)
# - README.md (will update)
```

### Step 3: Initialize SP1 Project
```bash
cargo prove new diem-verifier
# This creates program/ and script/ directories
```

### Step 4: Port Existing Rust Code
```bash
# Move existing prover code into script/
mv prover/src/config.rs script/src/
mv prover/src/diem_client.rs script/src/aptos_client.rs
mv prover/src/ethereum_client.rs script/src/

# Update to use SP1 SDK instead of ark-groth16
```

### Step 5: Update Smart Contract
```bash
# Adapt ZKDiemLightClient.sol to use ISP1Verifier
# Remove Groth16-specific logic
# Add SP1 verification
```

---

## Dependencies to Add

### Rust Dependencies
```toml
# program/Cargo.toml
[dependencies]
sp1-zkvm = "1.0"
serde = { version = "1.0", default-features = false, features = ["derive"] }
hex = { version = "0.4", default-features = false }

# script/Cargo.toml
[dependencies]
sp1-sdk = "1.0"
aptos-sdk = "2.0"
aptos-types = "0.5"
ethers = { version = "2.0", features = ["full"] }
tokio = { version = "1", features = ["full"] }
serde = "1.0"
serde_json = "1.0"
anyhow = "1.0"
tracing = "0.1"
tracing-subscriber = "0.3"
```

### Solidity Dependencies
```bash
# Using Foundry instead of Hardhat
forge install succinctlabs/sp1-contracts
forge install OpenZeppelin/openzeppelin-contracts
```

---

## Cost Analysis

### Proving Costs (Off-chain)

**SP1 Approach**:
- Proving time: ~5-10 seconds (vs 45 seconds Circom)
- Memory: 4-8 GB (vs 12-16 GB Circom)
- CPU: 4 cores (vs 8 cores Circom)

**Using Succinct Prover Network** (Optional):
- Network fee: ~$0.50-2.00 per proof
- No need to run own prover infrastructure
- Production-grade reliability

### On-Chain Costs (Ethereum)

**Gas Costs** (estimated):
- Initialize: ~300K gas (~$30 at 30 gwei)
- Update (single): ~250K gas (~$25 at 30 gwei)
- Update (batched 10x): ~280K gas (~$3 per update)
- Update (batched 100x): ~400K gas (~$0.40 per update)

**Compared to Native BLS Verification**:
- Native (EIP-2537): ~300K gas per update
- SP1: ~250K gas (single) / ~4K gas (batched)
- **Savings**: 17% (single) → 99% (batched)

---

## Production Deployment Path

### Testnet (Sepolia/Goerli)
1. Deploy SP1DiemLightClient
2. Run prover service with test Aptos network
3. Verify proofs are correct
4. Monitor gas costs

### Mainnet Staging
1. Use Succinct Prover Network for reliability
2. Deploy with timelock for upgrades
3. Start with small state updates
4. Gradually increase frequency

### Mainnet Production
1. Enable batching for gas efficiency
2. Run redundant prover services
3. Monitor via Succinct dashboard
4. Set up alerts for failures

---

## Resources & Links

### Official Docs
- SP1 Documentation: https://docs.succinct.xyz/
- SP1 GitHub: https://github.com/succinctlabs/sp1
- SP1 Helios (Reference): https://github.com/succinctlabs/sp1-helios
- SP1 Book: https://succinctlabs.github.io/sp1/

### Example Projects
- Across Protocol V4: https://github.com/across-protocol/sp1-helios
- Celestia Blobstream: https://blog.succinct.xyz/celestia-sp1/
- IBC Eureka: https://blog.succinct.xyz/ibc/

### Audits
- SP1 Helios Audit (OpenZeppelin): https://blog.openzeppelin.com/sp1-helios-audit
- SP1 zkVM Audits: Available on Succinct website

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Setup & Installation | 1 day | SP1 installed, project initialized |
| SP1 Program | 2 days | Rust verification logic complete |
| Prover Service | 2 days | Full prover with Aptos/Eth clients |
| Smart Contracts | 2 days | SP1DiemLightClient deployed |
| Testing | 2 days | Unit + integration tests passing |
| Documentation | 1 day | Updated README, deployment guide |
| **Total** | **10 days** | **Production-ready implementation** |

---

## Next Steps

1. **Review this redesign** with the team
2. **Get approval** to pivot from Circom to SP1
3. **Start Phase 1**: Install SP1 and initialize project
4. **Parallel work**: Update documentation while implementing

---

## Questions?

- SP1 Discord: https://discord.gg/succinct
- Succinct Support: support@succinct.xyz
