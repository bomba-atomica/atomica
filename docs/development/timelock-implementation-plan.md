# Timelock Encryption Implementation Plan

**Document Type**: Technical Implementation Roadmap
**Last Updated**: 2025-12-22
**Status**: Planning Phase
**Target**: Risk #2 - Implement Timelock Encryption End-to-End

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Review](#architecture-review)
3. [Current State Assessment](#current-state-assessment)
4. [Phase 1: Confirm zapatos Functionality](#phase-1-confirm-zapatos-functionality-2-3-weeks)
5. [Phase 2: atomica-move-contracts Integration](#phase-2-atomica-move-contracts-integration-3-4-weeks)
6. [Phase 3: atomica-web Frontend Integration](#phase-3-atomica-web-frontend-integration-2-3-weeks)
7. [Testing Strategy](#testing-strategy)
8. [Success Criteria](#success-criteria)
9. [Risk Mitigation](#risk-mitigation)

---

## Executive Summary

### Objective

Implement N-layer "Onion" timelock encryption for sealed bids and reserve prices in Atomica auctions, spanning work across:
- **zapatos**: Low-level cryptographic primitives and multi-layer encryption framework
- **atomica-move-contracts**: On-chain auction logic with configurable layer composition
- **atomica-web**: Client-side encryption library supporting arbitrary layer configurations

### Timeline

- **Phase 1** (zapatos testnet validation): 2-3 weeks
- **Phase 2** (Move contracts): 3-4 weeks
- **Phase 3** (Web frontend): 2-3 weeks
- **Total**: 7-10 weeks

### Current Status

✅ **Completed**:
- BLS12-381 DKG infrastructure in zapatos
- Timelock IBE proof-of-concept
- N-layer onion encryption design (see `/docs/design/timelock-seller-stake-dkg.md`)

🟡 **In Progress**:
- Comprehensive testing and validation
- Integration across repositories

---

## Architecture Review

### N-Layer "Onion" Encryption

**Generalized Multi-Layer Architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│  PLAINTEXT BID                                                   │
│  { bidder: 0x123..., price: 1500, quantity: 10 }               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Encrypt with Layer N (Innermost)
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER N CIPHERTEXT                                              │
│  Encrypt_N(PK_N, plaintext)                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Encrypt with Layer N-1
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER N-1 CIPHERTEXT                                            │
│  Encrypt_{N-1}(PK_{N-1}, ciphertext_N)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ⋮  (Additional layers as configured)
                         │
                         │ Encrypt with Layer 1 (Outermost)
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 CIPHERTEXT (Submitted on-chain)                        │
│  Encrypt_1(PK_1, ciphertext_2)                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Configuration Examples**:

**Example 1: Dual-Layer (Validators + Sellers)**
```
Layer 1 (Outer): Atomica Validators (IBE/BIBE, >67% threshold)
Layer 2 (Inner): Auction Sellers (ElGamal, >33% stake threshold)
```

**Example 2: Dual-Layer (Validators + Drand)**
```
Layer 1 (Outer): Atomica Validators (IBE/BIBE, >67% threshold)
Layer 2 (Inner): Drand Timelock (tlock, public beacon)
```

**Example 3: Triple-Layer (Validators + Drand + Sellers)**
```
Layer 1 (Outer): Atomica Validators (IBE/BIBE, >67% threshold)
Layer 2 (Middle): Drand Timelock (tlock, public beacon)
Layer 3 (Inner): Auction Sellers (ElGamal, >33% stake threshold)
```

**Security Property**: Attacker must compromise ALL N layers to decrypt early. Each layer is independently secured by different key providers.

### Component Responsibilities

**zapatos (Rust Crate `aptos-dkg`)**:
- N-layer onion encryption framework (pluggable key providers)
- BLS12-381 threshold DKG (for validator and seller layers)
- PVSS (Publicly Verifiable Secret Sharing)
- ElGamal encryption/decryption on G1
- IBE/BIBE encryption/decryption
- Drand tlock integration (optional layer)
- Low-level cryptographic primitives

**atomica-move-contracts (Move)**:
- Auction state management with configurable layer composition
- Layer provider registration and coordination
- DKG coordination for seller group (when used as a layer)
- Encrypted bid/reserve price storage (N-layer ciphertexts)
- Sequential decryption share aggregation (outer → inner)
- Invalid bid slashing logic
- Scuttle Reward mechanism

**atomica-web (TypeScript + WASM)**:
- Client-side encryption library
- Transaction payload construction
- MetaMask integration
- Bid/reserve price UI
- Decryption status monitoring

---

## Current State Assessment

### zapatos Repository

#### Completed Infrastructure

**Location**: `/source/zapatos/crates/aptos-dkg/`

✅ **DKG Implementation** (`src/pvss/`):
- `weighted/mod.rs` - Weighted threshold DKG
- `das/weighted_protocol.rs` - Distributed key generation protocol
- `contribution.rs` - DKG contribution handling
- `dealt_pub_key.rs` - Public key reconstruction
- `dealt_secret_key.rs` - Secret key reconstruction

✅ **Encryption Primitives** (`src/pvss/`):
- `encryption_elgamal.rs` - ElGamal encryption on BLS12-381 G1
- `encryption_dlog.rs` - Discrete log encryption
- `schnorr.rs` - Schnorr proofs for shares

✅ **IBE Proof of Concept** (`tests/tlock_poc.rs`):
- Boneh-Franklin IBE implementation
- Encryption: `C = <rG2, M ⊕ H(e(Q_ID, MPK)^r)>`
- Decryption: `M = V ⊕ H(e(d_ID, U))`
- Uses `blstrs` for pairing operations

✅ **Move Integration** (`/source/zapatos/aptos-move/framework/aptos-framework/sources/`):
- `dkg.move` - On-chain DKG state management
- `timelock.move` - Timelock interval rotation
- `aptos-stdlib/sources/cryptography/bls12381.move` - BLS signature primitives

#### Known Gaps

**Testing Coverage**:
- ❌ No local testnet validation with real validators
- ❌ No end-to-end timelock encryption/decryption tests
- ❌ No multi-layer integration testing
- ❌ No threshold boundary validation on real network

**Missing Features**:
- ❌ N-layer onion encryption framework
- ❌ Pluggable key provider interface
- ❌ Layer composition configuration
- ❌ Session key derivation for hardware wallets
- ❌ Production-ready IBE implementation (POC only)
- ❌ Drand tlock integration (optional)
- ❌ Serialization formats for N-layer ciphertexts

### atomica-move-contracts Repository

#### Existing Contracts

**Location**: `/source/atomica-move-contracts/sources/`

✅ **Basic Infrastructure**:
- `registry.move` - Asset registry
- `fake_eth.move`, `fake_usd.move` - Test tokens

#### Required Contracts (Not Yet Implemented)

**Auction Core**:
- ❌ `auction.move` - Auction lifecycle management with layer config
- ❌ `sealed_bid.move` - N-layer encrypted bid storage and validation
- ❌ `layer_provider.move` - Key provider registration and interface
- ❌ `seller_dkg.move` - Seller group key generation (when used as layer)
- ❌ `validator_timelock.move` - Validator timelock layer
- ❌ `drand_integration.move` - Drand tlock layer (optional)
- ❌ `decryption.move` - Sequential multi-layer share aggregation

**Security**:
- ❌ `slashing.move` - Invalid bid deposit forfeiture
- ❌ `scuttle_reward.move` - Early decryption bounty mechanism

### atomica-web Repository

#### Existing Infrastructure

**Location**: `/source/atomica-web/`

✅ **Basic Web Stack**:
- React/TypeScript frontend
- Aptos SDK integration
- MetaMask wallet connection

#### Required Features (Not Yet Implemented)

**Encryption Library**:
- ❌ WASM wrapper for `aptos-dkg` Rust code
- ❌ TypeScript client library for encryption
- ❌ Key derivation from MetaMask signatures

**UI Components**:
- ❌ Bid submission form with encryption
- ❌ Reserve price form with encryption
- ❌ Transaction status monitoring
- ❌ Decryption countdown timer

---

## Phase 1: Confirm zapatos Functionality (2-3 weeks)

### Objective

Validate that the existing `aptos-dkg` crate and zapatos validator infrastructure can produce timelock key material and perform encryption/decryption in a real network environment using Docker-based E2E tests.

### Task Breakdown

#### 1.1 Docker Build Infrastructure (Week 1)

**Goal**: Set up Docker build system to compile binaries from local zapatos source

**Strategy**: Reuse zapatos build infrastructure (`docker/builder/`) but build from local source instead of pulling from registries.

**Tasks**:
- [ ] Create `docker-testnet` directory structure
  - Location: `/source/zapatos/docker-testnet/`
  - Files to create:
    - `Makefile` - Build and management commands
    - `docker-compose.yaml` - Multi-validator testnet definition
    - `.env` - Image configuration (will use locally-built images)
    - `validator-config.yaml` - Validator node configuration
    - `README.md` - Setup and usage instructions

- [ ] Create build scripts for test images
  - Location: `/source/zapatos/docker-testnet/build.sh`
  - Script responsibilities:
    ```bash
    #!/bin/bash
    # Build validator images from local zapatos source
    set -e

    echo "Building aptos-node binary from local source..."
    cd ../
    docker/builder/docker-bake-rust-all.sh validator

    # Tag for local use
    docker tag aptos/validator:devnet zapatos-testnet/validator:local
    ```
  - Leverages existing `docker/builder/` infrastructure
  - Builds `aptos-node` binary with local modifications
  - Tags images as `zapatos-testnet/validator:local`

- [ ] Create docker-compose configuration for multi-validator testnet
  - File: `/source/zapatos/docker-testnet/docker-compose.yaml`
  - Configuration:
    - 4 validator nodes (validator-0, validator-1, validator-2, validator-3)
    - Each runs `aptos-node --test` in independent mode
    - Shared genesis volume for coordination
    - Exposed ports for API and metrics
    - Healthchecks for startup synchronization
  - Example structure:
    ```yaml
    version: "3.8"
    services:
      validator-0:
        image: zapatos-testnet/validator:local
        container_name: zapatos-validator-0
        command: >
          /usr/local/bin/aptos-node
          --test
          --test-dir /opt/aptos/var
        ports:
          - "8080:8080"  # REST API
        networks:
          - zapatos-testnet

      validator-1:
        image: zapatos-testnet/validator:local
        # ... similar config

      # validator-2, validator-3 ...
    ```

- [ ] Configure shorter timelock intervals for testing
  - Modify validator config to use 30-second epochs instead of 1 hour
  - File: `/source/zapatos/docker-testnet/validator-config.yaml`
  - Configuration:
    ```yaml
    execution:
      genesis_file_location: "/opt/aptos/var/genesis.blob"

    consensus:
      # Short epochs for testing timelock rotation
      round_initial_timeout_ms: 1500
      quorum_store_poll_count: 10

    # Timelock-specific config
    timelock:
      epoch_duration_secs: 30  # 30 seconds instead of 3600
    ```

**Success Criteria**:
- ✅ `build.sh` successfully compiles binaries from local zapatos source
- ✅ Docker images tagged as `zapatos-testnet/validator:local`
- ✅ `docker-compose up` starts 4 validators successfully
- ✅ All validators reach healthy state within 60 seconds
- ✅ REST APIs accessible on ports 8080-8083

**Deliverable**: Docker-based 4-validator testnet running locally-built binaries

---

#### 1.2 Test Harness Implementation (Week 1)

**Goal**: Create Rust test harness to manage Docker testnet lifecycle

**Pattern**: Copy strategy from `/Users/lucas/code/rust/zap/tests/docker_harness/mod.rs`

**Tasks**:
- [ ] Create test harness module
  - Location: `/source/zapatos/testsuite/timelock-e2e/tests/docker_harness/mod.rs`
  - Module responsibilities:
    - Start/stop Docker containers
    - Wait for validators to become healthy
    - Discover validator endpoints and peer IDs
    - Automatic cleanup on test completion
  - Key API:
    ```rust
    pub struct DockerTestnet {
        compose_dir: String,
        validator_urls: Vec<String>,
    }

    impl DockerTestnet {
        pub async fn new(num_validators: usize) -> anyhow::Result<Self>;
        pub fn validator_api_url(&self, index: usize) -> &str;
        pub async fn wait_for_healthy(&self, timeout_secs: u64) -> anyhow::Result<()>;
    }

    impl Drop for DockerTestnet {
        fn drop(&mut self) {
            // docker-compose down --remove-orphans -v
        }
    }
    ```

- [ ] Implement validator discovery
  - Parse docker logs to find validator endpoints
  - Extract BLS public keys from on-chain state
  - Query `0x1::dkg::DKGState` for group public key
  - Store validator metadata for test use

- [ ] Add healthcheck helpers
  - TCP connection tests (API ports)
  - HTTP GET requests to `/v1` endpoint
  - DKG state verification (group key published)
  - Retry logic with exponential backoff

**Success Criteria**:
- ✅ Test harness starts/stops Docker testnet reliably
- ✅ Cleanup happens even on test panic
- ✅ Validator URLs and keys discoverable
- ✅ Healthchecks accurately detect readiness

**Deliverable**: `DockerTestnet` test harness module

---

#### 1.3 Timelock E2E Test Suite (Week 1-2)

**Goal**: Validate timelock key generation and encryption/decryption using real validator network

**Tasks**:
- [ ] Create E2E test crate
  - Location: `/source/zapatos/testsuite/timelock-e2e/`
  - Crate structure:
    ```
    timelock-e2e/
    ├── Cargo.toml
    ├── tests/
    │   ├── docker_harness/
    │   │   └── mod.rs
    │   ├── timelock_basic.rs
    │   ├── timelock_threshold.rs
    │   └── timelock_rotation.rs
    └── README.md
    ```

- [ ] Test: Basic timelock encryption/decryption
  - File: `tests/timelock_basic.rs`
  - Test workflow:
    ```rust
    #[tokio::test]
    #[serial]  // Run sequentially to avoid port conflicts
    async fn test_validator_timelock_basic() {
        let testnet = DockerTestnet::new(4).await?;

        // 1. Query validator group public key
        let group_pk = testnet.get_validator_group_pubkey().await?;

        // 2. Encrypt plaintext using IBE
        let plaintext = b"test bid data";
        let auction_end_time = current_time() + 30; // 30 seconds
        let ciphertext = encrypt_ibe(plaintext, &group_pk, auction_end_time)?;

        // 3. Submit encrypted payload on-chain
        testnet.submit_encrypted_payload(&ciphertext).await?;

        // 4. Wait for timelock to expire
        sleep(Duration::from_secs(35)).await;

        // 5. Query decryption shares from validators
        let shares = testnet.get_decryption_shares().await?;

        // 6. Aggregate shares and decrypt
        let decrypted = aggregate_and_decrypt(&ciphertext, &shares)?;

        // 7. Verify plaintext matches
        assert_eq!(decrypted, plaintext);
    }
    ```

- [ ] Test: Threshold enforcement
  - File: `tests/timelock_threshold.rs`
  - Test scenarios:
    - 3 of 4 validators provide shares (75% > 67%) → decrypt succeeds
    - 2 of 4 validators provide shares (50% < 67%) → decrypt fails
    - Manually stop validators to simulate non-participation
    - Verify threshold requirement enforced

- [ ] Test: Timelock rotation across epochs
  - File: `tests/timelock_rotation.rs`
  - Test workflow:
    - Encrypt payload for epoch N
    - Wait for epoch N+1 transition (DKG rotation)
    - Verify epoch N payload still decryptable
    - Encrypt new payload for epoch N+1
    - Verify both payloads decrypt with correct keys

**Success Criteria**:
- ✅ Basic encryption/decryption works end-to-end
- ✅ Threshold enforcement tested (67% boundary)
- ✅ Epoch rotation doesn't break previous payloads
- ✅ Tests pass consistently (no flakiness)

**How to Run**:
```bash
# Build Docker images first
cd /source/zapatos/docker-testnet
./build.sh

# Run E2E tests (sequential, Docker required)
cd /source/zapatos/testsuite/timelock-e2e
cargo test -- --test-threads=1 --nocapture
```

**Deliverable**: Passing E2E test suite for validator timelock

---

#### 1.2 N-Layer Onion Encryption Framework (Week 1-2)

**Goal**: Implement production-ready N-layer onion encryption framework with pluggable key providers

**Tasks**:
- [ ] Create `onion_encryption` module
  - Location: `/source/zapatos/crates/aptos-dkg/src/onion/mod.rs`
  - Core abstraction:
    ```rust
    // Pluggable key provider trait
    pub trait LayerProvider {
        fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>>;
        fn decrypt(&self, ciphertext: &[u8], proof: &DecryptionProof) -> Result<Vec<u8>>;
        fn get_public_key(&self) -> PublicKey;
    }

    // Concrete implementations
    pub struct ValidatorLayer { /* IBE/BIBE params */ }
    pub struct SellerLayer { /* ElGamal DKG params */ }
    pub struct DrandLayer { /* tlock params */ }

    // N-layer onion API
    pub fn encrypt_onion(
        plaintext: &[u8],
        layers: &[Box<dyn LayerProvider>], // Ordered: innermost first
    ) -> OnionCiphertext;

    pub fn decrypt_layer(
        ciphertext: &LayerCiphertext,
        layer: &dyn LayerProvider,
        proof: &DecryptionProof,
    ) -> Result<Vec<u8>>; // Returns next layer ciphertext or plaintext
    ```

- [ ] Implement layer provider implementations
  - `ValidatorLayer`: IBE/BIBE using BLS12-381, time-based identity
  - `SellerLayer`: ElGamal threshold encryption with DKG
  - `DrandLayer` (optional): Drand tlock integration
  - Each provider is self-contained with key generation orthogonal to onion

- [ ] Implement layer composition and ordering
  - Configuration struct for layer ordering
  - Validation: ensure compatible encryption schemes
  - Example configs: `[Validator, Seller]`, `[Validator, Drand]`, `[Validator, Drand, Seller]`

- [ ] Implement serialization formats
  - Use `serde` for Rust-side serialization
  - Define JSON schema for web frontend compatibility
  - Store layer metadata: provider type, public keys, order
  - Add `to_bytes()` / `from_bytes()` for on-chain storage

- [ ] Write unit tests for N-layer encryption
  - File: `/source/zapatos/crates/aptos-dkg/tests/onion_encryption.rs`
  - Test cases:
    - Encrypt → Decrypt (1 layer, 2 layers, 3 layers)
    - Decrypt partial layers (should not reveal plaintext)
    - Different layer orderings produce different ciphertexts
    - Invalid decryption proof rejected at each layer
    - Layer provider interface compliance

**Success Criteria**:
- ✅ Encryption/decryption round-trip preserves data (all layer configs)
- ✅ Partial decryption does not leak plaintext
- ✅ Ciphertext size scales linearly with layers (<200 bytes per layer)
- ✅ Encryption takes <100ms per layer on client hardware
- ✅ Layer providers can be added without modifying core onion logic

**Deliverable**: `aptos-dkg` v0.2.0 with N-layer onion encryption framework

---

#### 1.3 Multi-Layer Testing on Local Testnet (Week 2)

**Goal**: Validate N-layer onion encryption works with real validator infrastructure

**Tasks**:
- [ ] Create smoke test for dual-layer encryption
  - File: `/source/zapatos/testsuite/smoke-test/src/timelock_dual_layer.rs`
  - Set up SwarmBuilder with 4 validators
  - Simulate seller DKG in Rust test code (3-5 mock sellers using `aptos-dkg` crate)
  - Encrypt: Plaintext → Seller layer → Validator layer → Onion ciphertext
  - Decrypt Layer 1: Get validator shares from swarm → Inner ciphertext revealed
  - Decrypt Layer 2: Use mock seller keys → Plaintext revealed
  - Validate: Sequential decryption produces correct plaintext

- [ ] Test threshold enforcement across layers
  - Layer 1 (Validators): Use `swarm.validators().take(2)` (50%) → decrypt fails
  - Layer 1 (Validators): Use `swarm.validators().take(3)` (75%) → decrypt succeeds
  - Layer 2 (Mock Sellers): Provide 1 of 3 shares (33%) → decrypt fails
  - Layer 2 (Mock Sellers): Provide 2 of 3 shares (67%) → decrypt succeeds
  - Validate: Each layer enforces its own threshold independently

- [ ] Test invalid share rejection
  - Submit malformed decryption share from validator (corrupt bytes)
  - Submit invalid seller DKG share (wrong key)
  - Expected: `aptos-dkg` crate rejects shares, returns error
  - Validate: Share verification works for each layer type

- [ ] Test layer ordering enforcement
  - Attempt to decrypt inner layer before outer layer
  - Expected: Cryptographically impossible (lacks input ciphertext)
  - Validate: Cannot skip layers (enforced by encryption scheme)

**Success Criteria**:
- ✅ Dual-layer encryption/decryption works end-to-end
- ✅ Each layer's threshold enforced independently
- ✅ Invalid shares detected and rejected
- ✅ Layer ordering enforced (cannot skip)
- ✅ Smoke test passes: `cargo test test_dual_layer_timelock`

**How to Run**:
```bash
cd /source/zapatos/testsuite/smoke-test
cargo test test_dual_layer_timelock -- --nocapture
```

**Deliverable**: Passing smoke test demonstrating N-layer onion encryption

---

#### 1.4 Basic Performance Validation (Week 2-3)

**Goal**: Ensure acceptable performance on local testnet

**Tasks**:
- [ ] Benchmark encryption operations (client-side)
  - Measure: Time to encrypt with 1 layer (validator only)
  - Measure: Time to encrypt with 2 layers (validator + seller)
  - Measure: Time to encrypt with 3 layers (validator + drand + seller)
  - Target: <200ms per layer on typical laptop
  - Tool: Rust `criterion` benchmarks

- [ ] Benchmark decryption operations (on testnet)
  - Measure: Time for 4 validators to publish shares
  - Measure: Time to aggregate validator shares
  - Measure: End-to-end decryption latency (from interval trigger to plaintext)
  - Target: <10 seconds for single-layer decryption

- [ ] Measure ciphertext sizes
  - Measure: Size of 1-layer onion ciphertext
  - Measure: Size of 2-layer onion ciphertext
  - Measure: Size of 3-layer onion ciphertext
  - Validate: Linear scaling (<500 bytes per layer for typical bid)

- [ ] Profile testnet resource usage
  - Measure: Validator node CPU usage during timelock operations
  - Measure: Validator node memory usage
  - Measure: Network bandwidth for share distribution
  - Target: Reasonable resource consumption on local machine

**Success Criteria**:
- ✅ Client-side encryption: <200ms per layer
- ✅ Testnet decryption: <10 seconds end-to-end
- ✅ Ciphertext size: <500 bytes per layer
- ✅ Testnet runs stably on local machine (4+ validators)

**Deliverable**: Performance measurements from local testnet

---

#### 1.5 Documentation and Examples (Week 3)

**Tasks**:
- [ ] Write API documentation for N-layer encryption
  - Location: `/source/zapatos/crates/aptos-dkg/README.md`
  - Include: Architecture diagram, usage examples, layer provider guide
  - Document: How to add new layer providers

- [ ] Create end-to-end example
  - File: `/source/zapatos/crates/aptos-dkg/examples/auction_encryption.rs`
  - Demonstrate: Full auction flow with N-layer encryption/decryption
  - Show: Different layer configurations (1-layer, 2-layer, 3-layer)

- [ ] Document local testnet setup
  - Location: `/source/zapatos/testsuite/smoke-test/README.md`
  - Include: Step-by-step setup instructions
  - Document: How to run timelock encryption tests
  - Troubleshooting guide for common issues

- [ ] Document integration points for Move contracts
  - Specify: Serialization formats for N-layer ciphertexts
  - Document: Layer configuration data structures
  - Specify: Share submission and aggregation interfaces

**Deliverable**: Comprehensive documentation for `aptos-dkg` library and local testnet setup

---

## Phase 2: atomica-move-contracts Integration (3-4 weeks)

### Objective

Implement core auction contract with N-layer encryption support: define encryption layers at auction start, accept encrypted submissions, post decryption keys after timelock, and verify decryption on-chain.

### Task Breakdown

#### 2.1 Auction Creation with Encryption Configuration (Week 1)

**Goal**: Define encryption key material and onion layers when auction starts

**Tasks**:
- [ ] Create `auction.move` contract with encryption layer configuration
  - Location: `/source/atomica-move-contracts/sources/auction.move`
  - Core data structures:
    ```move
    module atomica::auction {
        /// Encryption layer definition
        struct EncryptionLayer has copy, drop, store {
            layer_index: u8,        // 0 = outermost, N-1 = innermost
            provider_type: u8,       // 1=Validator, 2=Seller, 3=Drand
            public_key: vector<u8>,  // Encryption public key for this layer
            timelock_end: u64,       // When this layer can be decrypted (microseconds)
        }

        /// Auction configuration
        struct Auction has key, store {
            auction_id: u64,
            creator: address,
            base_asset: TypeInfo,
            quote_asset: TypeInfo,

            // Encryption configuration
            encryption_layers: vector<EncryptionLayer>, // Ordered: outermost first

            // Timing
            bid_deadline: u64,      // When bidding closes
            decrypt_deadline: u64,  // When all decryption keys must be posted

            // State
            status: u8,             // 0=Open, 1=Closed, 2=Decrypting, 3=Cleared
        }

        /// Create auction with encryption layer configuration
        public entry fun create_auction(
            creator: &signer,
            base_asset: TypeInfo,
            quote_asset: TypeInfo,
            encryption_layers: vector<EncryptionLayer>,
            bid_deadline: u64,
            decrypt_deadline: u64,
        );

        /// Query encryption configuration for client-side encryption
        #[view]
        public fun get_encryption_layers(auction_id: u64): vector<EncryptionLayer>;
    }
    ```

- [ ] Implement auction creation logic
  - Validate: Encryption layers are well-formed (public keys, deadlines)
  - Validate: Layer ordering (outermost layer 0 to innermost layer N-1)
  - Validate: Timelock deadlines are after bid deadline
  - Store: Auction metadata with encryption configuration
  - Emit: AuctionCreated event with encryption layer details

- [ ] Write unit tests
  - File: `/source/atomica-move-contracts/sources/auction_tests.move`
  - Test cases:
    - Create auction with 1 layer (validator only)
    - Create auction with 2 layers (validator + seller)
    - Create auction with 3 layers (validator + drand + seller)
    - Reject invalid layer configurations
    - Query encryption layers for client use

**Success Criteria**:
- ✅ Auction creation stores N-layer encryption config
- ✅ Encryption layers queryable by clients
- ✅ Layer validation prevents misconfiguration
- ✅ All tests pass

**Deliverable**: `auction.move` contract with encryption layer configuration

---

#### 2.2 Encrypted Bid Submission (Week 1-2)

**Goal**: Accept and store encrypted reserve prices and bids

**Tasks**:
- [ ] Add encrypted submission storage to `auction.move`
  - Data structures:
    ```move
    module atomica::auction {
        /// N-layer encrypted payload
        struct EncryptedPayload has copy, drop, store {
            ciphertext: vector<u8>,     // Onion-encrypted data
            layer_count: u8,             // Number of encryption layers
            submitter: address,          // Who submitted this
            timestamp: u64,              // When submitted
        }

        /// Encrypted bid
        struct EncryptedBid has store {
            bid_id: u64,
            payload: EncryptedPayload,
            deposit_amount: u64,         // Collateral posted
        }

        /// Encrypted reserve price
        struct EncryptedReserve has store {
            reserve_id: u64,
            seller: address,
            payload: EncryptedPayload,
            asset_amount: u64,           // Units being sold
        }

        /// Storage for auction submissions
        struct AuctionSubmissions has key, store {
            auction_id: u64,
            bids: vector<EncryptedBid>,
            reserves: vector<EncryptedReserve>,
        }

        /// Submit encrypted bid
        public entry fun submit_bid(
            bidder: &signer,
            auction_id: u64,
            encrypted_bid: vector<u8>,   // N-layer onion ciphertext
            deposit_amount: u64,
        );

        /// Submit encrypted reserve price
        public entry fun submit_reserve_price(
            seller: &signer,
            auction_id: u64,
            encrypted_reserve: vector<u8>, // N-layer onion ciphertext
            asset_amount: u64,
        );
    }
    ```

- [ ] Implement submission validation
  - Check: Auction is still open (before bid_deadline)
  - Check: No duplicate submissions from same address
  - Check: Ciphertext is non-empty and reasonable size (<10KB)
  - Store: Encrypted payload with metadata
  - Emit: BidSubmitted / ReserveSubmitted events

- [ ] Write unit tests
  - Test cases:
    - Submit valid encrypted bid
    - Submit valid encrypted reserve price
    - Reject bid after deadline
    - Reject duplicate bid from same address
    - Reject oversized ciphertext

**Success Criteria**:
- ✅ Encrypted bids stored on-chain
- ✅ Encrypted reserve prices stored on-chain
- ✅ Submission validation works
- ✅ All tests pass

**Deliverable**: Encrypted submission handling in `auction.move`

---

#### 2.3 Decryption Key Posting (Week 2)

**Goal**: Post decryption keys after timelock period ends

**Tasks**:
- [ ] Add decryption key storage to `auction.move`
  - Data structures:
    ```move
    module atomica::auction {
        /// Decryption key for a specific layer
        struct DecryptionKey has copy, drop, store {
            layer_index: u8,           // Which layer this unlocks
            key_material: vector<u8>,  // The actual decryption key/secret
            provider: address,         // Who posted this key
            timestamp: u64,            // When posted
        }

        /// Decryption state for an auction
        struct DecryptionState has key, store {
            auction_id: u64,
            keys: vector<DecryptionKey>, // Posted keys, one per layer
            current_layer: u8,           // Next layer to decrypt (0 = start)
        }

        /// Post decryption key for a specific layer
        public entry fun post_decryption_key(
            provider: &signer,
            auction_id: u64,
            layer_index: u8,
            key_material: vector<u8>,
        );

        /// Query posted decryption keys
        #[view]
        public fun get_decryption_keys(auction_id: u64): vector<DecryptionKey>;
    }
    ```

- [ ] Implement key posting logic
  - Validate: Current time > layer's timelock_end deadline
  - Validate: Layer index is valid for this auction
  - Validate: Key not already posted for this layer
  - Store: Decryption key with metadata
  - Emit: DecryptionKeyPosted event

- [ ] Implement authorization checks
  - Validator layer: Check provider is in validator set
  - Seller layer: Check provider participated in seller DKG
  - Drand layer: Anyone can post (public beacon)
  - Reject: Unauthorized key postings

- [ ] Write unit tests
  - Test cases:
    - Post decryption key after timelock expires
    - Reject key posting before timelock expires
    - Reject unauthorized key posting
    - Reject duplicate key for same layer
    - Query posted keys

**Success Criteria**:
- ✅ Decryption keys stored on-chain
- ✅ Timelock deadline enforced
- ✅ Authorization checks work
- ✅ All tests pass

**Deliverable**: Decryption key posting in `auction.move`

---

#### 2.4 On-Chain Decryption Verification (Week 2-3)

**Goal**: Prove in Move contracts that decrypted message matches previously posted ciphertext

**Tasks**:
- [ ] Add decryption verification to `auction.move`
  - Data structures:
    ```move
    module atomica::auction {
        /// Decrypted bid (claimed plaintext)
        struct DecryptedBid has copy, drop, store {
            bid_id: u64,
            plaintext: vector<u8>,   // Claimed decrypted bid data
            price: u64,              // Extracted price field
            quantity: u64,           // Extracted quantity field
            verified: bool,          // Has decryption been verified?
        }

        /// Decrypted reserve price
        struct DecryptedReserve has copy, drop, store {
            reserve_id: u64,
            plaintext: vector<u8>,
            price: u64,
            verified: bool,
        }

        /// Submit claimed plaintext for a bid
        public entry fun submit_plaintext(
            submitter: &signer,
            auction_id: u64,
            bid_id: u64,
            claimed_plaintext: vector<u8>,
        );

        /// Verify decryption using native crypto functions
        public fun verify_decryption(
            auction_id: u64,
            bid_id: u64,
        ): bool;
    }
    ```

- [ ] Implement verification function
  - Approach: Use Move native functions to call zapatos decryption
  - Process:
    1. Load original encrypted payload (ciphertext)
    2. Load all posted decryption keys for N layers
    3. Call native `decrypt_onion(ciphertext, keys)` function
    4. Compare result with claimed plaintext
    5. If match → mark as verified
  - Alternative: Off-chain decryption with on-chain proof verification

- [ ] Add native Move function for decryption
  - Location: `/source/zapatos/aptos-move/framework/aptos-stdlib/sources/cryptography/onion_decrypt.move`
  - Native function:
    ```move
    module aptos_std::onion_decrypt {
        /// Decrypt N-layer onion ciphertext using provided keys
        /// Returns plaintext if valid, aborts otherwise
        native public fun decrypt_onion(
            ciphertext: vector<u8>,
            layer_keys: vector<vector<u8>>,
        ): vector<u8>;
    }
    ```
  - Rust implementation: `/source/zapatos/aptos-move/framework/aptos-stdlib/sources/cryptography/natives/onion_decrypt.rs`
  - Calls `aptos-dkg` crate's `decrypt_layer()` sequentially

- [ ] Implement plaintext parsing
  - Parse decrypted bytes into structured bid data
  - Extract: price, quantity, bidder address
  - Validate: Data is well-formed and reasonable
  - Store: Parsed bid for auction clearing

- [ ] Write unit tests
  - Test cases:
    - Submit plaintext, verify matches ciphertext (1-layer)
    - Submit plaintext, verify matches ciphertext (2-layer)
    - Submit plaintext, verify matches ciphertext (3-layer)
    - Reject incorrect plaintext
    - Reject missing decryption keys
    - Parse decrypted bid data correctly

**Success Criteria**:
- ✅ Decryption verification works for N layers
- ✅ Native function correctly decrypts onion ciphertext
- ✅ Plaintext parsing extracts bid data
- ✅ Verification rejects incorrect plaintexts
- ✅ All tests pass

**Deliverable**: On-chain decryption verification in `auction.move` with native support

---

#### 2.5 End-to-End Auction Flow Testing (Week 3-4)

**Goal**: Test complete auction flow from creation to decryption verification

**Tasks**:
- [ ] Create integration test for full auction lifecycle
  - File: `/source/atomica-move-contracts/tests/integration/full_auction.move`
  - Test workflow:
    1. Create auction with 2-layer encryption config (Validator + Mock Seller)
    2. Submit 3 encrypted bids (client-side encryption using zapatos library)
    3. Submit 2 encrypted reserve prices
    4. Wait for bid deadline to pass
    5. Validators post layer 0 decryption key
    6. Mock sellers post layer 1 decryption key
    7. Submit claimed plaintexts for all bids/reserves
    8. Verify all decryptions on-chain
    9. Check that verified bids can be parsed correctly

- [ ] Test error conditions
  - Reject bid submission after deadline
  - Reject decryption key before timelock expires
  - Reject incorrect plaintext (doesn't match ciphertext)
  - Reject plaintext when keys are missing
  - Handle malformed bid data after decryption

- [ ] Test with different layer configurations
  - Test: 1-layer (validator only)
  - Test: 2-layer (validator + seller)
  - Test: 3-layer (validator + drand + seller) - if drand implemented
  - Validate: Each configuration works correctly

- [ ] Performance testing
  - Measure: Gas cost for auction creation
  - Measure: Gas cost for bid submission
  - Measure: Gas cost for decryption verification
  - Target: <2M gas for full auction with 10 bids

**Success Criteria**:
- ✅ Full auction flow works end-to-end
- ✅ All layer configurations tested
- ✅ Error conditions handled gracefully
- ✅ Gas costs within acceptable limits
- ✅ All integration tests pass

**Deliverable**: Complete integration test suite for auction encryption flow

---

## Phase 3: atomica-web Frontend Integration (2-3 weeks)

### Objective

Build client-side encryption library and UI for bid submission.

### Task Breakdown

#### 3.1 Encryption Library (WASM Wrapper) (Week 1)

**Goal**: Expose Rust encryption functions to TypeScript

**Tasks**:
- [ ] Create WASM build configuration
  - Location: `/source/zapatos/crates/aptos-dkg-wasm/`
  - Setup: `wasm-pack` build pipeline
  - Target: Web browsers (not Node.js)

- [ ] Create WASM bindings
  - File: `/source/zapatos/crates/aptos-dkg-wasm/src/lib.rs`
  - Expose functions:
    ```rust
    #[wasm_bindgen]
    pub fn encrypt_bid(
        plaintext_json: &str,  // {"price": 1500, "quantity": 10}
        seller_group_pk_hex: &str,
        validator_ibe_pk_hex: &str,
        auction_end_time: u64,
    ) -> String; // Returns hex-encoded ciphertext

    #[wasm_bindgen]
    pub fn encrypt_reserve_price(
        plaintext_price: u64,
        seller_group_pk_hex: &str,
        validator_ibe_pk_hex: &str,
        auction_end_time: u64,
    ) -> String;
    ```

- [ ] Build and publish NPM package
  - Package name: `@atomica/encryption`
  - Include: TypeScript type definitions
  - Publish: To NPM registry (or private registry)

- [ ] Write JavaScript wrapper
  - Location: `/source/atomica-web/packages/encryption/`
  - Provide: Higher-level API for web app
  - Example:
    ```typescript
    import { AtomicaEncryption } from '@atomica/encryption';

    const encryption = new AtomicaEncryption();
    await encryption.initialize(); // Load WASM

    const ciphertext = await encryption.encryptBid({
      price: 1500,
      quantity: 10,
      sellerGroupPubkey: '0x...',
      validatorPubkey: '0x...',
      auctionEndTime: 1234567890,
    });
    ```

- [ ] Write unit tests
  - File: `/source/atomica-web/packages/encryption/test/encryption.test.ts`
  - Test cases:
    - Encrypt bid (valid inputs)
    - Encrypt reserve price (valid inputs)
    - Handle invalid public keys
    - Handle large numbers (JavaScript precision issues)

**Success Criteria**:
- ✅ WASM module builds successfully
- ✅ NPM package published
- ✅ TypeScript types generated
- ✅ Unit tests pass in browser environment
- ✅ Encryption takes <200ms in browser

**Deliverable**: `@atomica/encryption` NPM package

---

#### 3.2 MetaMask Transaction Construction (Week 1-2)

**Goal**: Build transaction payloads for Aptos contract calls signed by MetaMask

**Tasks**:
- [ ] Create transaction builder utility
  - Location: `/source/atomica-web/packages/transaction-builder/`
  - Functionality:
    ```typescript
    import { AptosAccount } from '@aptos-labs/aptos-sdk';
    import { ethers } from 'ethers';

    export async function buildSubmitBidTransaction(
      ethereumAddress: string,
      auctionId: number,
      encryptedBid: string,
      depositAmount: number,
    ): Promise<RawTransaction>;

    export async function signWithMetaMask(
      transaction: RawTransaction,
      ethereumSigner: ethers.Signer,
    ): Promise<SignedTransaction>;
    ```

- [ ] Implement Ethereum signature flow
  - Use: `personal_sign` for message signing
  - Derive: Atomica address from Ethereum pubkey (deterministic)
  - Construct: Aptos transaction with Ethereum signature
  - See: `/docs/technical/ethereum-wallet-atomica-bridge.md`

- [ ] Add gas estimation
  - Estimate: Gas units for bid submission
  - Display: Gas cost in UI (in AUA or USD)
  - Handle: Gas sponsorship (FeePayer backend)

- [ ] Write integration tests
  - File: `/source/atomica-web/packages/transaction-builder/test/integration.test.ts`
  - Test with: Aptos devnet
  - Test cases:
    - Build and submit bid transaction
    - Build and submit reserve price transaction
    - Handle transaction failures

**Success Criteria**:
- ✅ Transactions build correctly
- ✅ MetaMask signatures verified on-chain
- ✅ Gas estimation accurate (within 10%)
- ✅ Integration tests pass on devnet

**Deliverable**: `@atomica/transaction-builder` package

---

#### 3.3 Bid Submission UI (Week 2)

**Goal**: Build user interface for encrypted bid submission

**Tasks**:
- [ ] Create bid submission form component
  - Location: `/source/atomica-web/src/components/BidSubmissionForm.tsx`
  - Fields:
    - Asset pair (dropdown)
    - Bid price (number input)
    - Bid quantity (number input)
    - Deposit amount (auto-calculated from quantity × price)
  - Validations:
    - Price > 0
    - Quantity > 0
    - Sufficient deposit on Ethereum

- [ ] Integrate encryption library
  - On "Submit Bid" click:
    1. Fetch seller group public key from chain
    2. Fetch validator public key from chain
    3. Encrypt bid locally
    4. Build Aptos transaction
    5. Sign with MetaMask
    6. Submit to Aptos network
    7. Show transaction status

- [ ] Add transaction status monitoring
  - Poll: Aptos node for transaction confirmation
  - Display: "Pending", "Confirmed", "Failed"
  - Error handling: Show user-friendly error messages

- [ ] Create reserve price form component
  - Location: `/source/atomica-web/src/components/ReservePriceForm.tsx`
  - Similar flow to bid submission
  - Default: Reserve = 0 (market sell)

- [ ] Add decryption countdown
  - Display: Time remaining until auction ends
  - Display: Decryption progress (validator shares / threshold)
  - Display: "Decrypting..." when shares being aggregated
  - Display: "Auction cleared!" when complete

**Success Criteria**:
- ✅ Bid submission form works end-to-end
- ✅ Encryption happens client-side (not sent to server)
- ✅ Transaction status updates in real-time
- ✅ Reserve price form works
- ✅ UI is responsive and user-friendly

**Deliverable**: Bid submission and reserve price UI components

---

#### 3.4 End-to-End Testing (Week 3)

**Goal**: Test full user flow from MetaMask to auction settlement

**Tasks**:
- [ ] Set up local test environment
  - Run: Aptos devnet locally
  - Run: Ethereum devnet (Hardhat or Ganache)
  - Deploy: All Move contracts to Aptos devnet
  - Deploy: TimeLock contracts to Ethereum devnet

- [ ] Write E2E test scenarios
  - File: `/source/atomica-web/tests/e2e/auction.e2e.test.ts`
  - Use: Playwright or Cypress for browser automation
  - Scenarios:
    1. **Happy Path**:
       - User deposits ETH on Ethereum devnet
       - User submits encrypted bid via web UI
       - Auction ends
       - Validators submit decryption shares
       - Sellers submit decryption shares
       - Auction clears
       - User withdraws winnings on Ethereum
    2. **Invalid Bid**:
       - User submits bid with price > deposit
       - Bid is slashed post-decryption
       - Deposit forfeited
    3. **Seller Non-Participation**:
       - Seller doesn't submit decryption share
       - Seller is slashed
       - Auction still completes (threshold met)
    4. **Early Decryption Attempt**:
       - Malicious actor submits scuttle proof
       - Auction halts
       - Bounty paid

- [ ] Add performance monitoring
  - Measure: Page load time
  - Measure: Encryption time (client-side)
  - Measure: Transaction confirmation time
  - Target: <2 seconds per operation

- [ ] Write user acceptance tests
  - Involve: Non-technical users for testing
  - Collect: Feedback on UX
  - Iterate: Based on feedback

**Success Criteria**:
- ✅ All E2E scenarios pass
- ✅ Performance meets targets
- ✅ No critical bugs found
- ✅ Users can complete auction flow without assistance

**Deliverable**: E2E test suite with passing results

---

## Testing Strategy

### Unit Testing

**Rust (zapatos)**:
- Framework: `cargo test`
- Coverage target: >90%
- Focus: Cryptographic correctness, edge cases

**Move (atomica-move-contracts)**:
- Framework: `aptos move test`
- Coverage target: >85%
- Focus: Business logic, invariants, access control

**TypeScript (atomica-web)**:
- Framework: Jest
- Coverage target: >80%
- Focus: UI components, transaction construction

### Integration Testing

**Cross-layer testing**:
- Rust ↔ Move: Test serialization compatibility
- Move ↔ TypeScript: Test transaction construction
- TypeScript ↔ Rust: Test WASM interface

**Multi-component testing**:
- DKG + Encryption + Decryption
- Auction + Slashing + Settlement
- UI + Transaction + Chain state

### End-to-End Testing

**Full system testing**:
- Local devnet (Aptos + Ethereum)
- Public testnet (Aptos testnet + Goerli/Sepolia)
- Load testing (100+ concurrent auctions)

### Security Testing

**Adversarial testing**:
- Byzantine validator behavior
- Malicious bid submissions
- Early decryption attempts
- DoS attacks (spam bids)

**Audit preparation**:
- Code freeze 2 weeks before audit
- Prepare documentation for auditors
- Resolve all high-severity findings before mainnet

---

## Success Criteria

### Functional Requirements

✅ **Phase 1 (zapatos)**:
- [ ] DKG completes with 100+ participants in <30 seconds
- [ ] Dual-layer encryption implemented and tested
- [ ] Adversarial tests pass (security guarantees hold)
- [ ] Performance benchmarks meet targets

✅ **Phase 2 (Move contracts)**:
- [ ] Seller DKG contract deployed and tested
- [ ] Sealed bid storage implemented
- [ ] Decryption aggregation works on-chain
- [ ] Auction clearing with decrypted bids succeeds
- [ ] Slashing and scuttle reward mechanisms implemented

✅ **Phase 3 (Web frontend)**:
- [ ] WASM encryption library published
- [ ] MetaMask transaction signing works
- [ ] Bid submission UI functional
- [ ] E2E tests pass

### Non-Functional Requirements

✅ **Performance**:
- [ ] Client-side encryption: <200ms
- [ ] On-chain decryption aggregation: <10M gas
- [ ] Page load time: <2 seconds
- [ ] Transaction confirmation: <10 seconds

✅ **Security**:
- [ ] <67% validators cannot decrypt early
- [ ] <33% sellers cannot decrypt early
- [ ] Invalid bids slashed automatically
- [ ] Scuttle reward mechanism functional

✅ **Usability**:
- [ ] User can submit bid without Aptos wallet
- [ ] User can see transaction status in real-time
- [ ] Errors displayed with actionable messages
- [ ] Mobile-responsive UI

---

## Risk Mitigation

### Technical Risks

**Risk**: DKG fails with large seller sets (>500 participants)
**Mitigation**: Implement progressive DKG (split into smaller groups)
**Fallback**: Reduce max auction size to 100 sellers

**Risk**: On-chain decryption too expensive (>20M gas)
**Mitigation**: Optimize share verification, batch operations
**Fallback**: Move decryption off-chain, verify via ZK proof

**Risk**: WASM encryption too slow in browser (>500ms)
**Mitigation**: Use Web Workers for parallel computation
**Fallback**: Provide native app for high-frequency traders

### Integration Risks

**Risk**: Serialization format mismatch between Rust and Move
**Mitigation**: Use standard formats (BCS for Aptos)
**Testing**: Cross-layer integration tests

**Risk**: MetaMask signature incompatible with Aptos
**Mitigation**: Follow AIP-113 specification exactly
**Testing**: Test with multiple MetaMask versions

### Schedule Risks

**Risk**: Phase 1 takes longer than 3 weeks
**Mitigation**: Parallelize tasks where possible
**Contingency**: Delay Phase 2 start, maintain end date

**Risk**: Critical bugs found in E2E testing
**Mitigation**: Allocate 1 week buffer for bug fixes
**Contingency**: Delay testnet deployment, not mainnet

---

## Appendix: File Structure

### zapatos Repository

```
source/zapatos/
├── crates/aptos-dkg/
│   ├── src/
│   │   ├── dual_layer/
│   │   │   ├── mod.rs              # NEW: Dual-layer encryption
│   │   │   ├── onion_encrypt.rs    # NEW: Onion encryption functions
│   │   │   └── onion_decrypt.rs    # NEW: Onion decryption functions
│   │   ├── pvss/                   # EXISTING: DKG infrastructure
│   │   └── ...
│   ├── tests/
│   │   ├── tlock_poc.rs            # EXISTING: IBE POC
│   │   ├── large_scale_dkg.rs      # NEW: Large-scale DKG tests
│   │   ├── dual_layer_encryption.rs # NEW: Dual-layer tests
│   │   └── adversarial.rs          # NEW: Security tests
│   └── examples/
│       └── auction_encryption.rs   # NEW: Example usage
└── crates/aptos-dkg-wasm/          # NEW: WASM bindings
    ├── src/lib.rs
    └── Cargo.toml
```

### atomica-move-contracts Repository

```
source/atomica-move-contracts/
├── sources/
│   ├── seller_dkg.move             # NEW: Seller DKG coordination
│   ├── sealed_bid.move             # NEW: Encrypted bid storage
│   ├── decryption.move             # NEW: Share aggregation
│   ├── auction.move                # NEW: Auction lifecycle
│   ├── slashing.move               # NEW: Invalid bid penalties
│   ├── scuttle_reward.move         # NEW: Collusion bounty
│   ├── registry.move               # EXISTING: Asset registry
│   └── ...
└── tests/
    ├── seller_dkg_tests.move       # NEW
    ├── sealed_bid_tests.move       # NEW
    ├── decryption_tests.move       # NEW
    ├── auction_tests.move          # NEW: Integration tests
    └── ...
```

### atomica-web Repository

```
source/atomica-web/
├── packages/
│   ├── encryption/                 # NEW: Encryption library
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── wasm-loader.ts
│   │   ├── test/
│   │   │   └── encryption.test.ts
│   │   └── package.json
│   └── transaction-builder/        # NEW: Transaction utilities
│       ├── src/
│       │   ├── index.ts
│       │   └── aptos-tx.ts
│       └── test/
│           └── integration.test.ts
├── src/
│   ├── components/
│   │   ├── BidSubmissionForm.tsx   # NEW: Bid UI
│   │   └── ReservePriceForm.tsx    # NEW: Reserve price UI
│   └── ...
└── tests/
    └── e2e/
        └── auction.e2e.test.ts     # NEW: E2E tests
```

---

**Document Version**: 1.0
**Last Updated**: 2025-12-22
**Next Review**: After Phase 1 completion
**Owner**: Atomica Engineering Team
