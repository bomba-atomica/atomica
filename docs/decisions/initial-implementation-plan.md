# Initial Implementation Plan - Technology Vendor Selection

**Document Type**: Implementation Decision Record
**Status**: Draft - Awaiting Technical Validation
**Last Updated**: 2025-12-07
**Author**: Architecture Team

## Executive Summary

This document specifies the exact technology vendors and versions for Atomica's initial implementation. All version numbers, commit hashes, and release notes are referenced for reproducibility and audit purposes.

**Selected Technologies**:
- **Blockchain Foundation**: Aptos-core v1.37.5 (commit: d8d4130)
- **ZK Proof System**: Axiom halo2-lib v0.5.1

## Table of Contents

1. [Blockchain Vendor Selection](#blockchain-vendor-selection)
2. [ZK Proof System Selection](#zk-proof-system-selection)
3. [Dependency Matrix](#dependency-matrix)
4. [Integration Architecture](#integration-architecture)
5. [Critical Research Questions](#critical-research-questions)
6. [Implementation Phases](#implementation-phases)

---

## Blockchain Vendor Selection

### Selected: Aptos-core v1.37.5

**Vendor**: Aptos Labs
**Repository**: https://github.com/aptos-labs/aptos-core
**Release**: aptos-node-v1.37.5 (Mainnet)
**Release Date**: November 24, 2024
**Commit Hash**: `d8d4130fbb16443ac76db7a8ad0b2d54466f6ba0`
**Release Notes**: https://github.com/aptos-labs/aptos-core/releases/tag/aptos-node-v1.37.5
**License**: Apache 2.0

**Minimum Compatible Version**: aptos-node-v1.8.1 (for ECDSA support)
**Recommended CLI Version**: v7.3.0+

### Version Selection Rationale

**Why v1.37.5 over earlier versions:**
- Latest stable mainnet release (as of Dec 2024)
- Includes all performance optimizations and bug fixes from v1.8.1 through v1.37.5
- Contains improvements to VM module cache and consensus
- Better mempool performance for our encrypted mempool extension
- 5+ months of production stability since ECDSA introduction in v1.8.1

**Why not older versions:**
- v1.8.1-v1.19.x: Missing important consensus and mempool optimizations
- v1.29.x: Addressed in multi-step mainnet framework upgrade (proposal #133)
- v1.34.x: Fixed critical move resource viewer bugs

### Feature Availability Matrix

| Feature | Version Introduced | Status in v1.37.5 | Release Notes |
|---------|-------------------|-------------------|---------------|
| **BLS12-381 Signatures** | Genesis (v0.1.0) | ✅ Production | [Aptos Whitepaper](https://aptos.dev/aptos-white-paper/) |
| **ECDSA (secp256k1)** | v1.8.1 (AIP-49) | ✅ Production | [AIP-49](https://github.com/aptos-foundation/AIPs/blob/main/aips/aip-49.md) |
| **Account Abstraction** | v1.8.1 (AIP-55) | ✅ Production | [AIP-55](https://github.com/aptos-foundation/AIPs/blob/main/aips/aip-55.md) |
| **State Proof APIs** | v1.0.0 | ✅ Production | [Light Client Spec](https://github.com/aptos-labs/aptos-core/blob/main/specifications/light_client.md) |
| **Gas Sponsorship** | v1.8.1 (AIP-39/55) | ✅ Production | [AIP-39](https://github.com/aptos-foundation/AIPs/blob/main/aips/aip-39.md) |
| **BLS Encrypted Mempool** | N/A | 🔨 Custom Required | See Implementation Plan |
| **BLS Threshold tlock** | N/A | 🔬 Research Needed | See Research Questions |

### Required Custom Implementations

#### 1. Encrypted Mempool Module

**Status**: Not available in upstream Aptos
**Implementation Strategy**: Custom module with clean separation

```
atomica-chain/
├── crates/
│   └── encrypted-mempool/
│       ├── Cargo.toml              # Dependencies on aptos-mempool
│       ├── src/
│       │   ├── lib.rs
│       │   ├── encrypted_pool.rs   # Encrypted transaction storage
│       │   ├── decryption.rs       # Threshold decryption trigger
│       │   └── integration.rs      # Hooks into core mempool
│       └── tests/
│           └── integration_tests.rs
```

**Upstream Integration Points**:
- `mempool/src/core_mempool.rs` - Transaction storage
- `mempool/src/shared_mempool/` - P2P gossip protocol
- `consensus/src/block_storage/` - Block proposal integration

**Maintenance Strategy**:
- Track upstream mempool changes via `git diff upstream/main -- mempool/`
- Quarterly review of mempool commits for security patches
- Use Rust trait system to minimize coupling with core mempool

#### 2. BLS Threshold Timelock (tlock)

**Status**: Research required (see [Critical Research Questions](#critical-research-questions))

**If Feasible with Aptos BLS Infrastructure**:
```
atomica-chain/
├── crates/
│   └── tlock/
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs
│       │   ├── ibe.rs              # IBE-based encryption
│       │   ├── validator.rs        # Validator decryption shares
│       │   └── aggregation.rs      # Threshold aggregation
│       └── tests/
```

**Fallback: drand Integration**:
- Use drand.love for timelock encryption (external dependency)
- Client library: https://github.com/drand/tlock-rs
- Version: v0.0.4+ (BLS12-381 compatible)

### Codebase Reference Points

**ECDSA Signature Verification**:
```
aptos-core/
├── aptos-move/framework/aptos-stdlib/sources/cryptography/
│   ├── secp256k1.move              # Public API for ECDSA verification
│   └── ecdsa_k1.move               # Low-level primitives
├── aptos-move/framework/aptos-stdlib/doc/
│   └── secp256k1.md                # Module documentation
└── aptos-move/framework/move-stdlib/sources/
    └── hash.move                   # Keccak256 for Ethereum compatibility
```

**Account Abstraction**:
```
aptos-core/
├── aptos-move/framework/aptos-framework/sources/
│   ├── account.move                # Account creation and management
│   ├── transaction_fee.move        # Gas sponsorship
│   └── transaction_validation.move # Signature validation
└── types/src/
    ├── transaction/authenticator.rs  # Multi-sig support
    └── account_address.rs            # Address derivation
```

**BLS Infrastructure**:
```
aptos-core/
├── crates/aptos-crypto/src/bls12381/
│   ├── bls12381_keys.rs            # Key generation and management
│   ├── bls12381_sigs.rs            # Signature primitives
│   └── aggregate_sig.rs            # Threshold aggregation
├── consensus/src/
│   └── block_storage/              # Validator signatures
└── types/src/
    ├── validator_set.rs            # Validator set management
    └── validator_verifier.rs       # Signature verification
```

**State Proof Generation**:
```
aptos-core/
├── storage/aptosdb/src/
│   └── db/aptosdb_reader.rs        # Proof generation methods
├── types/src/proof/
│   ├── mod.rs                      # Proof types
│   ├── accumulator.rs              # Transaction accumulator proofs
│   └── sparse_merkle.rs            # State sparse Merkle proofs
└── api/src/
    └── state.rs                    # REST API endpoints for proofs
```

### REST API Endpoints (State Proofs)

**Available in v1.37.5**:

```bash
# Light client state synchronization
GET /v1/state_proof?known_version={version}
# Returns: StateProof with BLS signatures

# Transaction inclusion proof
GET /v1/transactions/{version}/proof?ledger_version={version}&include_events={bool}
# Returns: TransactionWithProof

# Account state proof (Sparse Merkle)
GET /v1/accounts/{address}/state/{key}/proof?version={version}
# Returns: StateValueWithProof

# Validator set changes
GET /v1/epochs/{start_epoch}/proof?end_epoch={end_epoch}
# Returns: EpochChangeProof with signed validator transitions
```

**Documentation**: https://aptos.dev/nodes/validator-node/connect-nodes/full-node-rest-api

### Fork Strategy

**Initial Fork**:
```bash
# Clone upstream
git clone https://github.com/aptos-labs/aptos-core.git atomica-chain
cd atomica-chain

# Checkout specific release
git checkout aptos-node-v1.37.5
git checkout -b atomica/v1.37.5-base

# Verify commit hash
git rev-parse HEAD
# Expected: d8d4130fbb16443ac76db7a8ad0b2d54466f6ba0

# Add Atomica remote
git remote add atomica git@github.com:atomica/atomica-chain.git
git push atomica atomica/v1.37.5-base
```

**Upstream Tracking**:
```bash
# Add upstream remote for security patches
git remote add upstream https://github.com/aptos-labs/aptos-core.git

# Periodic security patch merges
git fetch upstream
git log upstream/main --since="2024-11-24" --grep="security\|CVE" --oneline
# Review and cherry-pick critical security fixes
```

**Custom Module Strategy**:
- Keep custom modules in `atomica-chain/crates/` (not modifying core Aptos crates)
- Document all core modifications in `ATOMICA_MODIFICATIONS.md`
- Use Rust feature flags to conditionally compile Atomica-specific code

### Security Considerations

**Known Vulnerabilities**: None reported for v1.37.5 as of Dec 2024

**Security Patch Process**:
1. Subscribe to Aptos security advisories: https://github.com/aptos-labs/aptos-core/security/advisories
2. Monitor Aptos Discord #mainnet-announcements for critical updates
3. Review all upstream commits touching mempool, consensus, or crypto modules

**Audit History**:
- Aptos-core has undergone multiple audits by Trail of Bits, Zellic, OtterSec
- Audit reports: https://github.com/aptos-labs/aptos-core/tree/main/developer-docs-site/static/papers

---

## ZK Proof System Selection

### Selected: Axiom halo2-lib v0.5.1

**Vendor**: Axiom
**Repository**: https://github.com/axiom-crypto/halo2-lib
**Release**: v0.5.1
**Release Date**: October 2024
**Commit Hash**: Check latest tag at https://github.com/axiom-crypto/halo2-lib/releases/tag/v0.5.1
**License**: MIT / Apache 2.0

**Production-Ready Version**: v0.4.1 (Axiom Mainnet V2 launch)
**Audit Status**: Audited from v0.3.0+ by Spearbit and Trail of Bits (June 2023)
**Audit Reports**: https://github.com/axiom-crypto/halo2-lib#security-audits

### Component Versions

| Crate | Version | Purpose |
|-------|---------|---------|
| `halo2-base` | v0.5.1 | Core circuit framework (eDSL) |
| `halo2-ecc` | v0.5.1 | Elliptic curve cryptography |
| `halo2-axiom` | v0.4.4 | PLONK proving system |
| `snark-verifier` | v0.1.8+ | Recursive proof aggregation |
| `zkevm-hashes` | v0.2.1+ | Keccak, Poseidon circuits |

**Crates.io References**:
- https://crates.io/crates/halo2-base
- https://crates.io/crates/halo2-ecc
- https://crates.io/crates/halo2-axiom

### Why Axiom Over Alternatives

**Comparison Against Other PLONK Systems**:

| System | Axiom halo2-lib | Scroll halo2 | PSE halo2 | Plonky3 | SP1 |
|--------|-----------------|--------------|-----------|---------|-----|
| **Proof System** | PLONK (Halo2) | PLONK (Halo2) | PLONK (Halo2) | STARK (FRI) | STARK→Groth16 |
| **Latest Version** | v0.5.1 (Oct 2024) | v2024.7.1 | (rolling) | v0.3.1 | v4.0.0 |
| **Verification Gas** | ~280K | ~300K | ~300K | 5-10M | ~250K |
| **Proving Time** | 2-5 min | 3-8 min | 3-8 min | 10-30 sec | 5-15 min |
| **Production Use** | Axiom V2 (mainnet) | Scroll zkEVM | Research | Polygon Zero | Succinct |
| **Audit Status** | ✅ Audited (v0.3.0+) | ✅ Audited | ⚠️ Not audited | ✅ Audited | ✅ Audited |
| **Developer UX** | ✅ Excellent Rust DSL | ⚠️ zkEVM-focused | ⚠️ Low-level API | ✅ Good | ✅ Excellent |
| **Documentation** | ✅ Extensive | ⚠️ Moderate | ⚠️ Limited | ✅ Good | ✅ Good |
| **BLS Circuits** | ✅ Production-proven | ✅ Available | ✅ Available | ✅ Available | ✅ Available |
| **EVM Compatibility** | ✅ Native (BN254) | ✅ Native | ✅ Native | ❌ Too expensive | ✅ Wrapper |

**Decision Rationale**:
1. **Production-proven**: Axiom V2 verifies historical Ethereum state proofs on mainnet
2. **Audit coverage**: External audits by Spearbit and Trail of Bits since v0.3.0
3. **Ethereum-optimized**: ~280K gas verification cost on L1
4. **Best developer experience**: High-quality Rust API with comprehensive examples
5. **BLS-friendly**: Already used in production for BLS signature verification in ZK

**Scroll Halo2 Consideration**:
- Excellent technology powering Scroll zkEVM (billions in TVL)
- More complex than needed for auction circuits (designed for full EVM trace)
- Less documented for custom circuit use cases
- **Verdict**: Good alternative, but Axiom better suited for our use case

**SP1 Consideration**:
- Excellent developer experience (Rust zkVM)
- Slightly cheaper verification (~250K gas vs 280K)
- Two-stage proving adds complexity
- **Verdict**: Strong alternative, recommend re-evaluating if Axiom proves insufficient

### Circuit Implementation Example

**Cargo.toml Dependencies**:
```toml
[dependencies]
halo2-base = { version = "0.5.1", default-features = false, features = ["halo2-axiom", "display"] }
halo2-ecc = { version = "0.5.1", default-features = false, features = ["halo2-axiom"] }
halo2-axiom = { version = "0.4.4" }
snark-verifier = { version = "0.1.8" }
zkevm-hashes = { version = "0.2.1", default-features = false, features = ["halo2-axiom"] }

# For BLS signature verification in circuits
ark-std = "0.4"
ark-bn254 = "0.4"

# Poseidon hash for Merkle trees
poseidon = "0.2"
```

**Auction Settlement Circuit** (Simplified):
```rust
use halo2_base::{
    gates::{GateChip, GateInstructions, RangeChip, RangeInstructions},
    utils::ScalarField,
    AssignedValue, Context, QuantumCell,
};
use halo2_ecc::{bn254::FpChip, fields::FieldChip};

/// Auction settlement circuit configuration
#[derive(Clone, Debug)]
pub struct AuctionConfig {
    pub max_bids: usize,          // e.g., 1000
    pub max_price: u128,          // Price range
    pub merkle_depth: usize,      // e.g., 10 (supports 1024 accounts)
}

/// Circuit proving auction settlement correctness
pub struct AuctionSettlementCircuit<F: ScalarField> {
    // Private inputs (witness)
    pub bids: Vec<Bid>,                    // Decrypted bids from mempool
    pub initial_balances: Vec<Balance>,    // Pre-auction balances

    // Public inputs
    pub merkle_root: [u8; 32],            // Final balance Merkle root
    pub auction_params: AuctionParams,     // Asset, deadline, etc.

    _marker: PhantomData<F>,
}

impl<F: ScalarField> Circuit<F> for AuctionSettlementCircuit<F> {
    type Config = BaseConfig<F>;
    type FloorPlanner = SimpleFloorPlanner;

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<F>,
    ) -> Result<(), Error> {
        let mut ctx = Context::new();

        // Load bids as circuit assignments
        let bid_assignments = self.load_bids(&mut ctx, &config)?;

        // 1. Validate all bids (range checks, signatures)
        for (i, bid) in bid_assignments.iter().enumerate() {
            // Range check: 0 <= price <= MAX_PRICE
            config.range.range_check(&mut ctx, bid.price, 128);

            // Range check: 0 <= quantity <= MAX_QUANTITY
            config.range.range_check(&mut ctx, bid.quantity, 128);

            // Verify bid signature (optional: can be done off-circuit)
            // verify_ecdsa_signature(&mut ctx, &config, bid)?;
        }

        // 2. Sort bids by price (descending) using comparison circuit
        let sorted_bids = self.sort_bids(&mut ctx, &config, bid_assignments)?;

        // 3. Compute clearing price (uniform price auction)
        let clearing_price = self.compute_clearing_price(
            &mut ctx,
            &config,
            &sorted_bids,
            self.auction_params.total_supply,
        )?;

        // 4. Determine winners
        let winners = self.select_winners(
            &mut ctx,
            &config,
            &sorted_bids,
            clearing_price,
        )?;

        // 5. Compute final balances
        let final_balances = self.settle_balances(
            &mut ctx,
            &config,
            &self.initial_balances,
            &winners,
            clearing_price,
        )?;

        // 6. Compute Merkle root of final balances
        let computed_root = self.merkle_root_circuit(
            &mut ctx,
            &config,
            &final_balances,
        )?;

        // 7. Constrain public output
        for (i, byte) in self.merkle_root.iter().enumerate() {
            ctx.constrain_equal(
                computed_root[i],
                ctx.load_constant(F::from(*byte as u64)),
            );
        }

        Ok(())
    }
}
```

**Verifier Contract Generation**:
```bash
# Generate Solidity verifier
cargo run --bin gen-verifier \
    --circuit auction_settlement \
    --output ./verifier/solidity/AuctionSettlementVerifier.sol

# Output: ~280K gas verification cost
```

**Generated Verifier** (Solidity):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title AuctionSettlementVerifier
/// @notice Auto-generated by Axiom halo2-lib v0.5.1
contract AuctionSettlementVerifier {
    // KZG verification parameters
    uint256 constant p = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @notice Verify auction settlement proof
    /// @param proof The PLONK proof bytes
    /// @param merkleRoot The public input (claimed Merkle root)
    /// @return True if proof is valid
    function verifyProof(
        bytes calldata proof,
        bytes32 merkleRoot
    ) external view returns (bool) {
        // KZG pairing verification
        // Gas cost: ~280,000
        // ...
    }
}
```

### Production Deployment Architecture

```
atomica-prover/
├── Cargo.toml                      # Workspace with halo2-lib dependencies
├── circuits/
│   ├── auction_settlement.rs       # Main auction clearing circuit
│   ├── bid_validation.rs           # Per-bid validation subcircuit
│   ├── merkle_tree.rs              # Poseidon Merkle tree
│   └── utils/
│       ├── sorting.rs              # Price-based sorting gadget
│       └── balance_updates.rs      # Settlement computation
├── prover/
│   ├── main.rs                     # gRPC proving service
│   ├── gpu.rs                      # Optional: CUDA/Metal acceleration
│   ├── cache.rs                    # Proving/verification key caching
│   └── config.rs                   # Circuit parameters
├── verifier/
│   └── solidity/                   # Generated by Axiom tooling
│       ├── AuctionSettlementVerifier.sol
│       └── libraries/              # Helper libraries
├── benches/
│   └── proving_benchmarks.rs       # Performance tests
└── tests/
    └── integration_tests.rs        # End-to-end proof generation
```

---

## Dependency Matrix

### Build Environment

| Component | Version | Purpose | Source |
|-----------|---------|---------|--------|
| **Rust Toolchain** | 1.79.0+ | Aptos & Axiom compilation | [rustup.rs](https://rustup.rs) |
| **Cargo** | 1.79.0+ | Package management | Bundled with Rust |
| **LLVM** | 17+ | Required by Aptos | System package manager |
| **CMake** | 3.22+ | Aptos native dependencies | System package manager |
| **OpenSSL** | 3.0+ | Cryptography | System package manager |
| **PostgreSQL** | 14+ | Optional: indexer storage | System package manager |

**Rust Toolchain Pinning** (for Aptos v1.37.5):
```bash
# Check Aptos required Rust version
cat atomica-chain/rust-toolchain.toml
# Expected output: channel = "1.79.0"

rustup install 1.79.0
rustup default 1.79.0
cargo --version
# Expected: cargo 1.79.0
```

### Runtime Dependencies

**Aptos Node**:
```toml
# Core cryptography
aptos-crypto = "1.37.5"
aptos-crypto-derive = "1.37.5"

# BLS12-381
bls12_381 = "0.8"
blst = "0.3"  # High-performance BLS implementation

# ECDSA (secp256k1)
libsecp256k1 = "0.7"
k256 = "0.13"  # Elliptic curve operations

# State proof generation
aptos-types = "1.37.5"
aptos-storage = "1.37.5"

# Move VM
move-core-types = "1.37.5"
move-vm-runtime = "1.37.5"
```

**Axiom halo2-lib**:
```toml
# Core halo2
halo2-base = "0.5.1"
halo2-ecc = "0.5.1"
halo2-axiom = "0.4.4"

# Curve arithmetic
halo2curves-axiom = "0.5.0"  # BN254 curve
ark-std = "0.4"

# Proof system
snark-verifier = "0.1.8"
snark-verifier-sdk = "0.1.8"

# Hash functions for circuits
zkevm-hashes = "0.2.1"       # Keccak, Poseidon
poseidon-primitives = "0.2"
```

### Development Tools

**Testing & Benchmarking**:
```toml
[dev-dependencies]
criterion = "0.5"       # Performance benchmarking
proptest = "1.4"        # Property-based testing
tokio-test = "0.4"      # Async testing
```

**CI/CD Tools**:
- GitHub Actions workflows
- Docker v24+ (for containerized builds)
- Buildx (multi-arch builds)

---

## Integration Architecture

### System Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                Atomica Chain (aptos-core v1.37.5)                │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Custom Encrypted Mempool Module                          │   │
│  │  ├─ encrypted_pool.rs (encrypted tx storage)             │   │
│  │  ├─ decryption.rs (threshold tlock trigger)              │   │
│  │  └─ integration.rs (hooks → core_mempool.rs)             │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────────────┐   │
│  │  Move Smart Contracts (aptos-framework)                  │   │
│  │  ├─ auction.move (lifecycle, settlement)                 │   │
│  │  ├─ bid_registry.move (post-decryption validation)       │   │
│  │  └─ merkle_settlement.move (balance Merkle root)         │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────────────┐   │
│  │  Account Abstraction (AIP-55, native in v1.37.5)         │   │
│  │  ├─ secp256k1.move (ECDSA verification)                  │   │
│  │  ├─ account.move (Ethereum address mapping)              │   │
│  │  └─ transaction_fee.move (gas sponsorship)               │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────────────┐   │
│  │  BLS Infrastructure (native aptos-crypto)                │   │
│  │  ├─ bls12381_sigs.rs (validator consensus)               │   │
│  │  ├─ aggregate_sig.rs (threshold signatures)              │   │
│  │  └─ tlock.rs (CUSTOM: IBE timelock) ← RESEARCH NEEDED    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  REST APIs: /v1/state_proof, /v1/transactions/{v}/proof          │
└────────────────────────────┬──────────────────────────────────┘
                             │ Merkle Root + BLS Signature
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│           Off-Chain Prover (Axiom halo2-lib v0.5.1)              │
│                                                                   │
│  ├─ Fetch auction event logs from Atomica full node             │
│  ├─ Generate ZK proof of settlement computation                 │
│  │   Circuit: ~5M constraints (1000 bids)                        │
│  │   Proving time: ~5 minutes (single-threaded)                 │
│  └─ Output: PLONK proof (5-10KB) + merkle root                  │
└────────────────────────────┬──────────────────────────────────┘
                             │ ZK Proof + Merkle Root
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              Away Chains (Ethereum, Arbitrum, Base)              │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Time Lock Contracts (Solidity)                           │   │
│  │  ├─ Verify BLS signature on Merkle root                  │   │
│  │  │   Gas: ~300K (direct) or ~280K (ZK-wrapped)            │   │
│  │  ├─ Verify ZK proof (AuctionSettlementVerifier.sol)      │   │
│  │  │   Gas: ~280K                                           │   │
│  │  └─ Enable withdrawals (Merkle proof verification)        │   │
│  │      Gas: ~50K per user                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

**Phase 1: Bid Submission**
1. User deposits assets on Ethereum → Time Lock contract
2. User signs bid with MetaMask (ECDSA signature)
3. Client encrypts bid with tlock (BLS threshold public key)
4. Encrypted bid submitted to Atomica mempool
5. Atomica validates ECDSA signature via `secp256k1.move`
6. Bid stored in encrypted mempool until auction deadline

**Phase 2: Decryption & Settlement**
1. Auction deadline reached (block height or timestamp)
2. Atomica validators publish BLS decryption shares
3. Encrypted mempool aggregates shares → decrypt bids
4. Move contract validates bids (post-decryption)
5. Auction clearing executed → Merkle root computed
6. Merkle root stored in Atomica state

**Phase 3: Cross-Chain Verification**
1. Anyone fetches state proof from Atomica full node API
2. Off-chain prover generates ZK proof of settlement computation
3. Merkle root + BLS signature submitted to Ethereum Time Lock
4. ZK proof submitted to Ethereum verifier contract
5. Both verifications pass → users can withdraw assets

---

## Critical Research Questions

### 1. BLS Threshold → IBE for tlock (BLOCKING)

**Question**: Can we repurpose Aptos BLS threshold signature infrastructure for Identity-Based Encryption (IBE) timelock?

**Background**:
- Aptos validators use BLS threshold signatures for consensus (in production since genesis)
- We need IBE-based timelock where encryption uses future "identity" (block height or timestamp)
- drand uses BLS signatures on round numbers as IBE decryption keys
- Example: drand tlock-rs v0.0.4 https://github.com/drand/tlock-rs

**Cryptographic Feasibility Investigation**:

**Research Tasks**:
1. **Literature Review**:
   - Boneh-Franklin IBE paper (2001): https://crypto.stanford.edu/~dabo/pubs/papers/bfibe.pdf
   - BLS-IBE variants and security proofs
   - drand timelock scheme analysis

2. **Aptos BLS Integration**:
   - Review `aptos-crypto/src/bls12381/bls12381_sigs.rs`
   - Can validators sign arbitrary messages (block heights) for IBE?
   - Validator incentive mechanism for publishing decryption shares
   - Liveness: What if <2/3 validators publish shares?

3. **Proof of Concept**:
   - Implement basic BLS-IBE encryption/decryption in Rust
   - Test with Aptos validator BLS keys (testnet)
   - Benchmark encryption/decryption performance
   - Security analysis: threat model for validator-based tlock

4. **Security Analysis**:
   - Can single validator decrypt early? (Should be no with threshold)
   - Validator collusion resistance (requires 2/3+ validators)
   - Liveness guarantees (depends on validator uptime)

**Alternatives if Not Feasible**:

**Option A: drand (External Timelock Service)**
- Repository: https://github.com/drand/drand
- Rust client: https://github.com/drand/tlock-rs v0.0.4
- ✅ Proven technology (used by Filecoin, Protocol Labs)
- ✅ No custom cryptography implementation
- ❌ External dependency (liveness risk if drand offline)
- ❌ Fixed 30-second rounds (less flexible auction timing)
- ❌ Additional trust assumption (League of Entropy)

**Option B: Separate Timelock Validator Set**
- Deploy separate BLS threshold network just for timelock
- Validators incentivized by auction fees
- ✅ Purpose-built for IBE timelock
- ✅ Can optimize round timing for auction schedule
- ❌ Additional infrastructure complexity
- ❌ Separate token economics and validator onboarding
- ❌ Smaller validator set = weaker security guarantees

**Decision Criteria**:
- If Aptos BLS-IBE works: Use native validators (cleanest architecture)
- If not feasible: Use drand (proven, low implementation risk)
- Avoid separate validator set (too complex for initial launch)

**Timeline**: Must resolve before core blockchain implementation phase

---

### 2. Proving Performance Optimization

**Question**: Can we achieve <5 minute proving time for 1000-bid auctions?

**Current Estimates** (based on Axiom halo2-lib benchmarks):
- 100 bids: ~1-2 minutes (single-threaded)
- 1000 bids: ~5-15 minutes (extrapolated)
- Circuit size: ~5M-10M constraints

**Optimization Approaches**:

**Hardware Acceleration**:
- **GPU Proving**: CUDA (NVIDIA) or Metal (Apple Silicon)
- Libraries: `halo2-gpu` (experimental), custom CUDA kernels
- Expected speedup: 5-10x over CPU
- Cost: $500-$2000/month for cloud GPU (AWS p3.2xlarge)

**Circuit Optimization**:
- Reduce constraints in sorting algorithm (largest bottleneck)
- Use range checks more efficiently (batch range proofs)
- Optimize Merkle tree depth (balance tree vs proof size)
- Custom gates for auction-specific operations

**Incremental Proving**:
- Prove bid validation in parallel (embarrassingly parallel)
- Aggregate individual proofs using `snark-verifier` recursion
- Tradeoff: More complex prover architecture

**Action Items**:
- [ ] Benchmark circuit on real auction data (100, 500, 1000 bids)
- [ ] Profile proving time breakdown (which gates are slow?)
- [ ] Test GPU acceleration with `halo2-gpu`
- [ ] Evaluate recursive proof aggregation overhead

---

### 3. BLS Verification on Ethereum (Gas Optimization)

**Question**: Should we verify BLS signatures directly or wrap in ZK proof?

**Option A: Direct BLS Verification**
- Uses EIP-2537 BLS12-381 precompiles (available post-Cancun)
- Gas cost: ~300,000 per signature verification
- Latency: Immediate (synchronous verification)
- Complexity: Low (direct precompile call)

**Option B: ZK-Wrapped BLS Verification**
- Verify BLS signature inside Axiom Halo2 circuit
- Generate PLONK proof of valid signature
- Gas cost: ~280,000 (slightly cheaper)
- Latency: +2-5 minutes for proof generation
- Complexity: Medium (requires off-chain prover)

**Trade-off Analysis**:
| Metric | Direct BLS | ZK-Wrapped |
|--------|------------|------------|
| Gas Cost | 300K | 280K |
| Latency | 0 | +2-5 min |
| Complexity | Low | Medium |
| Trust Assumption | EIP-2537 correct | ZK soundness |

**Recommendation**: Start with direct BLS (simpler), optimize with ZK wrapper if gas costs prohibitive at scale

---

## Implementation Phases

### Phase 0: Technology Validation

**Objective**: Confirm Aptos-core v1.37.5 and Axiom halo2-lib v0.5.1 meet all requirements

**Aptos Validation Tasks**:
- [ ] Fork aptos-core at commit `d8d4130` (v1.37.5)
- [ ] Build from source and run local testnet (5 validators)
- [ ] Verify ECDSA signature verification end-to-end
  - [ ] Sign transaction with MetaMask (secp256k1)
  - [ ] Submit to Aptos node
  - [ ] Verify execution via `secp256k1.move`
- [ ] Test account abstraction with Ethereum address mapping
  - [ ] Derive Aptos address from Ethereum pubkey
  - [ ] Create derivable account via AIP-55
- [ ] Benchmark state proof generation API
  - [ ] Generate StateProof for 1000-block span
  - [ ] Measure proof size and generation time
- [ ] **CRITICAL**: BLS-IBE timelock feasibility research
  - [ ] Literature review (Boneh-Franklin, drand)
  - [ ] Prototype IBE encryption with Aptos validator keys
  - [ ] Security analysis and threat modeling

**Axiom Validation Tasks**:
- [ ] Clone axiom-crypto/halo2-lib (pin to v0.5.1 release)
- [ ] Build example circuits (Fibonacci, ECDSA verification)
- [ ] Create simple auction circuit (10 bids, uniform price clearing)
- [ ] Generate proof and deploy verifier to Sepolia testnet
- [ ] Measure:
  - [ ] Proving time (target: <30 seconds for 10 bids)
  - [ ] Proof size (expect: 5-10KB)
  - [ ] Verification gas (expect: ~280K)
- [ ] Test BLS signature verification in circuit (optional)

**Deliverables**:
- ✅ or ❌ BLS-IBE timelock feasibility report
- Working ECDSA account abstraction demo
- Axiom circuit PoC with gas benchmarks
- Go/No-Go decision document

**Exit Criteria**:
- All technology validations pass
- BLS-IBE feasibility determined (with fallback plan if infeasible)
- Team alignment on architecture

---

### Phase 1: Core Blockchain Implementation

**Objective**: Atomica chain running with encrypted bid submission and decryption

**Infrastructure**:
- [ ] Set up GitHub repository: `atomica/atomica-chain`
- [ ] Configure CI/CD (GitHub Actions)
  - [ ] Rust build and test
  - [ ] Docker image builds
  - [ ] Automated release tagging
- [ ] Deploy testnet (5 validators, 3 full nodes)

**Encrypted Mempool Module**:
- [ ] Implement `encrypted_pool.rs`
  - [ ] Storage for encrypted transactions keyed by decryption height
  - [ ] TTL-based cleanup of expired encrypted txs
- [ ] Implement `decryption.rs`
  - [ ] Monitor block height for decryption triggers
  - [ ] Aggregate validator decryption shares
  - [ ] Submit decrypted transactions to core mempool
- [ ] Integrate with `core_mempool.rs`
  - [ ] Hook into mempool insertion path
  - [ ] Route encrypted txs to encrypted pool
  - [ ] Route plaintext txs to standard pool

**BLS Timelock Integration**:
- [ ] If BLS-IBE feasible:
  - [ ] Implement IBE encryption/decryption in `tlock` module
  - [ ] Modify validator software to publish decryption shares
  - [ ] Economic incentives for share publication
- [ ] If using drand fallback:
  - [ ] Integrate tlock-rs v0.0.4
  - [ ] Client library for bid encryption
  - [ ] Monitor drand mainnet for decryption keys

**Move Auction Contracts**:
- [ ] `auction.move`
  - [ ] Auction lifecycle (create, submit bid, close, settle)
  - [ ] Encrypted bid storage
  - [ ] Post-decryption bid validation
- [ ] `bid_registry.move`
  - [ ] Bid schema and validation rules
  - [ ] Slashing for invalid bids
- [ ] `merkle_settlement.move`
  - [ ] Compute final balances from auction clearing
  - [ ] Generate Merkle tree of balances
  - [ ] Emit MerkleRootEvent with root

**Account Abstraction**:
- [ ] Implement Ethereum wallet support
  - [ ] Sign auction transactions with MetaMask
  - [ ] Map Ethereum address → Aptos account (deterministic derivation)
- [ ] Gas sponsorship mechanism
  - [ ] Protocol wallet sponsors user transaction fees
  - [ ] Fee estimation and limits

**Milestones**:
- M1.1: Encrypted bid submission works (client → mempool)
- M1.2: Bids auto-decrypt at specified block height
- M1.3: Ethereum wallet can submit bid via ECDSA signature
- M1.4: Auction clears and emits Merkle root event

---

### Phase 2: ZK Proving Infrastructure

**Objective**: Off-chain prover service generating valid settlement proofs

**Circuit Implementation**:
- [ ] Auction settlement circuit
  - [ ] Bid validation subcircuit
  - [ ] Price sorting algorithm (in-circuit)
  - [ ] Uniform price clearing logic
  - [ ] Balance update computation
  - [ ] Merkle tree generation (Poseidon hash)
- [ ] Optimize for constraint count
  - [ ] Target: <10M constraints for 1000 bids
  - [ ] Profile and optimize hot paths

**Prover Service**:
- [ ] gRPC API for proof generation requests
- [ ] Proving/verification key management
  - [ ] Generate keys during setup
  - [ ] Cache keys for reuse
- [ ] Proof generation pipeline
  - [ ] Fetch auction event logs from Atomica
  - [ ] Witness generation from bid data
  - [ ] PLONK proof generation
  - [ ] Proof serialization and storage
- [ ] Optional: GPU acceleration
  - [ ] Integrate `halo2-gpu` if available
  - [ ] Benchmark speedup vs CPU

**Solidity Verifier Deployment**:
- [ ] Generate verifier contract with Axiom tooling
- [ ] Deploy to Sepolia testnet
- [ ] Test proof verification on-chain
- [ ] Measure gas costs (expect ~280K)

**Performance Testing**:
- [ ] Benchmark proving time for various bid counts
  - [ ] 10 bids: <30 seconds
  - [ ] 100 bids: <2 minutes
  - [ ] 1000 bids: <10 minutes (target)
- [ ] Load testing (concurrent proof generation)
- [ ] Failure handling (proof generation timeout, retry logic)

**Milestones**:
- M2.1: Settlement circuit works for 100 bids
- M2.2: Prover service generates proofs in <10 minutes
- M2.3: Solidity verifier validates proofs on Sepolia
- M2.4: End-to-end: Atomica auction → ZK proof → Ethereum verification

---

### Phase 3: Away Chain Integration (Ethereum)

**Objective**: Ethereum users can deposit, participate in auctions, and withdraw

**Time Lock Contracts (Solidity)**:
- [ ] Implement `TimeLock.sol`
  - [ ] Deposit function (lock ETH/ERC20 for auction)
  - [ ] Validator set storage and updates
  - [ ] BLS signature verification (EIP-2537 or ZK-wrapped)
  - [ ] Merkle root submission with BLS proof
  - [ ] Withdrawal with Merkle proof
- [ ] Gas sponsorship for proof submissions
  - [ ] Contract-funded gas pool
  - [ ] Reward mechanism for submitters
- [ ] Deploy to Sepolia testnet

**Validator Set Synchronization**:
- [ ] Initial validator set bootstrap
  - [ ] Genesis validators hardcoded in contract
  - [ ] Or: Submit initial EpochChangeProof
- [ ] Epoch change updates
  - [ ] Monitor Atomica for epoch changes
  - [ ] Generate EpochChangeProof
  - [ ] Submit to Ethereum Time Lock contract

**Proof Submission Pipeline**:
- [ ] Auction completion detector (monitors Atomica events)
- [ ] Merkle root submission
  - [ ] Fetch StateProof from Atomica full node
  - [ ] Extract Merkle root and BLS signature
  - [ ] Submit to Ethereum Time Lock contract
- [ ] ZK proof submission
  - [ ] Request proof from prover service
  - [ ] Submit to AuctionSettlementVerifier.sol

**User Withdrawal Flow**:
- [ ] Client library for Merkle proof generation
  - [ ] Query final balances from Atomica
  - [ ] Generate Merkle branch proof
- [ ] Withdrawal UI (dApp)
  - [ ] Connect MetaMask
  - [ ] Display auction results
  - [ ] Submit withdrawal transaction

**L2 Deployment** (Arbitrum, Base, Optimism):
- [ ] Deploy Time Lock contracts to L2s
- [ ] Test gas costs (expect 10x cheaper than L1)
- [ ] Validator set synchronization (same as L1)

**Milestones**:
- M3.1: Ethereum deposit locks assets in Time Lock contract
- M3.2: Merkle root submitted and BLS-verified on Ethereum
- M3.3: ZK proof submitted and verified
- M3.4: User withdraws assets using Merkle proof

---

### Phase 4: End-to-End Testing

**Objective**: Full auction lifecycle working cross-chain with comprehensive test coverage

**Test Scenarios**:

1. **Happy Path**:
   - 100 users deposit on Ethereum
   - Users submit bids (sealed with tlock)
   - Auction closes, bids decrypt
   - Settlement computed, Merkle root generated
   - Proofs submitted to Ethereum
   - Users withdraw final balances

2. **Invalid Bids**:
   - Users submit malformed bids
   - Post-decryption validation catches invalid bids
   - Deposits slashed for invalid bidders
   - Valid bidders unaffected

3. **Validator Rotation**:
   - Epoch change on Atomica
   - Validator set updated on Ethereum
   - Auction continues with new validator set
   - Proofs verify correctly

4. **High Load**:
   - 1000 concurrent bids submitted
   - Prover handles load (parallel proof generation if needed)
   - Ethereum verifier handles proof submission

5. **Edge Cases**:
   - Auction with zero valid bids (all refunded)
   - Auction with all identical bids (tie-breaking)
   - Partial fill (supply < demand)
   - User withdraws multiple times (idempotency)

**Performance Benchmarks**:
- [ ] Auction latency (bid submission → settlement → withdrawal)
- [ ] Gas costs per auction (L1 vs L2)
- [ ] Prover throughput (auctions/day)
- [ ] Mempool capacity (max concurrent encrypted txs)

**Security Testing**:
- [ ] Penetration testing of dApp frontend
- [ ] Smart contract fuzzing (Echidna, Foundry)
- [ ] Validator collusion simulations
- [ ] MEV analysis (can validators extract value?)

**Milestones**:
- M4.1: 100 successful end-to-end auctions on testnet
- M4.2: All edge cases handled correctly
- M4.3: Security audit initiated (Trail of Bits, Zellic, or similar)
- M4.4: Mainnet deployment plan finalized

---

## Appendix: Known Issues & Workarounds

### Aptos-core v1.37.5

**No Known Critical Issues** as of December 2024.

**Monitor**:
- Aptos GitHub security advisories: https://github.com/aptos-labs/aptos-core/security/advisories
- Discord #mainnet-announcements: https://discord.gg/aptosnetwork

**Potential Future Issues**:
- BLS signature verification performance (if validator set grows to 500+)
- Mempool spam (mitigated by transaction fees and reputation)

### Axiom halo2-lib v0.5.1

**Known Limitations**:
- GPU acceleration experimental (may require custom CUDA kernels)
- Proof size non-deterministic (varies slightly with circuit complexity)
- Learning curve steep (requires understanding of PLONK internals)

**Workarounds**:
- Use v0.4.1 (Axiom Mainnet V2 version) if v0.5.1 has regressions
- Extensive use of examples from https://github.com/axiom-crypto/halo2-lib/tree/main/halo2-base/benches

---

## Appendix: Upgrade Path

### Merging Upstream Aptos Changes

**Quarterly Security Patch Review**:
```bash
cd atomica-chain
git fetch upstream

# Review security-related commits
git log upstream/main --since="3 months ago" --grep="security\|CVE\|vulnerability" --oneline

# Cherry-pick critical fixes
git cherry-pick <commit-hash>
```

**Major Version Upgrades** (e.g., v1.37.5 → v1.50.0):
1. Create feature branch: `atomica/upgrade-to-v1.50`
2. Merge upstream changes: `git merge upstream/aptos-node-v1.50.0`
3. Resolve conflicts (focus on custom modules)
4. Test on devnet (all auctions work)
5. Deploy to testnet (soak test for 2 weeks)
6. Mainnet upgrade (coordinate with validators)

**Breaking Changes to Monitor**:
- Move framework changes (may break auction contracts)
- Consensus protocol changes (may affect BLS timelock)
- API changes (state proof endpoints)

---

## Decision Summary

### Selected Technologies

**Blockchain Foundation**:
- **Vendor**: Aptos Labs
- **Version**: aptos-core v1.37.5
- **Commit**: d8d4130fbb16443ac76db7a8ad0b2d54466f6ba0
- **Release Date**: November 24, 2024
- **Release Notes**: https://github.com/aptos-labs/aptos-core/releases/tag/aptos-node-v1.37.5
- **License**: Apache 2.0

**ZK Proof System**:
- **Vendor**: Axiom
- **Technology**: Halo2 (PLONK) + KZG commitments
- **Version**: halo2-lib v0.5.1
- **Release Date**: October 2024
- **Repository**: https://github.com/axiom-crypto/halo2-lib
- **Audit Status**: ✅ Audited from v0.3.0+ (Spearbit, Trail of Bits)
- **License**: MIT / Apache 2.0

**Critical Path Dependencies**:
1. 🔬 **BLS-IBE timelock feasibility** (must resolve in Phase 0)
2. 🔨 **Encrypted mempool implementation** (custom module)
3. 🔨 **Auction settlement circuit** (Axiom halo2-lib)

**Fallback Options**:
- If BLS-IBE infeasible: Use drand (https://github.com/drand/tlock-rs v0.0.4)
- If Axiom proving too slow: Evaluate SP1 (https://github.com/succinctlabs/sp1)
- If Ethereum gas too high: Prioritize L2 deployment (Arbitrum, Base)

---

**Next Actions**:

1. **Immediate**:
   - [ ] Fork aptos-core at commit `d8d4130`
   - [ ] Clone halo2-lib at v0.5.1 tag
   - [ ] Set up development environment (Rust 1.79.0)

2. **Phase 0 (Technology Validation)**:
   - [ ] BLS-IBE timelock research (CRITICAL)
   - [ ] ECDSA account abstraction PoC
   - [ ] Simple Axiom auction circuit PoC

3. **Go/No-Go Decision**:
   - [ ] Review feasibility of BLS-IBE (with fallback)
   - [ ] Validate all technology selections
   - [ ] Proceed to Phase 1 or pivot

---

**Status**: Draft - Pending Phase 0 Technology Validation
**Review Date**: TBD (after initial research sprint)
**Decision Authority**: Technical Architecture Team
