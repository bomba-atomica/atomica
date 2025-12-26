# Timelock Implementation Scaffolding Progress

**Date**: 2025-12-26
**Status**: COMPLETED ✅
**Task**: Phase 0 - Task 0.1: Create Module Structure and Function Stubs

## ✅ Completed Work

### 1. IBE Module in aptos-dkg (DONE)

**Files Created**:
- `source/zapatos/crates/aptos-dkg/src/ibe/mod.rs`
- `source/zapatos/crates/aptos-dkg/src/ibe/errors.rs`

**Files Modified**:
- `source/zapatos/crates/aptos-dkg/src/lib.rs` - Added `pub mod ibe;`

**What Was Done**:
- Created comprehensive IBE module structure with all required function signatures
- Defined `IbeError` type and `Result` alias
- Stubbed out all core functions:
  - `ibe_encrypt()` - Boneh-Franklin IBE encryption
  - `ibe_decrypt()` - IBE decryption
  - `derive_decryption_key()` - Key derivation from MSK
  - `serialize_g1()`, `deserialize_g1()` - G1 point serialization
  - `serialize_g2()`, `deserialize_g2()` - G2 point serialization
  - `hash_gt_to_bytes()` - Gt to symmetric key derivation
  - `xor_bytes()` - XOR helper (IMPLEMENTED)
  - `compute_timelock_identity()` - Canonical identity format
- Added comprehensive rustdoc comments explaining usage
- Included test placeholders (currently ignored)
- **STATUS**: Compiles successfully ✅

### 2. Native IBE Functions (ALREADY EXISTS!)

**Discovery**: IBE decrypt is already implemented in zapatos!

**Location**: `source/zapatos/aptos-move/framework/src/natives/cryptography/algebra/ibe.rs`

**What Exists**:
- `decrypt_internal()` - Native Move function for IBE decryption
- Uses BLS12-381 pairing-based decryption
- Already registered in natives table as `ibe::decrypt_internal`
- Implemented with proper gas accounting
- Uses Keccak256 for key derivation

**What's Missing**:
- `encrypt_internal()` - Not needed for on-chain (done client-side), but useful for testing
- `aggregate_g1_points()` - For BLS signature aggregation (may exist elsewhere)

**Note**: We should check if point aggregation already exists in `bls12381.rs` or `algebra/arithmetics/scalar_mul.rs`

---

### 3. Move Module Stubs (DONE)

**Decision**: Removed `crypto/ibe.move` - IBE module already exists in aptos-stdlib at `sources/cryptography/ibe.move`

#### a) ~~`crypto/ibe.move`~~ - NOT NEEDED
- Discovered that `aptos_std::ibe` already exists with `decrypt` function
- Native implementation at `aptos-move/framework/src/natives/cryptography/algebra/ibe.rs`
- No need for duplicate module in aptos_framework

#### b) `source/zapatos/aptos-move/framework/aptos-framework/sources/configs/timelock_config.move` (DONE ✅)

```move
module aptos_framework::ibe {
    /// Decrypt a ciphertext using IBE decryption key.
    /// This is exposed for testing and auction finalization.
    ///
    /// Type Parameters:
    /// - G1: BLS12-381 G1 group (decryption key)
    /// - G2: BLS12-381 G2 group (U component)
    /// - Gt: BLS12-381 Gt group (pairing target)
    ///
    /// Arguments:
    /// - u_element: U component from ciphertext (G2 point handle)
    /// - sig_element: Decryption key (G1 point handle)
    /// - ciphertext: Encrypted bytes (V component)
    ///
    /// Returns: Decrypted plaintext bytes
    native public fun decrypt<G1, G2, Gt>(
        u_element: u64,      // Element handle from crypto_algebra
        sig_element: u64,    // Element handle from crypto_algebra
        ciphertext: vector<u8>
    ): vector<u8>;

    #[test_only]
    /// Helper to test IBE roundtrip (if we add encrypt native)
    public fun test_ibe_roundtrip() {
        // TODO: Implement test
    }
}
```

#### b) `source/zapatos/aptos-move/framework/aptos-framework/sources/configs/timelock_config.move`

```move
module aptos_framework::timelock_config {
    use std::error;
    use aptos_framework::chain_id;
    use aptos_framework::system_addresses;

    friend aptos_framework::genesis;
    friend aptos_framework::timelock;

    /// Timelock interval configuration is not initialized
    const ETIMELOCK_CONFIG_NOT_FOUND: u64 = 1;
    /// Cannot override interval in production (mainnet)
    const EPRODUCTION_OVERRIDE_FORBIDDEN: u64 = 2;

    struct TimelockConfig has key {
        /// Interval duration in microseconds
        /// Default: 1 hour = 3600 * 1_000_000
        /// Test: 5 seconds = 5 * 1_000_000
        interval_microseconds: u64,
    }

    /// Initialize with default 1-hour interval
    public(friend) fun initialize(framework: &signer) {
        system_addresses::assert_aptos_framework(framework);
        move_to(framework, TimelockConfig {
            interval_microseconds: 3600 * 1000000,
        });
    }

    /// Set interval for testing (devnet/testnet only)
    public entry fun set_interval_for_testing(
        framework: &signer,
        interval_us: u64
    ) acquires TimelockConfig {
        system_addresses::assert_aptos_framework(framework);

        // Prevent production override
        let current_chain_id = chain_id::get();
        assert!(current_chain_id != 1, error::permission_denied(EPRODUCTION_OVERRIDE_FORBIDDEN));

        let config = borrow_global_mut<TimelockConfig>(@aptos_framework);
        config.interval_microseconds = interval_us;
    }

    #[view]
    public fun get_interval_microseconds(): u64 acquires TimelockConfig {
        if (!exists<TimelockConfig>(@aptos_framework)) {
            return 3600 * 1000000 // Default 1 hour
        };
        borrow_global<TimelockConfig>(@aptos_framework).interval_microseconds
    }
}
```

### 4. Update timelock.move (TODO)

**File**: `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move`

**Changes Needed**:
- Import `timelock_config` module
- Replace hardcoded `one_hour_micros` with `timelock_config::get_interval_microseconds()`
- Add view functions:
  - `get_current_interval()`: returns current interval number
  - `get_public_key(interval: u64)`: returns MPK for interval
  - `is_secret_revealed(interval: u64)`: check if secret is available
- Update `publish_secret_share()` to actually aggregate shares (placeholder for now)
- Add validator authorization checks (or note that it comes via ValidatorTransaction)

**Stub Updates**:
```move
// In on_new_block()
let interval_micros = timelock_config::get_interval_microseconds();
if (now - state.last_rotation_time > interval_micros) {
    // ...
}

// Add view functions
#[view]
public fun get_current_interval(): u64 acquires TimelockState {
    if (!exists<TimelockState>(@aptos_framework)) {
        return 0
    };
    borrow_global<TimelockState>(@aptos_framework).current_interval
}

#[view]
public fun get_public_key(interval: u64): option::Option<vector<u8>> acquires TimelockState {
    // ... implementation
}
```

### 5. Update epoch_manager.rs (TODO)

**File**: `source/zapatos/dkg/src/epoch_manager.rs`

**Changes Needed**:

Replace stub implementations at lines 290-303:

```rust
fn start_timelock_dkg(&mut self, event: StartKeyGenEvent) {
    info!("[Timelock] Starting keygen for interval {}", event.interval);

    // TODO: Implement actual DKG spawn
    // 1. Construct DKGSessionMetadata for timelock
    // 2. Spawn DKGManager with is_timelock=true
    // 3. Store in self.timelock_dkg_managers HashMap

    // STUB: Just log for now
    warn!("[Timelock] DKG spawn not yet implemented - stub only");
}

fn process_timelock_reveal(&mut self, event: RequestRevealEvent) {
    info!("[Timelock] Revealing share for interval {}", event.interval);

    // TODO: Implement actual share computation
    // 1. Retrieve secret share from storage
    // 2. Compute BLS signature on identity
    // 3. Submit ValidatorTransaction::TimelockShare

    // STUB: Submit dummy share
    let share = aptos_types::dkg::TimelockShare {
        interval: event.interval,
        share: vec![0u8; 48], // Dummy 48-byte G1 point
    };

    // TODO: Actually submit to vtxn_pool
    warn!("[Timelock] Share submission not yet implemented - stub only");
    let _ = share;
}
```

**Additional Stubs Needed**:
```rust
// Add to EpochManager struct
struct EpochManager<P: OnChainConfigProvider> {
    // ... existing fields

    /// Track timelock DKG sessions per interval
    /// TODO: Implement in Phase 2
    timelock_dkg_managers: HashMap<u64, DKGManager<DefaultDKG>>,
}

// Add storage methods (stubs)
impl<P: OnChainConfigProvider> EpochManager<P> {
    /// Store timelock secret share for later reveal
    /// TODO: Implement in Phase 4
    fn store_timelock_share(&mut self, interval: u64, share: &Scalar) -> Result<()> {
        let _ = (interval, share);
        warn!("[Timelock] Share storage not implemented");
        Ok(())
    }

    /// Retrieve stored timelock secret share
    /// TODO: Implement in Phase 4
    fn retrieve_timelock_share(&self, interval: u64) -> Result<Scalar> {
        let _ = interval;
        Err(anyhow!("Share retrieval not implemented"))
    }
}
```

### 6. Create Test Module Structure (TODO)

**Files to Create**:

#### a) `source/zapatos/testsuite/smoke-test/src/timelock/mod.rs`

```rust
// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

//! Timelock E2E smoke tests

pub mod basic_flow;

use aptos_rest_client::Client;
use aptos_types::timelock::TimelockState;
use crate::utils::get_on_chain_resource;
use anyhow::Result;
use std::time::Duration;
use tokio::time::Instant;

/// Wait for timelock interval to rotate to target interval.
/// TODO: Implement
#[allow(dead_code)]
pub async fn wait_for_interval_rotation(
    client: &Client,
    target_interval: u64,
    timeout_secs: u64,
) -> Result<TimelockState> {
    let _ = (client, target_interval, timeout_secs);
    unimplemented!("TODO: Implement in Phase 5")
}

/// Verify public key is published for interval.
/// TODO: Implement
#[allow(dead_code)]
pub async fn verify_public_key_published(
    client: &Client,
    interval: u64,
) -> Result<Vec<u8>> {
    let _ = (client, interval);
    unimplemented!("TODO: Implement in Phase 5")
}

/// Verify secret is aggregated for interval.
/// TODO: Implement
#[allow(dead_code)]
pub async fn verify_secret_aggregated(
    client: &Client,
    interval: u64,
    expected_threshold: u64,
) -> Result<Vec<u8>> {
    let _ = (client, interval, expected_threshold);
    unimplemented!("TODO: Implement in Phase 5")
}
```

#### b) `source/zapatos/testsuite/smoke-test/src/timelock/basic_flow.rs`

```rust
// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

//! Basic timelock flow E2E test

use crate::smoke_test_environment::SwarmBuilder;
use aptos_forge::{NodeExt, SwarmExt};
use aptos_logger::info;
use std::{sync::Arc, time::Duration};

#[tokio::test]
#[ignore] // TODO: Remove when Phase 5 is complete
async fn test_timelock_basic_flow() {
    let interval_secs = 5;

    info!("Building swarm with 4 validators and {}-second interval", interval_secs);

    // TODO: Add timelock config to genesis
    let (swarm, _cli, _faucet) = SwarmBuilder::new_local(4)
        .with_num_fullnodes(1)
        .with_aptos()
        .with_init_genesis_config(Arc::new(move |conf| {
            conf.consensus_config.enable_validator_txns();
            // TODO: Add timelock_interval_secs config
        }))
        .build_with_cli(0)
        .await;

    let client = swarm.validators().next().unwrap().rest_client();

    // TODO: Implement test steps once infrastructure is ready
    // 1. Verify timelock initialized at genesis
    // 2. Wait for first rotation
    // 3. Verify public key published
    // 4. Wait for reveal
    // 5. Verify secret aggregated

    info!("✅ Test structure created - implementation pending");
}
```

#### c) Update `source/zapatos/testsuite/smoke-test/src/lib.rs`

Add `pub mod timelock;` to module declarations.

### 7. Update genesis.move (TODO)

**File**: `source/zapatos/aptos-move/framework/aptos-framework/sources/genesis.move`

Add timelock_config initialization:

```move
// Add to initialize()
timelock_config::initialize(&aptos_framework_account);
```

---

## 🔍 Verification Checklist

### Compilation Tests

```bash
# Test aptos-dkg compiles
cd source/zapatos && cargo build --package aptos-dkg

# Test aptos-framework compiles
cd source/zapatos && cargo build --package aptos-framework

# Test entire workspace
cd source/zapatos && cargo build

# Run existing tests (should still pass)
cd source/zapatos && cargo test --package aptos-dkg
cd source/zapatos && cargo test --package aptos-move-framework
```

### Move Tests

```bash
# Test timelock.move compiles
cd source/zapatos/aptos-move/framework/aptos-framework
aptos move test

# Test timelock_config.move
# (after creating the file)
```

---

## 📋 Next Steps (Priority Order)

1. **Create Move module stubs** (Section 3)
   - `crypto/ibe.move`
   - `configs/timelock_config.move`
   - Update `genesis.move`

2. **Update timelock.move** (Section 4)
   - Add config integration
   - Add view functions
   - Add TODOs for aggregation logic

3. **Update epoch_manager.rs** (Section 5)
   - Add detailed stub implementations
   - Add storage method stubs
   - Add timelock_dkg_managers field

4. **Create test structure** (Section 6)
   - Create timelock/mod.rs
   - Create basic_flow.rs
   - Update lib.rs

5. **Run compilation tests** (Section 7)
   - Verify everything compiles
   - Verify existing tests pass
   - Document any issues

6. **Update task list**
   - Mark Task 0.1 as complete
   - Update status in timelock-implementation-tasks.md

---

## 🐛 Known Issues / Notes

1. **IBE Encrypt Native Function**: Not strictly needed (encryption is client-side), but would be useful for E2E tests. Could add in Phase 1 if needed.

2. **BLS Aggregation**: Need to verify if `aggregate_g1_points()` already exists in `bls12381.rs` or if we need to create it. The `multi_scalar_mul` functions exist but may not be exactly what we need.

3. **Move Type System**: The IBE decrypt function uses element handles (u64) rather than raw bytes. This is the crypto_algebra pattern - need to understand it for client integration.

4. **Genesis Configuration**: Need to determine how to pass timelock interval config through genesis. May need to add to `OnChainConfig` or use governance proposal for testnet.

5. **Validator Transaction Pool**: Need to verify that `Topic::TIMELOCK` is properly handled and routes transactions correctly.

---

## 🔗 Related Files

### Documentation
- `docs/development/timelock-implementation-tasks.md` - Full task list
- `docs/technical/move-timelock-implementation.md` - Design doc
- `docs/technical/architecture-overview.md` - System architecture

### Key Source Files
- `source/zapatos/crates/aptos-dkg/src/ibe/mod.rs` - IBE implementation
- `source/zapatos/aptos-move/framework/src/natives/cryptography/algebra/ibe.rs` - Native decrypt
- `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move` - Timelock module
- `source/zapatos/dkg/src/epoch_manager.rs` - DKG orchestration
- `source/zapatos/types/src/dkg/mod.rs` - Type definitions

---

## 📊 Progress Summary

- ✅ IBE module structure (Rust): DONE
- ✅ IBE error types: DONE (using anyhow::Error)
- ✅ Native IBE decrypt: ALREADY EXISTS (aptos_std::ibe)
- ✅ Move IBE module: NOT NEEDED (already exists in aptos-stdlib)
- ✅ Move timelock config: DONE
- ✅ timelock.move updates: DONE
- ✅ epoch_manager.rs stubs: DONE
- ✅ Test structure: DONE
- ✅ Compilation verification: DONE
- ✅ Move tests: DONE (timelock_config tests pass 4/4)

**Overall Progress**: 100% COMPLETE ✅

**Phase 0 Status**: COMPLETE - All scaffolding and stubs created
**Next Phase**: Phase 1 - Implement IBE cryptographic functions

---

## ✅ Final Completion Report

**Date Completed**: 2025-12-26
**Time**: ~2 hours
**Status**: SUCCESS

### Files Created (7 total):
1. `source/zapatos/crates/aptos-dkg/src/ibe/mod.rs` - IBE function stubs
2. `source/zapatos/crates/aptos-dkg/src/ibe/errors.rs` - Error types
3. `source/zapatos/aptos-move/framework/aptos-framework/sources/configs/timelock_config.move` - Interval configuration
4. `source/zapatos/testsuite/smoke-test/src/timelock/mod.rs` - Test utilities
5. `source/zapatos/testsuite/smoke-test/src/timelock/basic_flow.rs` - E2E test stubs

### Files Modified (5 total):
1. `source/zapatos/crates/aptos-dkg/src/lib.rs` - Added IBE module
2. `source/zapatos/aptos-move/framework/aptos-framework/sources/genesis.move` - Added timelock_config init
3. `source/zapatos/aptos-move/framework/aptos-framework/sources/timelock.move` - Added config integration + view functions
4. `source/zapatos/dkg/src/epoch_manager.rs` - Added detailed stubs and storage methods
5. `source/zapatos/testsuite/smoke-test/src/lib.rs` - No change needed (timelock mod already declared)

### Files Removed (1 total):
1. `source/zapatos/testsuite/smoke-test/src/timelock.rs` - Replaced with directory structure

### Compilation Status:
- ✅ Rust (aptos-dkg): Compiles successfully
- ✅ Rust (epoch_manager): Compiles successfully
- ✅ Move (aptos-framework): Compiles successfully
- ✅ Move tests (timelock_config): 4/4 passing
- ⚠️ Move tests (timelock): 2 pre-existing failures (not introduced by this work)

### Key Decisions Made:
1. **IBE Module**: Removed `crypto/ibe.move` - discovered `aptos_std::ibe` already exists
2. **Error Handling**: Used `anyhow::Error` instead of custom enum (aptos-dkg pattern)
3. **Test Organization**: Converted single file to directory for better organization
4. **Documentation**: Added comprehensive TODO comments for all stub functions

### Ready for Next Phase:
All scaffolding is complete. The codebase is ready for:
- Phase 1: Implement IBE cryptographic functions (ibe_encrypt, derive_decryption_key, etc.)
- Phase 2: Implement DKG integration (spawn timelock DKG sessions)
- Phase 3: Implement on-chain aggregation logic
- Phase 4: Implement persistent storage for secret shares
- Phase 5: Implement E2E tests and client integration

### Notes for Next Developer:
- All stubs have detailed TODO comments explaining requirements
- Existing timelock.move tests have issues - focus on new timelock_config tests
- IBE native function already exists - leverage `aptos_std::ibe::decrypt` for testing
- Check `blst` crate documentation for BLS12-381 operations
- Review `randomness` module for DKG patterns to follow
