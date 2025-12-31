# Timelock Encryption Implementation Plan (Aptos v1.38 PoC)

## 1. Overview
This document outlines the implementation of a **Timelock Encryption** protocol on Aptos v1.38. The goal is to verify timed secrets (e.g., for sealed-bid auctions) where a secret key is generated, used for encryption by users, and then verified/revealed by validators after a fixed duration (1 hour heartbeat).

## 2. Architecture

The system consists of two layers:
1.  **Move Layer (On-Chain)**: Manages the lifecycle of keys, triggers key generation, and stores revealed keys.
2.  **Rust Layer (Validator Node)**: Listens to on-chain events to perform off-chain cryptography (DKG) and submit results.

### 2.0 IBE Cryptography Architecture

**Key Design Decision**: IBE operations are implemented in Rust, not Move.

| Operation | Where | Implementation |
|-----------|-------|----------------|
| **IBE Encrypt** | Client-side (off-chain) | Rust: `aptos_dkg::ibe::ibe_encrypt()` |
| **IBE Decrypt** | Client-side OR on-chain | Rust native function: `aptos_std::ibe::decrypt()` |

**Rationale**:
- **Encryption is ALWAYS client-side**: Users encrypt their bids/data locally before submitting 
  ciphertexts to the chain. There is no use case for on-chain encryption.
- **Decryption uses a Rust native function**: The Move VM calls into Rust code (passthrough opcode) 
  for cryptographic operations. This is primarily used for **key verification** - proving that a 
  revealed decryption key correctly decrypts a ciphertext (e.g., for auction dispute resolution).
- Complex BLS12-381 pairing operations exceed Move's computational limits and are more efficiently 
  implemented in native Rust.

### 2.1 The "Heartbeat" Flow
We implement a recurring 1-hour "Epoch" (distinct from the Aptos consensus epoch).

1.  **T = 0**: System initializes.
2.  **T = 1 hr**:
    *   **Reveal**: Validators reveal the secret key for Interval 0.
    *   **Rotate**: Validators begin DKG for Interval 1.
3.  **T = 2 hr**:
    *   **Reveal**: Validators reveal key for Interval 1.
    *   **Rotate**: Start DKG for Interval 2.

## 3. Move Specification (`sources/timelock.move`)

We will introduce a new module `0x1::timelock`.

### Data Structures

```move
struct TimelockState has key {
    current_interval: u64,
    last_rotation_time: u64,
    // Store public keys (for encryption)
    public_keys: Table<u64, vector<u8>>, 
    // Store revealed secret keys/signatures (for decryption)
    revealed_secrets: Table<u64, vector<u8>>,
}

struct TimelockConfig has copy, drop, store {
    threshold: u64,
    total_validators: u64,
}
```

### Events

```move
/// Event emitted to tell validators: "Please generate keys for interval X"
struct StartKeyGenEvent has drop, store {
    interval: u64,
    config: TimelockConfig,
    participants: vector<address>,
}

/// Event emitted to tell validators: "Please reveal the secret for interval X"
struct RequestRevealEvent has drop, store {
    interval: u64,
}
```

### Public Functions

1.  **`initialize(framework: &signer)`**:
    *   Sets up the `TimelockState`.
    *   Called during genesis or via governance proposal.

2.  **`on_new_block(vm: &signer)`**:
    *   Called by `0x1::block` (requires patching `block.move`).
    *   Checks `if (timestamp::now_microseconds() - state.last_rotation_time > 1 hour)`:
        *   Increment `current_interval`.
        *   Emit `StartKeyGenEvent(new_interval)`.
        *   Emit `RequestRevealEvent(old_interval)`.

3.  **`publish_public_key(validator: &signer, interval: u64, pk: vector<u8>)`**:
    *   Validators call this after finishing the DKG.
    *   Once enough validators agree (or the dealer posts the transcript), the PK is stored.

4.  **`publish_secret_share(validator: &signer, interval: u64, share: vector<u8>)`**:
    *   Validators call this in response to `RequestRevealEvent`.
    *   The contract aggregates these shares (using native generic BLS arithmetic if available, or just storing them for off-chain reconstruction).

## 4. Rust Specification (Validator Changes)

The existing `aptos-dkg` manager listens for `DKGStartEvent`. We must implement a parallel listener or extend the existing one.

### `dkg_manager.rs` Extensions

1.  **Event Subscription**:
    *   Subscribe to `0x1::timelock::StartKeyGenEvent`.
    *   Subscribe to `0x1::timelock::RequestRevealEvent`.

2.  **Handlers**:
    *   **On `StartKeyGenEvent`**:
        *   Trigger the `aptos-dkg` crate to run a *new* DKG session with a specific "Timelock" application ID.
        *   Produce `Public Parameters` (MPK).
        *   Submit `0x1::timelock::publish_public_key`.
    *   **On `RequestRevealEvent`**:
        *   Access the local secret share for that interval.
        *   Compute the decryption share (or checking signature) on the identity `interval_ID`.
        *   Submit `0x1::timelock::publish_secret_share`.

## 5. Feasibility Note
*   **Pure Move?**: No. The validators *must* run complex off-chain cryptography (DKG dealing/verification) that exceeds Move's gas limits and requires private local state (their master keys).
*   **Validator Patching**: We must patch specifically `aptos-node` / `consensus` / `dkg-runtime` to observe these new events.

## 6. Engineering Analysis: Minimal Surgery

To implement this natively within the validator execution logic, we identified the following insertion points that require the least amount of code modification while leveraging existing piping.

### A. New Validator Transaction Type
We must bypass the specialized `DKGResult` transaction type which is tightly coupled to the Randomness Beacon.
1.  **Modify `aptos-types/src/validator_txn.rs`**:
    *   Add `ValidatorTransaction::TimelockDKGResult(DKGTranscript)`.
    *   Add `ValidatorTransaction::TimelockShare(TimelockShare)`.

### B. VM Dispatcher
We must teach the VM to route these new transaction types to the `0x1::timelock` Move module.
1.  **Modify `aptos-move/aptos-vm/src/validator_txns/mod.rs`**:
    *   Add match arms for the new variants in `process_validator_transaction`.
2.  **Create `aptos-move/aptos-vm/src/validator_txns/timelock.rs`**:
    *   Implement `process_timelock_dkg_result`: Calls `0x1::timelock::publish_public_key`.
    *   Implement `process_timelock_share`: Calls `0x1::timelock::publish_secret_share`.

### C. DKG Runtime Extension
We must hook into the event loop that drives off-chain cryptography.
1.  **Modify `dkg/src/epoch_manager.rs`**:
    *   Add `timelock_start_listener` to `EpochManager` struct.
    *   In `start()` loop, listen for `StartKeyGenEvent` and `RequestRevealEvent`.
    *   When `StartKeyGenEvent` fires:
        *   Spawn a standardized `DKGManager` (reusing existing logic).
        *   **CRITICAL**: Pass a flag or different `AggTranscriptProducer` that wraps the result in `ValidatorTransaction::TimelockDKGResult` instead of `DKGResult`.
    *   When `RequestRevealEvent` fires:
        *   Compute the BLS signature/share (using `aptos-dkg` primitives).
        *   Directly submit `ValidatorTransaction::TimelockShare`.
