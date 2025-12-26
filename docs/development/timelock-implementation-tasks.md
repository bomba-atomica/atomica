# Timelock Feature Implementation Task List

**Status**: Initial Implementation Roadmap
**Date**: 2025-12-26
**Goal**: Complete E2E validator timelock transactions for Atomica sealed bid auctions

## Overview

This document outlines all tasks required to implement a working timelock encryption system using distributed key generation (DKG) for the Atomica sealed bid protocol. The implementation leverages Aptos validator infrastructure to provide IBE-based timelock encryption without external dependencies.

## Task Categories

1. **Core Cryptography** - Implement IBE primitives
2. **DKG Integration** - Wire up timelock DKG sessions
3. **Smart Contract Logic** - Complete Move implementation
4. **Validator Infrastructure** - Handle timelock transactions
5. **Testing Infrastructure** - Enable E2E testing
6. **E2E Smoke Tests** - Comprehensive validation

---

## Phase 0: Scaffolding and Stubs (Priority: P0)

### Task 0.1: Create Module Structure and Function Stubs
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 1-2 days

**Goal**: Create all modules, types, and function signatures needed for the timelock implementation. All stubs should compile and existing tests should pass. This provides the full system view for developers.

**Files to Create**:
- `source/zapatos/crates/aptos-dkg/src/ibe.rs` (NEW)
- `source/zapatos/crates/aptos-dkg/src/ibe/errors.rs` (NEW)
- `source/zapatos/aptos-move/framework/aptos-natives/src/cryptography/ibe.rs` (NEW)
- `source/zapatos/aptos-move/framework/aptos-natives/src/cryptography/bls_aggregation.rs` (NEW)
- `source/zapatos/aptos-move/framework/aptos-framework/sources/crypto/ibe.move` (NEW)
- `source/zapatos/aptos-move/framework/aptos-framework/sources/configs/timelock_config.move` (NEW)
- `source/zapatos/testsuite/smoke-test/src/timelock/mod.rs` (NEW)
- `source/zapatos/testsuite/smoke-test/src/timelock/basic_flow.rs` (NEW)

**Files to Modify**:
- `source/zapatos/crates/aptos-dkg/src/lib.rs` (add ibe module)
- `source/zapatos/aptos-move/framework/aptos-natives/src/cryptography/mod.rs` (add ibe, bls_aggregation)
- `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move` (add stubs for new functions)
- `source/zapatos/dkg/src/epoch_manager.rs` (add stub implementations)
- `source/zapatos/testsuite/smoke-test/src/lib.rs` (add timelock module)

**Subtasks**:
- [ ] Create IBE module structure with stub functions
- [ ] Create native function stubs for IBE and BLS aggregation
- [ ] Create Move module stubs for IBE and timelock config
- [ ] Update timelock.move with new function stubs
- [ ] Add stub implementations to epoch_manager.rs
- [ ] Create test module structure
- [ ] Verify zapatos compiles: `cd source/zapatos && cargo build`
- [ ] Verify tests pass: `cd source/zapatos && cargo test`
- [ ] Document all function signatures and expected behavior

**Acceptance Criteria**:
- [ ] All Rust code compiles without errors
- [ ] All existing tests pass
- [ ] All stub functions have TODO comments with implementation notes
- [ ] Type signatures match the detailed tasks in later phases
- [ ] No warnings about unused code (use #[allow(dead_code)] for stubs)

**Dependencies**: None

---

## Phase 1: Core Cryptography (Priority: P0)

### Task 1.1: Production IBE Implementation
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 2-3 days

**Files**:
- `source/zapatos/crates/aptos-dkg/src/ibe.rs` (NEW)
- `source/zapatos/crates/aptos-dkg/src/lib.rs` (MODIFY)

**Subtasks**:
- [ ] Create new `ibe.rs` module in `aptos-dkg` crate
- [ ] Move IBE functions from `tests/tlock_poc.rs` to production module:
  - [ ] `ibe_encrypt(mpk: G2Projective, identity: &[u8], message: &[u8]) -> Ciphertext`
  - [ ] `ibe_decrypt(dk: G1Projective, ciphertext: Ciphertext) -> Vec<u8>`
  - [ ] `derive_decryption_key(msk: Scalar, identity: &[u8]) -> G1Projective`
- [ ] Improve hash-to-bytes function (replace debug format with proper serialization)
- [ ] Add proper error handling with custom `IbeError` type
- [ ] Write unit tests for encrypt/decrypt roundtrip
- [ ] Add benchmarks for performance validation

**Acceptance Criteria**:
- [ ] IBE encrypt/decrypt passes fuzz testing with random inputs
- [ ] Performance: encrypt <10ms, decrypt <10ms on standard hardware
- [ ] API is documented with rustdoc comments

**Dependencies**: None

---

### Task 1.2: Native Move Functions for IBE
**Status**: ❌ Not Started
**Blockers**: Task 1.1
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/aptos-move/framework/aptos-natives/src/cryptography/ibe.rs` (NEW)
- `source/zapatos/aptos-move/framework/aptos-natives/src/cryptography/mod.rs` (MODIFY)
- `source/zapatos/aptos-move/framework/aptos-framework/sources/crypto/ibe.move` (NEW)

**Subtasks**:
- [ ] Create native function wrapper for IBE encryption:
  ```rust
  #[native_function]
  pub fn ibe_encrypt(
      mpk: Vec<u8>,       // BLS12-381 G2 point (96 bytes)
      identity: Vec<u8>,  // Arbitrary identity bytes
      message: Vec<u8>,   // Plaintext to encrypt
  ) -> Result<Vec<u8>, NativeError>  // Ciphertext
  ```
- [ ] Create native function wrapper for IBE decryption:
  ```rust
  #[native_function]
  pub fn ibe_decrypt(
      dk: Vec<u8>,          // BLS12-381 G1 point (48 bytes)
      ciphertext: Vec<u8>,  // Encrypted data
  ) -> Result<Vec<u8>, NativeError>  // Plaintext
  ```
- [ ] Add serialization/deserialization for curve points (use `blstrs` compressed format)
- [ ] Register native functions in VM native function table
- [ ] Create Move module `0x1::ibe` with native function declarations
- [ ] Add gas cost estimation for native functions
- [ ] Write Move unit tests calling native functions

**Acceptance Criteria**:
- [ ] Move smart contracts can call `ibe::encrypt()` and `ibe::decrypt()`
- [ ] Gas costs are reasonable (<100K gas for encrypt, <150K for decrypt)
- [ ] Error handling properly propagates to Move layer

**Dependencies**: Task 1.1

---

### Task 1.3: Identity Format Standardization
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 1 day

**Files**:
- `docs/technical/timelock-identity-format.md` (NEW)
- `source/zapatos/crates/aptos-dkg/src/ibe.rs` (MODIFY)

**Subtasks**:
- [ ] Define canonical identity format for timelock intervals:
  ```
  identity = sha256(interval_u64 || chain_id_u8 || context_bytes)
  ```
- [ ] Implement helper function: `fn timelock_identity(interval: u64, chain_id: u8) -> Vec<u8>`
- [ ] Add native Move function to compute identity:
  ```rust
  #[native_function]
  pub fn compute_timelock_identity(interval: u64) -> Vec<u8>
  ```
- [ ] Document identity format in technical docs
- [ ] Add validation tests for identity generation consistency

**Acceptance Criteria**:
- [ ] Same identity generated on Rust client and Move contract sides
- [ ] Identity format is documented and frozen for production
- [ ] Tests verify cross-platform consistency

**Dependencies**: None

---

## Phase 2: DKG Integration (Priority: P0)

### Task 2.1: Timelock DKG Session Management
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 3-4 days

**Files**:
- `source/zapatos/dkg/src/epoch_manager.rs` (MODIFY)
- `source/zapatos/types/src/dkg/mod.rs` (MODIFY)

**Subtasks**:
- [ ] Implement `start_timelock_dkg()` to spawn actual DKG session:
  ```rust
  fn start_timelock_dkg(&mut self, event: StartKeyGenEvent) {
      // 1. Construct TimelockSessionMetadata
      let metadata = self.build_timelock_metadata(event.interval, event.config);

      // 2. Spawn DKGManager with is_timelock=true
      let dkg_manager = DKGManager::<DefaultDKG>::new(
          // ... params
          true, // is_timelock flag
      );

      // 3. Track timelock DKG sessions separately
      self.timelock_dkg_managers.insert(event.interval, dkg_manager);
  }
  ```
- [ ] Create `TimelockSessionMetadata` struct with proper fields:
  - `interval: u64`
  - `threshold: u64`
  - `validator_set: Vec<ValidatorConsensusInfo>`
  - `chain_id: u8`
- [ ] Implement `build_timelock_metadata()` to construct metadata from event
- [ ] Add `HashMap<u64, DKGManager>` to track multiple timelock DKG sessions
- [ ] Handle concurrent DKG sessions (randomness beacon + timelock intervals)
- [ ] Add cleanup logic when intervals expire

**Acceptance Criteria**:
- [ ] StartKeyGenEvent triggers actual DKG session spawn
- [ ] Multiple timelock intervals can run DKG concurrently
- [ ] DKG manager state is properly isolated per interval

**Dependencies**: None

---

### Task 2.2: Timelock Transcript Submission
**Status**: ❌ Not Started
**Blockers**: Task 2.1
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/dkg/src/dkg_manager/mod.rs` (MODIFY)
- `source/zapatos/types/src/validator_txn.rs` (REVIEW)

**Subtasks**:
- [ ] Verify `is_timelock` flag properly routes to `ValidatorTransaction::TimelockDKGResult`
- [ ] Ensure `DKGTranscript` metadata uses interval instead of epoch:
  ```rust
  let txn = if self.is_timelock {
      ValidatorTransaction::TimelockDKGResult(DKGTranscript {
          metadata: DKGTranscriptMetadata {
              epoch: self.timelock_interval, // NOT self.epoch_state.epoch
              author: self.my_addr,
          },
          transcript_bytes: agg_trx_bytes,
      })
  } else {
      // ... normal DKG path
  }
  ```
- [ ] Add validation that timelock transcripts use correct Topic::TIMELOCK
- [ ] Test that validator transaction pool accepts timelock DKG results

**Acceptance Criteria**:
- [ ] Timelock DKG produces `TimelockDKGResult` validator transactions
- [ ] Transactions are properly routed to validator transaction pool
- [ ] Consensus includes timelock DKG results in blocks

**Dependencies**: Task 2.1

---

### Task 2.3: Secret Share Submission and Aggregation
**Status**: ❌ Not Started
**Blockers**: Task 2.1
**Estimated Effort**: 3 days

**Files**:
- `source/zapatos/dkg/src/epoch_manager.rs` (MODIFY)
- `source/zapatos/types/src/dkg/mod.rs` (REVIEW)

**Subtasks**:
- [ ] Implement `process_timelock_reveal()` to compute actual shares:
  ```rust
  fn process_timelock_reveal(&self, event: RequestRevealEvent) {
      // 1. Retrieve stored secret share for interval
      let my_share = self.retrieve_timelock_secret_share(event.interval);

      // 2. Compute BLS signature on identity
      let identity = compute_timelock_identity(event.interval, self.chain_id);
      let decryption_share = sign_identity(my_share, &identity);

      // 3. Submit TimelockShare validator transaction
      let share = TimelockShare {
          interval: event.interval,
          share: serialize_g1_point(decryption_share),
      };
      self.vtxn_pool.add_transaction(
          ValidatorTransaction::TimelockShare(share),
          Topic::TIMELOCK
      );
  }
  ```
- [ ] Add `retrieve_timelock_secret_share()` to fetch share from storage
- [ ] Implement BLS signature on identity using DKG secret share
- [ ] Add proper error handling if share is missing or corrupted
- [ ] Test share submission under network delays

**Acceptance Criteria**:
- [ ] Validators compute correct decryption shares when RequestRevealEvent fires
- [ ] Shares are submitted as validator transactions
- [ ] Shares can be verified against published public key

**Dependencies**: Task 2.1

---

## Phase 3: Smart Contract Logic (Priority: P0)

### Task 3.1: Proper Validator Set Configuration
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move` (MODIFY)

**Subtasks**:
- [ ] Query actual validator set from stake module:
  ```move
  public(friend) fun on_new_block(vm: &signer) acquires TimelockState {
      // ...
      let validator_set = stake::get_current_validators();
      let num_validators = vector::length(&validator_set);
      let threshold = compute_byzantine_threshold(num_validators); // 2f+1

      let config = TimelockConfig {
          threshold,
          total_validators: num_validators,
      };
  }
  ```
- [ ] Implement `compute_byzantine_threshold()` helper: `threshold = (2 * total / 3) + 1`
- [ ] Add validator address list to `StartKeyGenEvent`:
  ```move
  struct StartKeyGenEvent has drop, store {
      interval: u64,
      config: TimelockConfig,
      participants: vector<address>,  // ADD THIS
  }
  ```
- [ ] Emit participant list in event for DKG coordination
- [ ] Add tests for threshold calculation with different validator counts

**Acceptance Criteria**:
- [ ] Threshold is computed correctly (Byzantine fault tolerant: 2f+1)
- [ ] Validator set matches current consensus validator set
- [ ] Event contains complete participant information

**Dependencies**: None

---

### Task 3.2: Secret Share Aggregation in Move
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 3-4 days

**Files**:
- `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move` (MODIFY)
- `source/zapatos/aptos-move/framework/aptos-natives/src/cryptography/bls_aggregation.rs` (NEW)

**Subtasks**:
- [ ] Change `revealed_secrets` table structure to store all shares:
  ```move
  struct TimelockState has key {
      // ... existing fields
      /// Map: interval -> list of (validator_address, share)
      validator_shares: Table<u64, vector<ValidatorShare>>,
      /// Map: interval -> aggregated decryption key (once threshold met)
      revealed_secrets: Table<u64, vector<u8>>,
  }

  struct ValidatorShare has store, drop {
      validator: address,
      share: vector<u8>,  // G1 point
  }
  ```
- [ ] Implement `publish_secret_share()` to collect shares:
  ```move
  public entry fun publish_secret_share(
      validator: &signer,
      interval: u64,
      share: vector<u8>
  ) acquires TimelockState {
      // 1. Verify validator is authorized
      assert!(stake::is_current_epoch_validator(signer::address_of(validator)), ENOT_VALIDATOR);

      // 2. Store the share
      let state = borrow_global_mut<TimelockState>(@aptos_framework);
      if (!table::contains(&state.validator_shares, interval)) {
          table::add(&mut state.validator_shares, interval, vector::empty());
      };
      let shares = table::borrow_mut(&mut state.validator_shares, interval);
      vector::push_back(shares, ValidatorShare {
          validator: signer::address_of(validator),
          share
      });

      // 3. Check if threshold is met
      let config = get_config_for_interval(interval);
      if (vector::length(shares) >= config.threshold) {
          // Aggregate shares
          let aggregated_key = bls_aggregation::aggregate_g1_points(shares);
          table::add(&mut state.revealed_secrets, interval, aggregated_key);

          // Emit event
          event::emit(SecretRevealedEvent { interval, decryption_key: aggregated_key });
      }
  }
  ```
- [ ] Create native function for BLS point aggregation:
  ```rust
  #[native_function]
  pub fn aggregate_g1_points(points: Vec<Vec<u8>>) -> Result<Vec<u8>, NativeError>
  ```
- [ ] Add duplicate share detection (same validator submits twice)
- [ ] Add share verification against published public key
- [ ] Emit `SecretRevealedEvent` when threshold is met

**Acceptance Criteria**:
- [ ] All validator shares are stored, not just the first
- [ ] Aggregation happens automatically when threshold is reached
- [ ] Aggregated key can decrypt bids encrypted with public key
- [ ] Duplicate or invalid shares are rejected

**Dependencies**: Task 1.2 (native functions)

---

### Task 3.3: Validator Authorization Checks
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 1 day

**Files**:
- `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move` (MODIFY)

**Subtasks**:
- [ ] Add validator verification to `publish_public_key()`:
  ```move
  public entry fun publish_public_key(
      validator: &signer,
      interval: u64,
      pk: vector<u8>
  ) acquires TimelockState {
      // Verify caller is a validator (or use validator transaction only)
      let validator_addr = signer::address_of(validator);
      assert!(stake::is_current_epoch_validator(validator_addr), ENOT_VALIDATOR);

      // Rest of logic...
  }
  ```
- [ ] Consider changing to validator transaction only (remove `public entry`)
- [ ] Add signature verification if keeping as entry function
- [ ] Same checks for `publish_secret_share()`

**Acceptance Criteria**:
- [ ] Only validators can submit public keys and shares
- [ ] Non-validator addresses are rejected with clear error
- [ ] Tests verify authorization enforcement

**Dependencies**: None

---

### Task 3.4: Public Key Storage and Retrieval
**Status**: ❌ Not Started
**Blockers**: Task 3.2
**Estimated Effort**: 1-2 days

**Files**:
- `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move` (MODIFY)

**Subtasks**:
- [ ] Implement view function to get current interval's public key:
  ```move
  #[view]
  public fun get_current_public_key(): Option<vector<u8>> acquires TimelockState {
      let state = borrow_global<TimelockState>(@aptos_framework);
      let current_interval = state.current_interval;
      get_public_key(current_interval)
  }
  ```
- [ ] Implement view function for specific interval:
  ```move
  #[view]
  public fun get_public_key(interval: u64): Option<vector<u8>> acquires TimelockState {
      if (!exists<TimelockState>(@aptos_framework)) {
          return option::none()
      };
      let state = borrow_global<TimelockState>(@aptos_framework);
      if (table::contains(&state.public_keys, interval)) {
          option::some(*table::borrow(&state.public_keys, interval))
      } else {
          option::none()
      }
  }
  ```
- [ ] Add function to get next interval (for bid encryption):
  ```move
  #[view]
  public fun get_next_interval(): u64 acquires TimelockState
  ```
- [ ] Add function to check if secret is revealed:
  ```move
  #[view]
  public fun is_secret_revealed(interval: u64): bool acquires TimelockState
  ```

**Acceptance Criteria**:
- [ ] Clients can query public key for encryption
- [ ] View functions are gas-free
- [ ] Functions handle missing data gracefully

**Dependencies**: Task 3.2

---

## Phase 4: Validator Infrastructure (Priority: P1)

### Task 4.1: Key Material Storage
**Status**: ❌ Not Started
**Blockers**: Task 2.1
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/dkg/src/epoch_manager.rs` (MODIFY)
- `source/zapatos/config/src/config/dkg_config.rs` (REVIEW)

**Subtasks**:
- [ ] Store timelock secret shares in `PersistentSafetyStorage`:
  ```rust
  fn store_timelock_share(
      &mut self,
      interval: u64,
      secret_share: &G1Projective,
  ) -> Result<()> {
      let key = format!("timelock_share_{}", interval);
      let bytes = serialize_g1(secret_share)?;
      self.key_storage.set(key.as_bytes(), &bytes)
  }
  ```
- [ ] Add `retrieve_timelock_secret_share()` for share recovery
- [ ] Implement cleanup of old interval shares (keep last N intervals)
- [ ] Add encryption of stored shares using validator consensus key
- [ ] Test storage/retrieval across validator restarts

**Acceptance Criteria**:
- [ ] Secret shares persist across validator restarts
- [ ] Shares are encrypted at rest
- [ ] Old shares are cleaned up to prevent disk bloat
- [ ] Recovery works in DKG restart scenarios

**Dependencies**: Task 2.1

---

### Task 4.2: DKG State Recovery
**Status**: ❌ Not Started
**Blockers**: Task 2.1, Task 4.1
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/dkg/src/dkg_manager/mod.rs` (MODIFY)

**Subtasks**:
- [ ] Add timelock session state persistence:
  ```rust
  struct TimelockDKGState {
      interval: u64,
      in_progress: Option<DKGSessionState>,
      completed_transcript: Option<DKGTranscript>,
  }
  ```
- [ ] Save state on DKG progress milestones
- [ ] Load and resume incomplete timelock DKG sessions on validator restart
- [ ] Handle case where DKG completed but transaction not yet in block
- [ ] Add tests for mid-DKG restart recovery

**Acceptance Criteria**:
- [ ] Validator can restart during timelock DKG without losing progress
- [ ] Incomplete sessions resume automatically
- [ ] No duplicate transcript submissions after recovery

**Dependencies**: Task 2.1, Task 4.1

---

## Phase 5: Testing Infrastructure (Priority: P1)

### Task 5.1: Configurable Timelock Interval
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 1 day

**Files**:
- `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move` (MODIFY)
- `source/zapatos/aptos-move/framework/aptos-framework/sources/configs/timelock_config.move` (NEW)

**Subtasks**:
- [ ] Create on-chain config for timelock interval:
  ```move
  module aptos_framework::timelock_config {
      struct TimelockConfig has key {
          interval_microseconds: u64,  // Default: 1 hour = 3600 * 1000000
      }

      public fun set_interval_for_testing(framework: &signer, interval_us: u64) {
          // Only allow in testnet/devnet
          assert!(chain_id::get() != 1, EPRODUCTION_OVERRIDE);
          // ... set config
      }
  }
  ```
- [ ] Modify `timelock.move` to read interval from config instead of hardcoding
- [ ] Add feature flag or genesis config to set test interval (e.g., 5 seconds)
- [ ] Document testing interval configuration

**Acceptance Criteria**:
- [ ] Smoke tests can set 5-second interval
- [ ] Production defaults to 1 hour
- [ ] Configuration cannot be changed in mainnet

**Dependencies**: None

---

### Task 5.2: Test Utilities and Helpers
**Status**: ❌ Not Started
**Blockers**: None
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/testsuite/smoke-test/src/timelock/mod.rs` (NEW)
- `source/zapatos/testsuite/smoke-test/src/utils.rs` (MODIFY)

**Subtasks**:
- [ ] Create helper to wait for interval rotation:
  ```rust
  async fn wait_for_interval_rotation(
      client: &Client,
      target_interval: u64,
      timeout_secs: u64,
  ) -> TimelockState
  ```
- [ ] Create helper to verify public key publication:
  ```rust
  async fn verify_public_key_published(
      client: &Client,
      interval: u64,
  ) -> Result<Vec<u8>>
  ```
- [ ] Create helper to verify secret aggregation:
  ```rust
  async fn verify_secret_aggregated(
      client: &Client,
      interval: u64,
      expected_threshold: u64,
  ) -> Result<Vec<u8>>
  ```
- [ ] Create helper to test encrypt/decrypt cycle:
  ```rust
  fn test_ibe_roundtrip(
      mpk: &[u8],
      dk: &[u8],
      interval: u64,
      message: &[u8],
  ) -> Result<()>
  ```
- [ ] Mirror randomness test structure from `randomness/mod.rs`

**Acceptance Criteria**:
- [ ] Test utilities work across all smoke tests
- [ ] Clear error messages when assertions fail
- [ ] Helpers are reusable for different test scenarios

**Dependencies**: None

---

## Phase 6: E2E Smoke Tests (Priority: P0)

### Task 6.1: Basic Timelock Flow Test
**Status**: ❌ Not Started
**Blockers**: All Phase 1-5 tasks
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/testsuite/smoke-test/src/timelock/basic_flow.rs` (NEW)

**Subtasks**:
- [ ] Create test with 4 validators and 5-second interval
- [ ] Verify genesis initialization of timelock state
- [ ] Wait for first interval rotation
- [ ] Verify `StartKeyGenEvent` is emitted
- [ ] Verify validators complete DKG and submit transcripts
- [ ] Verify public key is published to chain
- [ ] Verify `RequestRevealEvent` is emitted
- [ ] Verify validators submit secret shares
- [ ] Verify shares are aggregated when threshold is met
- [ ] Print metrics (DKG completion time, share submission time, etc.)

**Test Structure**:
```rust
#[tokio::test]
async fn test_timelock_basic_flow() {
    let interval_secs = 5;

    let (swarm, _cli, _faucet) = SwarmBuilder::new_local(4)
        .with_num_fullnodes(1)
        .with_aptos()
        .with_init_genesis_config(Arc::new(move |conf| {
            conf.consensus_config.enable_validator_txns();
            conf.timelock_interval_secs = interval_secs;
        }))
        .build_with_cli(0)
        .await;

    let client = swarm.validators().next().unwrap().rest_client();

    // 1. Verify initialization
    info!("Verifying timelock state initialized at genesis");
    let state = get_on_chain_resource::<TimelockState>(&client).await;
    assert_eq!(state.current_interval, 0);

    // 2. Wait for rotation
    info!("Waiting for interval rotation to interval 1");
    let state = wait_for_interval_rotation(&client, 1, interval_secs * 3).await;
    assert_eq!(state.current_interval, 1);

    // 3. Verify public key published
    info!("Verifying public key published for interval 1");
    let mpk = verify_public_key_published(&client, 1).await.unwrap();
    assert_eq!(mpk.len(), 96); // G2 point compressed size

    // 4. Wait for reveal (next rotation)
    info!("Waiting for interval rotation to interval 2 (triggers reveal)");
    let state = wait_for_interval_rotation(&client, 2, interval_secs * 3).await;

    // 5. Verify secret aggregated
    info!("Verifying secret aggregated for interval 0");
    let dk = verify_secret_aggregated(&client, 0, 3).await.unwrap(); // threshold=3 for 4 validators
    assert_eq!(dk.len(), 48); // G1 point compressed size

    info!("✅ Basic timelock flow test passed!");
}
```

**Acceptance Criteria**:
- [ ] Test passes on clean environment
- [ ] All rotations happen within expected time bounds
- [ ] Public keys and secrets are correctly published
- [ ] Test is deterministic and repeatable

**Dependencies**: All previous tasks

---

### Task 6.2: IBE Encrypt/Decrypt E2E Test
**Status**: ❌ Not Started
**Blockers**: Task 6.1, Task 1.2
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/testsuite/smoke-test/src/timelock/ibe_e2e.rs` (NEW)

**Subtasks**:
- [ ] Extend basic flow test to actually encrypt/decrypt data
- [ ] Fetch public key from interval 1
- [ ] Encrypt a test "bid" using IBE:
  ```rust
  let bid_data = b"secret_bid_100_tokens";
  let identity = compute_timelock_identity(1, swarm.chain_id());
  let ciphertext = ibe_encrypt(&mpk, &identity, bid_data).unwrap();
  ```
- [ ] Wait for interval 1 secret to be revealed
- [ ] Decrypt the bid using revealed decryption key:
  ```rust
  let decrypted = ibe_decrypt(&dk, &ciphertext).unwrap();
  assert_eq!(decrypted, bid_data);
  ```
- [ ] Verify decryption fails before secret is revealed
- [ ] Test with multiple bids encrypted to same interval

**Acceptance Criteria**:
- [ ] Encryption with published MPK succeeds
- [ ] Decryption before reveal fails
- [ ] Decryption after reveal succeeds and matches plaintext
- [ ] Multiple ciphertexts can be decrypted with same key

**Dependencies**: Task 6.1, Task 1.2

---

### Task 6.3: Validator Restart During Timelock DKG
**Status**: ❌ Not Started
**Blockers**: Task 6.1, Task 4.2
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/testsuite/smoke-test/src/timelock/validator_restart.rs` (NEW)

**Subtasks**:
- [ ] Mirror structure from `randomness/validator_restart_during_dkg.rs`
- [ ] Start timelock DKG for interval N
- [ ] Inject failpoint to crash validators mid-DKG
- [ ] Restart validators
- [ ] Verify DKG resumes and completes
- [ ] Verify public key is published despite restart
- [ ] Test with different numbers of validators restarting (1, 2, 3 of 4)

**Acceptance Criteria**:
- [ ] DKG completes even with validator restarts
- [ ] No duplicate transcripts are submitted
- [ ] Final public key is valid and usable

**Dependencies**: Task 6.1, Task 4.2

---

### Task 6.4: Threshold Violation Test
**Status**: ❌ Not Started
**Blockers**: Task 6.1
**Estimated Effort**: 1 day

**Files**:
- `source/zapatos/testsuite/smoke-test/src/timelock/threshold_test.rs` (NEW)

**Subtasks**:
- [ ] Start swarm with 4 validators (threshold = 3)
- [ ] Kill 2 validators before they submit shares
- [ ] Verify only 2 shares are submitted
- [ ] Verify secret is NOT aggregated (threshold not met)
- [ ] Restart killed validators
- [ ] Verify late shares can still be submitted
- [ ] Verify secret aggregates once threshold is met

**Acceptance Criteria**:
- [ ] Threshold enforcement works correctly
- [ ] Partial shares don't trigger aggregation
- [ ] Late shares are accepted and contribute to threshold

**Dependencies**: Task 6.1

---

### Task 6.5: Concurrent Intervals Test
**Status**: ❌ Not Started
**Blockers**: Task 6.1
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/testsuite/smoke-test/src/timelock/concurrent_intervals.rs` (NEW)

**Subtasks**:
- [ ] Run test with very short interval (2 seconds)
- [ ] Verify multiple intervals can overlap in DKG phase
- [ ] Encrypt bids to interval N and N+1
- [ ] Verify both intervals complete DKG
- [ ] Verify both secrets are revealed at correct times
- [ ] Verify decryption works for both intervals
- [ ] Test with up to 5 concurrent intervals

**Acceptance Criteria**:
- [ ] DKG sessions don't interfere with each other
- [ ] All intervals complete successfully
- [ ] Secret reveals happen in correct order
- [ ] Resource usage is reasonable with multiple intervals

**Dependencies**: Task 6.1

---

### Task 6.6: Byzantine Validator Test
**Status**: ❌ Not Started
**Blockers**: Task 6.1
**Estimated Effort**: 2 days

**Files**:
- `source/zapatos/testsuite/smoke-test/src/timelock/byzantine_test.rs` (NEW)

**Subtasks**:
- [ ] Inject failpoint to make validator submit invalid transcript
- [ ] Verify invalid transcript is rejected by VM
- [ ] Verify DKG completes with remaining honest validators
- [ ] Inject failpoint to make validator submit wrong share
- [ ] Verify wrong share is detected and rejected
- [ ] Verify aggregation succeeds with honest shares only
- [ ] Test validator submitting duplicate shares
- [ ] Test validator submitting shares for wrong interval

**Acceptance Criteria**:
- [ ] Invalid transcripts don't break DKG
- [ ] Invalid shares are rejected
- [ ] Threshold is computed from valid shares only
- [ ] System remains live with <f Byzantine validators

**Dependencies**: Task 6.1

---

## Phase 7: Documentation and Polish (Priority: P2)

### Task 7.1: Technical Documentation
**Status**: ❌ Not Started
**Blockers**: All Phase 6 tasks
**Estimated Effort**: 2 days

**Subtasks**:
- [ ] Update `move-timelock-implementation.md` with actual implementation
- [ ] Document IBE encryption API for client developers
- [ ] Document identity format and usage
- [ ] Add sequence diagrams for DKG and reveal flows
- [ ] Document gas costs for all operations
- [ ] Add troubleshooting guide

**Dependencies**: All Phase 6 tasks

---

### Task 7.2: Client Library
**Status**: ❌ Not Started (Future)
**Blockers**: All Phase 6 tasks
**Estimated Effort**: 3-5 days

**Subtasks**:
- [ ] Create Rust client library for bid encryption
- [ ] Create TypeScript/JavaScript client library
- [ ] Add examples for encrypting bids
- [ ] Add examples for decrypting after reveal
- [ ] Publish to crates.io / npm

**Dependencies**: All Phase 6 tasks

---

## Task Dependencies Graph

```
Phase 1 (Core Crypto):
  1.1 (IBE Impl) ─┬─> 1.2 (Native Functions) ──> 1.3 (Identity Format)
                  │
Phase 2 (DKG):    │
  2.1 (Session Mgmt) <─┘
    │
    ├─> 2.2 (Transcript Submit)
    │
    └─> 2.3 (Share Submit)

Phase 3 (Move):
  3.1 (Validator Config) ──┐
  3.2 (Share Aggregation) <─┴─ 1.2
    │
    ├─> 3.3 (Auth Checks)
    │
    └─> 3.4 (Key Retrieval)

Phase 4 (Infrastructure):
  4.1 (Storage) <── 2.1
    │
    └─> 4.2 (Recovery) <── 2.1

Phase 5 (Test Infra):
  5.1 (Config Interval) ──┐
  5.2 (Test Utils) ───────┴─> Phase 6

Phase 6 (E2E Tests): [Requires ALL above]
  6.1 (Basic Flow) ──┬─> 6.2 (IBE E2E)
                     ├─> 6.3 (Restart)
                     ├─> 6.4 (Threshold)
                     ├─> 6.5 (Concurrent)
                     └─> 6.6 (Byzantine)
```

---

## Critical Path (Minimum Viable Implementation)

To get a working E2E test, focus on these tasks in order:

1. **Task 1.1**: Production IBE Implementation (3 days)
2. **Task 1.2**: Native Move Functions (2 days)
3. **Task 2.1**: Timelock DKG Session Management (4 days)
4. **Task 3.2**: Share Aggregation in Move (4 days)
5. **Task 3.1**: Validator Set Configuration (2 days)
6. **Task 5.1**: Configurable Interval (1 day)
7. **Task 6.1**: Basic Flow Test (2 days)
8. **Task 6.2**: IBE E2E Test (2 days)

**Total Critical Path**: ~20 days (4 weeks)

---

## Success Metrics

- [ ] All smoke tests pass on clean devnet
- [ ] No data races or deadlocks in concurrent DKG
- [ ] Encryption/decryption latency <50ms
- [ ] DKG completes within 1 interval even with validator restarts
- [ ] Zero secret leakage before reveal time
- [ ] System remains live with up to f Byzantine validators

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DKG doesn't complete in time | Medium | High | Add timeout and fallback to next interval |
| Threshold not met | Medium | High | Implement emergency governance reveal |
| Storage corruption | Low | High | Add checksums and backup storage |
| Consensus reorg | Low | Medium | Buffer old interval keys for reorg handling |
| Gas costs too high | Medium | Medium | Optimize native functions, batch operations |

---

## Notes

- This assumes you're keeping the existing randomness beacon DKG separate from timelock DKG
- Some tasks can be parallelized (e.g., Phase 1 and Phase 3.1)
- Actual effort may vary based on unforeseen issues
- Consider feature flags to disable timelock in production until fully tested
- May need additional tasks for mainnet deployment (audits, governance proposals, etc.)
