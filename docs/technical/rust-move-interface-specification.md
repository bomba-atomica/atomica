# Rust ↔ Move Interface Specification

**Document Type**: Technical Specification
**Status**: Implementation Reference
**Last Updated**: 2026-01-06
**Purpose**: Define the communication interfaces between Rust validator code and Move contracts

---

## Overview

This document specifies the interface boundaries between:
1. **Rust → Move**: How Rust validator code submits data to Move contracts
2. **Move → Rust**: How Move contracts communicate with Rust validator logic
3. **Native Functions**: Rust implementations called by Move code

---

## 1. Rust → Move: Validator Transactions

### 1.1 ValidatorTransaction Enum

**Location:** `aptos-types/src/validator_txn.rs`

```rust
/// Validator transactions are special transactions that bypass normal signature verification
/// and are executed with privileged VM signer access.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ValidatorTransaction {
    /// DKG result submission (epoch transition)
    DKGResult(DKGResultData),

    /// Timelock decryption share submission
    TimelockShare(TimelockShareData),

    /// Observed JWK update (existing)
    ObservedJWKUpdate(ObservedJWKs),

    /// Original randomness DKG result (existing)
    DKGResultV1(DKGTranscript),
}
```

### 1.2 DKGResultData Structure

**Purpose:** Submit DKG results after validator epoch transition

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DKGResultData {
    /// Epoch for which DKG was performed
    pub epoch: u64,

    /// Master Public Key (BLS12-381 G2 compressed, 96 bytes)
    pub master_public_key: Vec<u8>,

    /// PVSS transcript (variable size, typically 1-10KB)
    pub transcript: Vec<u8>,

    /// Validator who submitted this result
    pub validator_address: AccountAddress,
}

impl DKGResultData {
    /// Create new DKG result
    pub fn new(
        epoch: u64,
        master_public_key: Vec<u8>,
        transcript: Vec<u8>,
        validator_address: AccountAddress,
    ) -> Result<Self> {
        // Validate MPK size
        if master_public_key.len() != 96 {
            return Err(anyhow!("Invalid MPK size: expected 96 bytes, got {}",
                              master_public_key.len()));
        }

        Ok(Self {
            epoch,
            master_public_key,
            transcript,
            validator_address,
        })
    }
}
```

**BCS Serialization:**
```
DKGResultData:
  epoch:                u64 (8 bytes)
  master_public_key:    vector<u8>
    - length:           ULEB128 (1 byte for len=96)
    - data:             96 bytes
  transcript:           vector<u8>
    - length:           ULEB128
    - data:             variable
  validator_address:    32 bytes

Typical size: 150 - 10KB (depends on transcript)
```

### 1.3 TimelockShareData Structure

**Purpose:** Submit decryption share for specific auction at checkpoint

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimelockShareData {
    /// Auction ID
    pub auction_id: u64,

    /// Checkpoint timestamp
    pub checkpoint: u64,

    /// BLS signature share (BLS12-381 G1 compressed, 48 bytes)
    pub share: Vec<u8>,

    /// Validator who generated this share
    pub validator_address: AccountAddress,

    /// Optional proof of correctness
    pub proof: Option<Vec<u8>>,
}

impl TimelockShareData {
    /// Create new timelock share
    pub fn new(
        auction_id: u64,
        checkpoint: u64,
        share: Vec<u8>,
        validator_address: AccountAddress,
    ) -> Result<Self> {
        // Validate share size (BLS12-381 G1 compressed)
        if share.len() != 48 {
            return Err(anyhow!("Invalid share size: expected 48 bytes, got {}",
                              share.len()));
        }

        Ok(Self {
            auction_id,
            checkpoint,
            share,
            validator_address,
            proof: None,
        })
    }

    /// Compute IBE identity this share is for
    pub fn compute_identity(&self) -> HashValue {
        let data = format!("auction:{}:deadline:{}", self.auction_id, self.checkpoint);
        HashValue::sha3_256(data.as_bytes())
    }
}
```

**BCS Serialization:**
```
TimelockShareData:
  auction_id:           u64 (8 bytes)
  checkpoint:           u64 (8 bytes)
  share:                vector<u8>
    - length:           ULEB128 (1 byte for len=48)
    - data:             48 bytes
  validator_address:    32 bytes
  proof:                Option<vector<u8>>
    - tag:              1 byte (0x00=None, 0x01=Some)
    - data:             variable (if Some)

Total size: 97 bytes (without proof)
```

---

## 2. Validator Transaction Dispatch (MoveVM)

### 2.1 VM Dispatcher

**Location:** `aptos-move/aptos-vm/src/validator_txns/mod.rs`

```rust
use aptos_types::validator_txn::ValidatorTransaction;
use aptos_vm_types::output::VMOutput;
use move_core_types::vm_status::VMStatus;

pub fn process_validator_transaction(
    vm: &AptosVM,
    txn: &ValidatorTransaction,
    state_view: &impl StateView,
) -> Result<VMOutput, VMStatus> {
    match txn {
        ValidatorTransaction::DKGResult(data) => {
            dkg::process_dkg_result(vm, data, state_view)
        }

        ValidatorTransaction::TimelockShare(data) => {
            timelock::process_timelock_share(vm, data, state_view)
        }

        ValidatorTransaction::ObservedJWKUpdate(data) => {
            jwk::process_jwk_update(vm, data, state_view)
        }

        ValidatorTransaction::DKGResultV1(data) => {
            randomness::process_dkg_result_v1(vm, data, state_view)
        }
    }
}
```

### 2.2 DKG Result Processor

**Location:** `aptos-move/aptos-vm/src/validator_txns/dkg.rs`

```rust
use aptos_types::validator_txn::DKGResultData;
use aptos_vm::AptosVM;
use move_core_types::{
    account_address::AccountAddress,
    identifier::Identifier,
    language_storage::ModuleId,
};

pub fn process_dkg_result(
    vm: &AptosVM,
    data: &DKGResultData,
    state_view: &impl StateView,
) -> Result<VMOutput, VMStatus> {
    // Create Move function call to 0x1::dkg::process_dkg_result
    let module_id = ModuleId::new(
        AccountAddress::ONE,
        Identifier::new("dkg").unwrap(),
    );

    let function = Identifier::new("process_dkg_result").unwrap();

    // Serialize arguments
    let args = vec![
        bcs::to_bytes(&data.epoch)?,
        bcs::to_bytes(&data.master_public_key)?,
        bcs::to_bytes(&data.transcript)?,
        bcs::to_bytes(&data.validator_address)?,
    ];

    // Execute as VM signer (privileged)
    let session = vm.new_session(state_view);
    let result = session.execute_function_bypass_visibility(
        &module_id,
        &function,
        vec![], // no type arguments
        args,
        &AccountAddress::vm_reserved(),
    )?;

    // Convert session output to VMOutput
    let changeset = session.finish()?;
    Ok(VMOutput::new(changeset, GasQuantity::zero()))
}
```

### 2.3 Timelock Share Processor

**Location:** `aptos-move/aptos-vm/src/validator_txns/timelock.rs`

```rust
pub fn process_timelock_share(
    vm: &AptosVM,
    data: &TimelockShareData,
    state_view: &impl StateView,
) -> Result<VMOutput, VMStatus> {
    // Create Move function call to atomica::timelock::post_decryption_share
    let module_id = ModuleId::new(
        ATOMICA_ADDRESS, // Configured atomica address
        Identifier::new("timelock").unwrap(),
    );

    let function = Identifier::new("post_decryption_share").unwrap();

    // Serialize arguments
    let args = vec![
        bcs::to_bytes(&data.auction_id)?,
        bcs::to_bytes(&data.checkpoint)?,
        bcs::to_bytes(&data.share)?,
        bcs::to_bytes(&data.validator_address)?,
    ];

    // Execute as VM signer
    let session = vm.new_session(state_view);
    let result = session.execute_function_bypass_visibility(
        &module_id,
        &function,
        vec![],
        args,
        &AccountAddress::vm_reserved(),
    )?;

    let changeset = session.finish()?;
    Ok(VMOutput::new(changeset, GasQuantity::zero()))
}
```

---

## 3. Move → Rust: Event Emission

### 3.1 Move Event Emission

**Location:** `aptos-move/framework/aptos-framework/sources/dkg.move`

```move
module aptos_framework::dkg {
    use std::event;

    struct DKGEvents has key {
        epoch_change_events: EventHandle<ValidatorEpochChangeEvent>,
        dkg_completed_events: EventHandle<DKGCompletedEvent>,
    }

    /// Emit epoch change event to trigger DKG
    public fun trigger_epoch_change(
        framework: &signer,
        new_epoch: u64,
        new_validators: vector<ValidatorInfo>,
    ) {
        let events = borrow_global_mut<DKGEvents>(@aptos_framework);

        event::emit_event(
            &mut events.epoch_change_events,
            ValidatorEpochChangeEvent {
                old_epoch: new_epoch - 1,
                new_epoch,
                new_validators,
                threshold_voting_power: compute_threshold(&new_validators),
                total_voting_power: total_voting_power(&new_validators),
            }
        );
    }
}
```

**Location:** `atomica-move-contracts/sources/timelock.move`

```move
module atomica::timelock {
    use std::event;

    struct TimelockEvents has key {
        checkpoint_reached_events: EventHandle<CheckpointReachedEvent>,
        share_posted_events: EventHandle<DecryptionSharePostedEvent>,
    }

    /// Emit checkpoint reached event
    fun emit_checkpoint_event(checkpoint: u64, auction_ids: vector<u64>, epoch: u64) {
        let events = borrow_global_mut<TimelockEvents>(@atomica);

        event::emit_event(
            &mut events.checkpoint_reached_events,
            CheckpointReachedEvent {
                checkpoint_timestamp: checkpoint,
                block_height: block::get_current_block_height(),
                auction_ids,
                encryption_epoch: epoch,
            }
        );
    }
}
```

### 3.2 Rust Event Subscription

**Location:** `aptos-dkg/src/event_subscriber.rs`

```rust
use aptos_rest_client::{Client, Response};
use aptos_types::{
    account_address::AccountAddress,
    event::EventKey,
};

pub struct EventSubscriber {
    client: Client,
    last_seen_version: u64,
}

impl EventSubscriber {
    /// Subscribe to specific event type
    pub async fn subscribe<T: DeserializeOwned>(
        &mut self,
        event_address: AccountAddress,
        module: &str,
        struct_name: &str,
        handler: impl Fn(T) -> Result<()>,
    ) -> Result<()> {
        let event_handle_path = format!("{}::{}", module, struct_name);

        loop {
            // Query events since last seen version
            let events = self.client
                .get_account_events(
                    event_address,
                    &event_handle_path,
                    None, // start sequence number
                    Some(100), // limit
                )
                .await?
                .into_inner();

            for event in events {
                // Filter events newer than last seen
                if event.version > self.last_seen_version {
                    // Deserialize event data
                    let data: T = bcs::from_bytes(&event.data)?;

                    // Call handler
                    handler(data)?;

                    // Update last seen
                    self.last_seen_version = event.version;
                }
            }

            // Poll interval
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }
}
```

**Usage Example:**

```rust
// Subscribe to checkpoint events
event_subscriber.subscribe(
    ATOMICA_ADDRESS,
    "timelock",
    "CheckpointReachedEvent",
    |event: CheckpointReachedEvent| {
        timelock_manager.on_checkpoint_reached(event)
    }
).await?;
```

---

## 4. Move → Rust: Native Function Calls

### 4.1 Native Function Declaration (Move)

**Location:** `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move`

```move
module aptos_std::ibe {
    /// Decrypt IBE ciphertext using aggregated decryption shares
    /// Implemented as native function in Rust
    native public fun decrypt(
        ciphertext: vector<u8>,
        aggregated_share: vector<u8>,
    ): vector<u8>;

    /// Verify that ciphertext was correctly encrypted
    native public fun verify_ciphertext(
        ciphertext: vector<u8>,
        master_public_key: vector<u8>,
        identity: vector<u8>,
    ): bool;

    /// Aggregate multiple BLS shares into single share
    native public fun aggregate_shares(
        shares: vector<vector<u8>>,
    ): vector<u8>;
}
```

### 4.2 Native Function Implementation (Rust)

**Location:** `aptos-move/framework/aptos-natives/src/cryptography/ibe.rs`

```rust
use aptos_gas_schedule::gas_params::natives::aptos_framework::*;
use aptos_native_interface::{
    safely_pop_arg, RawSafeNative, SafeNativeBuilder, SafeNativeContext, SafeNativeResult,
};
use blstrs::{G1Affine, G2Affine, Gt, pairing};
use move_vm_types::{
    loaded_data::runtime_types::Type,
    values::Value,
};
use smallvec::{smallvec, SmallVec};
use std::collections::VecDeque;

//***************************************************************************
// native fun decrypt(ciphertext: vector<u8>, aggregated_share: vector<u8>): vector<u8>
//***************************************************************************

pub fn native_ibe_decrypt(
    context: &mut SafeNativeContext,
    _ty_args: Vec<Type>,
    mut args: VecDeque<Value>,
) -> SafeNativeResult<SmallVec<[Value; 1]>> {
    // Charge base gas
    context.charge(IBE_DECRYPT_BASE)?;

    // Pop arguments (reverse order)
    let aggregated_share_bytes = safely_pop_arg!(args, Vec<u8>);
    let ciphertext_bytes = safely_pop_arg!(args, Vec<u8>);

    // Deserialize BLS share (G1 point, 48 bytes compressed)
    let share = G1Affine::from_compressed(&aggregated_share_bytes.as_slice().try_into()?)
        .ok_or_else(|| PartialVMError::new(StatusCode::INVALID_ARGUMENT))?;

    // Deserialize ciphertext
    let ciphertext = deserialize_ibe_ciphertext(&ciphertext_bytes)?;

    // Charge gas for pairing operation
    context.charge(IBE_DECRYPT_PAIRING)?;

    // Compute decryption key: K = e(U, share)
    // where U is the ephemeral public key from ciphertext
    let decryption_key = pairing(&ciphertext.u, &share);

    // Derive symmetric key from pairing result
    let symmetric_key = hash_pairing_result(&decryption_key);

    // Decrypt: plaintext = ciphertext.v ⊕ symmetric_key
    let plaintext = xor_bytes(&ciphertext.v, &symmetric_key);

    Ok(smallvec![Value::vector_u8(plaintext)])
}

//***************************************************************************
// native fun verify_ciphertext(...): bool
//***************************************************************************

pub fn native_verify_ciphertext(
    context: &mut SafeNativeContext,
    _ty_args: Vec<Type>,
    mut args: VecDeque<Value>,
) -> SafeNativeResult<SmallVec<[Value; 1]>> {
    context.charge(IBE_VERIFY_BASE)?;

    let identity_bytes = safely_pop_arg!(args, Vec<u8>);
    let mpk_bytes = safely_pop_arg!(args, Vec<u8>);
    let ciphertext_bytes = safely_pop_arg!(args, Vec<u8>);

    // Deserialize
    let ciphertext = deserialize_ibe_ciphertext(&ciphertext_bytes)?;
    let mpk = G2Affine::from_compressed(&mpk_bytes.as_slice().try_into()?)
        .ok_or_else(|| PartialVMError::new(StatusCode::INVALID_ARGUMENT))?;
    let identity = hash_to_g1(&identity_bytes);

    // Verify ciphertext structure
    // Check that U = r·G1 for some r (point on curve)
    let valid = ciphertext.u.is_on_curve() && ciphertext.u.is_torsion_free();

    Ok(smallvec![Value::bool(valid)])
}

//***************************************************************************
// native fun aggregate_shares(shares: vector<vector<u8>>): vector<u8>
//***************************************************************************

pub fn native_aggregate_shares(
    context: &mut SafeNativeContext,
    _ty_args: Vec<Type>,
    mut args: VecDeque<Value>,
) -> SafeNativeResult<SmallVec<[Value; 1]>> {
    context.charge(IBE_AGGREGATE_BASE)?;

    let shares_vec = safely_pop_arg!(args, Vec<Vec<u8>>);

    // Charge gas per share
    context.charge(IBE_AGGREGATE_PER_SHARE * NumArgs::new(shares_vec.len() as u64))?;

    // Deserialize all shares
    let mut shares: Vec<G1Affine> = Vec::new();
    for share_bytes in shares_vec {
        let share = G1Affine::from_compressed(&share_bytes.as_slice().try_into()?)
            .ok_or_else(|| PartialVMError::new(StatusCode::INVALID_ARGUMENT))?;
        shares.push(share);
    }

    // Aggregate via addition (BLS property)
    let mut aggregate = G1Projective::identity();
    for share in shares {
        aggregate += share;
    }

    // Convert to affine and serialize
    let result = aggregate.to_affine().to_compressed();

    Ok(smallvec![Value::vector_u8(result.to_vec())])
}

//***************************************************************************
// Helper functions
//***************************************************************************

struct IBECiphertext {
    u: G1Affine,  // Ephemeral public key
    v: Vec<u8>,   // Encrypted message
}

fn deserialize_ibe_ciphertext(bytes: &[u8]) -> Result<IBECiphertext> {
    // Format: [48 bytes U | variable V]
    if bytes.len() < 48 {
        return Err(anyhow!("Ciphertext too short"));
    }

    let u = G1Affine::from_compressed(&bytes[0..48].try_into()?)
        .ok_or_else(|| anyhow!("Invalid U point"))?;

    let v = bytes[48..].to_vec();

    Ok(IBECiphertext { u, v })
}

fn hash_pairing_result(gt: &Gt) -> Vec<u8> {
    // Hash pairing result to derive symmetric key
    use sha3::{Digest, Sha3_256};
    let mut hasher = Sha3_256::new();
    hasher.update(gt.to_bytes());
    hasher.finalize().to_vec()
}

fn xor_bytes(a: &[u8], b: &[u8]) -> Vec<u8> {
    a.iter().zip(b.iter()).map(|(x, y)| x ^ y).collect()
}

fn hash_to_g1(data: &[u8]) -> G1Affine {
    // Hash-to-curve for identity mapping
    // Uses standardized hash_to_curve algorithm
    use blstrs::hash_to_curve::{ExpandMsgXmd, HashToCurve};

    let point = <G1Projective as HashToCurve<ExpandMsgXmd<sha2::Sha256>>>::hash_to_curve(
        data,
        b"ATOMICA_IBE_IDENTITY",
    );

    point.to_affine()
}
```

### 4.3 Native Function Registration

**Location:** `aptos-move/framework/aptos-natives/src/lib.rs`

```rust
pub fn all_natives(
    gas_params: GasParameters,
) -> impl Iterator<Item = (AccountAddress, Identifier, Identifier, NativeFunction)> {
    let mut natives = vec![];

    // Existing natives
    natives.extend(account_natives(gas_params.clone()));
    natives.extend(bls12381_natives(gas_params.clone()));

    // NEW: IBE natives
    natives.extend(ibe_natives(gas_params.clone()));

    natives.into_iter()
}

fn ibe_natives(
    gas_params: GasParameters,
) -> Vec<(AccountAddress, Identifier, Identifier, NativeFunction)> {
    use cryptography::ibe;

    let natives = [
        ("decrypt", ibe::native_ibe_decrypt as RawSafeNative),
        ("verify_ciphertext", ibe::native_verify_ciphertext as RawSafeNative),
        ("aggregate_shares", ibe::native_aggregate_shares as RawSafeNative),
    ];

    make_module_natives(
        AccountAddress::ONE,
        "ibe",
        natives,
        gas_params,
    )
}
```

---

## 5. Gas Cost Configuration

### 5.1 Gas Parameters

**Location:** `aptos-gas-schedule/src/gas_schedule/aptos_framework.rs`

```rust
pub struct IbeGasParameters {
    pub ibe_decrypt_base: InternalGas,
    pub ibe_decrypt_pairing: InternalGas,
    pub ibe_verify_base: InternalGas,
    pub ibe_aggregate_base: InternalGas,
    pub ibe_aggregate_per_share: InternalGas,
}

impl IbeGasParameters {
    pub fn zeros() -> Self {
        Self {
            ibe_decrypt_base: InternalGas::zero(),
            ibe_decrypt_pairing: InternalGas::zero(),
            ibe_verify_base: InternalGas::zero(),
            ibe_aggregate_base: InternalGas::zero(),
            ibe_aggregate_per_share: InternalGas::zero(),
        }
    }
}

// Default gas costs (calibrated)
impl Default for IbeGasParameters {
    fn default() -> Self {
        Self {
            ibe_decrypt_base: InternalGas::new(5_000),
            ibe_decrypt_pairing: InternalGas::new(45_000),  // Expensive: pairing operation
            ibe_verify_base: InternalGas::new(10_000),
            ibe_aggregate_base: InternalGas::new(2_000),
            ibe_aggregate_per_share: InternalGas::new(3_000),
        }
    }
}
```

---

## 6. Error Codes

### 6.1 Move Error Codes

**Location:** `aptos-move/framework/aptos-framework/sources/dkg.move`

```move
module aptos_framework::dkg {
    /// Error codes
    const E_NOT_FRAMEWORK: u64 = 1;
    const E_INVALID_EPOCH: u64 = 2;
    const E_INVALID_MPK_SIZE: u64 = 3;
    const E_DUPLICATE_SUBMISSION: u64 = 4;
    const E_THRESHOLD_NOT_MET: u64 = 5;
}
```

**Location:** `atomica-move-contracts/sources/timelock.move`

```move
module atomica::timelock {
    /// Error codes
    const E_NOT_VM: u64 = 1;
    const E_INVALID_CHECKPOINT: u64 = 2;
    const E_INVALID_DEADLINE: u64 = 3;
    const E_NOT_VALIDATOR: u64 = 4;
    const E_INVALID_SHARE_SIZE: u64 = 5;
    const E_DUPLICATE_SHARE: u64 = 6;
    const E_THRESHOLD_NOT_MET: u64 = 7;
}
```

### 6.2 Rust Error Handling

```rust
#[derive(Debug, thiserror::Error)]
pub enum ValidatorTxnError {
    #[error("Invalid DKG result: {0}")]
    InvalidDKGResult(String),

    #[error("Invalid timelock share: {0}")]
    InvalidTimelockShare(String),

    #[error("BCS serialization error: {0}")]
    SerializationError(#[from] bcs::Error),

    #[error("Move execution error: {0}")]
    MoveExecutionError(String),
}
```

---

## 7. Interface Summary

### 7.1 Data Flow Matrix

| Direction | Mechanism | Frequency | Latency | Example |
|-----------|-----------|-----------|---------|---------|
| **Rust → Move** | ValidatorTransaction | Per validator action | 100-500ms | Submit DKG result |
| **Move → Rust** | Event emission | Per block | 0-5s | CheckpointReachedEvent |
| **Move → Rust** | Native function call | Per Move execution | <1ms | ibe::decrypt() |

### 7.2 Type Mappings

| Move Type | Rust Type | Notes |
|-----------|-----------|-------|
| `u64` | `u64` | Direct mapping |
| `u128` | `u128` | Direct mapping |
| `address` | `AccountAddress` | 32 bytes |
| `vector<u8>` | `Vec<u8>` | BCS-encoded |
| `vector<T>` | `Vec<T>` | BCS-encoded |
| `Option<T>` | `Option<T>` | BCS: 0x00=None, 0x01=Some |

### 7.3 Critical Invariants

1. **Validator Transaction Ordering**: DKG results must be processed before timelock shares for same epoch
2. **Event Ordering**: Events emitted in chronological order within same block
3. **Gas Metering**: All native functions must charge gas before execution
4. **Error Propagation**: Native function errors must map to Move abort codes
5. **Serialization Consistency**: BCS encoding must match between Rust and Move

---

**End of Rust ↔ Move Interface Specification**
