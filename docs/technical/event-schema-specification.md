# Event Schema Specification

**Document Type**: Technical Specification
**Status**: Implementation Reference
**Last Updated**: 2026-01-06
**Purpose**: Canonical event schema definitions for Rust ↔ Move communication

---

## Overview

This document specifies ALL events used in the Atomica timelock system, including:
- Move event definitions (on-chain)
- Rust event handler interfaces (off-chain)
- BCS serialization formats
- Event ordering guarantees
- Subscription patterns

---

## 1. Validator Epoch Events (DKG Lifecycle)

### 1.1 ValidatorEpochChangeEvent

**Emitted When**: Validator set changes (epoch transition)
**Emitted By**: `0x1::stake::on_new_epoch()` or governance
**Frequency**: Rare (days/weeks/months)
**Purpose**: Trigger DKG among new validator set

#### Move Definition

```move
module aptos_framework::dkg {
    struct ValidatorEpochChangeEvent has drop, store {
        /// Previous epoch number
        old_epoch: u64,

        /// New epoch number
        new_epoch: u64,

        /// New validator set (ordered by voting power descending)
        new_validators: vector<ValidatorInfo>,

        /// Threshold for DKG (voting power, not count)
        /// Typically 2/3 of total voting power
        threshold_voting_power: u128,

        /// Total voting power in new epoch
        total_voting_power: u128,
    }

    struct ValidatorInfo has drop, store, copy {
        /// Validator account address
        addr: address,

        /// Voting power (stake amount)
        voting_power: u64,

        /// Consensus public key (for validator identification)
        consensus_pubkey: vector<u8>,

        /// Network address (for P2P DKG communication)
        network_address: vector<u8>,
    }
}
```

#### BCS Serialization Format

```
ValidatorEpochChangeEvent:
  old_epoch:                u64 (8 bytes, little-endian)
  new_epoch:                u64 (8 bytes, little-endian)
  new_validators:           vector<ValidatorInfo>
    - length:               ULEB128 (variable)
    - validators[]:         ValidatorInfo (repeated)
  threshold_voting_power:   u128 (16 bytes, little-endian)
  total_voting_power:       u128 (16 bytes, little-endian)

ValidatorInfo:
  addr:                     32 bytes (AccountAddress)
  voting_power:             u64 (8 bytes, little-endian)
  consensus_pubkey:         vector<u8>
    - length:               ULEB128
    - data:                 variable bytes
  network_address:          vector<u8>
    - length:               ULEB128
    - data:                 variable bytes

Total size: ~200-500 bytes (depends on validator count)
```

#### Rust Handler Interface

```rust
// File: aptos-dkg/src/epoch_manager.rs

use aptos_types::{
    account_address::AccountAddress,
    event::EventKey,
};
use bcs;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ValidatorEpochChangeEvent {
    pub old_epoch: u64,
    pub new_epoch: u64,
    pub new_validators: Vec<ValidatorInfo>,
    pub threshold_voting_power: u128,
    pub total_voting_power: u128,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ValidatorInfo {
    pub addr: AccountAddress,
    pub voting_power: u64,
    pub consensus_pubkey: Vec<u8>,
    pub network_address: Vec<u8>,
}

impl EpochManager {
    /// Subscribe to validator epoch change events
    pub fn subscribe_to_epoch_changes(&mut self) -> Result<()> {
        let event_key = EventKey::new_from_address(
            &AccountAddress::ONE, // 0x1
            DKG_EPOCH_CHANGE_EVENT_TYPE,
        );

        self.event_subscriber.subscribe(
            event_key,
            Box::new(|event_bytes| {
                self.on_epoch_change(event_bytes)
            })
        )
    }

    /// Handler called when epoch change detected
    fn on_epoch_change(&mut self, event_bytes: Vec<u8>) -> Result<()> {
        // Deserialize event
        let event: ValidatorEpochChangeEvent = bcs::from_bytes(&event_bytes)?;

        info!(
            "Epoch change detected: {} -> {}, {} validators",
            event.old_epoch, event.new_epoch, event.new_validators.len()
        );

        // Check if I'm in the new validator set
        if !self.is_validator_in_set(&event.new_validators) {
            info!("Not in new validator set, skipping DKG");
            return Ok(());
        }

        // Trigger DKG protocol
        self.start_dkg_session(
            event.new_epoch,
            event.new_validators,
            event.threshold_voting_power,
        )?;

        Ok(())
    }
}
```

#### Event Subscription Pattern

```rust
// Subscription via Aptos Event Stream API
let event_stream = aptos_client
    .get_events(
        event_handle_address,
        event_handle_type,
        event_field_name,
        start_sequence_number,
    )
    .await?;

for event in event_stream {
    match event.type_str.as_str() {
        "0x1::dkg::ValidatorEpochChangeEvent" => {
            handle_epoch_change(event.data)?;
        }
        _ => {}
    }
}
```

---

### 1.2 DKGCompletedEvent

**Emitted When**: DKG protocol completes successfully
**Emitted By**: `0x1::dkg::finish_dkg()`
**Purpose**: Notify that Master Public Key is available

#### Move Definition

```move
module aptos_framework::dkg {
    struct DKGCompletedEvent has drop, store {
        /// Epoch for which DKG was performed
        epoch: u64,

        /// Master Public Key (BLS12-381 G2, 96 bytes compressed)
        master_public_key: vector<u8>,

        /// Number of participating validators
        num_validators: u64,

        /// Threshold achieved
        threshold: u64,

        /// Timestamp when DKG completed
        completion_time: u64,
    }
}
```

#### Rust Handler

```rust
fn on_dkg_completed(&mut self, event_bytes: Vec<u8>) -> Result<()> {
    let event: DKGCompletedEvent = bcs::from_bytes(&event_bytes)?;

    info!(
        "DKG completed for epoch {}, MPK: 0x{}",
        event.epoch,
        hex::encode(&event.master_public_key)
    );

    // Store master public key for this epoch
    self.storage.store_mpk(event.epoch, event.master_public_key)?;

    // Ready to serve timelock requests for this epoch
    self.set_epoch_ready(event.epoch);

    Ok(())
}
```

---

## 2. Checkpoint Events (Timelock Decryption)

### 2.1 CheckpointReachedEvent

**Emitted When**: Checkpoint timestamp is reached during block production
**Emitted By**: `0x1::timelock::process_checkpoints()`
**Frequency**: Per checkpoint period (e.g., hourly)
**Purpose**: Notify validators to generate decryption shares

#### Move Definition

```move
module atomica::timelock {
    struct CheckpointReachedEvent has drop, store {
        /// Checkpoint timestamp (Unix seconds)
        checkpoint_timestamp: u64,

        /// Block height when checkpoint was processed
        block_height: u64,

        /// Auction IDs expiring at this checkpoint
        auction_ids: vector<u64>,

        /// Epoch whose MPK was used for encryption
        /// (Validators use this to find correct secret shares)
        encryption_epoch: u64,
    }
}
```

#### BCS Serialization

```
CheckpointReachedEvent:
  checkpoint_timestamp:     u64 (8 bytes)
  block_height:             u64 (8 bytes)
  auction_ids:              vector<u64>
    - length:               ULEB128
    - auction_ids[]:        u64 each (8 bytes)
  encryption_epoch:         u64 (8 bytes)

Typical size: 32 bytes + (8 * num_auctions)
Example: 5 auctions = 72 bytes
```

#### Rust Handler Interface

```rust
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CheckpointReachedEvent {
    pub checkpoint_timestamp: u64,
    pub block_height: u64,
    pub auction_ids: Vec<u64>,
    pub encryption_epoch: u64,
}

impl TimelockManager {
    fn on_checkpoint_reached(&mut self, event_bytes: Vec<u8>) -> Result<()> {
        let event: CheckpointReachedEvent = bcs::from_bytes(&event_bytes)?;

        info!(
            "Checkpoint {} reached at block {}, {} auctions expiring",
            event.checkpoint_timestamp,
            event.block_height,
            event.auction_ids.len()
        );

        // Get my secret share for the encryption epoch
        let my_share = self.storage
            .get_secret_share(event.encryption_epoch)
            .ok_or_else(|| anyhow!("No share for epoch {}", event.encryption_epoch))?;

        // Generate decryption shares for each auction
        for auction_id in &event.auction_ids {
            self.generate_and_submit_share(
                *auction_id,
                event.checkpoint_timestamp,
                &my_share,
            )?;
        }

        Ok(())
    }

    fn generate_and_submit_share(
        &self,
        auction_id: u64,
        checkpoint: u64,
        secret_share: &SecretShare,
    ) -> Result<()> {
        // Compute IBE identity for this auction
        let identity = compute_ibe_identity(auction_id, checkpoint);

        // Generate BLS signature share
        let signature_share = bls12381::sign(secret_share, &identity)?;

        // Submit validator transaction
        self.submit_validator_txn(ValidatorTransaction::TimelockShare {
            auction_id,
            checkpoint,
            share: signature_share,
        })?;

        Ok(())
    }
}

fn compute_ibe_identity(auction_id: u64, checkpoint: u64) -> HashValue {
    let data = format!("auction:{}:deadline:{}", auction_id, checkpoint);
    HashValue::sha3_256(data.as_bytes())
}
```

#### Event Ordering Guarantee

```
Guarantee: CheckpointReachedEvent emitted in chronological order

Checkpoint 3600:  Event at block N
Checkpoint 7200:  Event at block N+k (k > 0)
Checkpoint 10800: Event at block N+k+m (m > 0)

If checkpoint missed (network outage):
  - Catch-up processing on recovery
  - Events emitted for ALL missed checkpoints in order
  - Example: Recovery at T=10850
    → Emit CheckpointReachedEvent(7200)
    → Emit CheckpointReachedEvent(10800)
```

---

### 2.2 DecryptionSharePostedEvent

**Emitted When**: Validator posts decryption share for auction
**Emitted By**: `0x1::timelock::post_decryption_share()`
**Purpose**: Track share submission progress

#### Move Definition

```move
module atomica::timelock {
    struct DecryptionSharePostedEvent has drop, store {
        /// Auction ID
        auction_id: u64,

        /// Checkpoint timestamp
        checkpoint: u64,

        /// Validator who posted share
        validator_address: address,

        /// Current number of shares received
        shares_received: u64,

        /// Threshold required
        threshold_required: u64,

        /// Whether threshold is now met
        threshold_met: bool,
    }
}
```

#### Rust Client Monitoring

```rust
// Off-chain client monitors share submission progress
fn on_share_posted(&self, event_bytes: Vec<u8>) -> Result<()> {
    let event: DecryptionSharePostedEvent = bcs::from_bytes(&event_bytes)?;

    info!(
        "Share posted for auction {} by {}: {}/{} (threshold: {})",
        event.auction_id,
        event.validator_address,
        event.shares_received,
        event.threshold_required,
        if event.threshold_met { "MET" } else { "pending" }
    );

    if event.threshold_met {
        // Threshold reached, auction can be decrypted
        self.notify_auction_ready_for_decryption(event.auction_id)?;
    }

    Ok(())
}
```

---

## 3. Auction Events

### 3.1 AuctionCreatedEvent

**Emitted When**: Auction is created
**Emitted By**: `atomica::auction::create_auction()`
**Purpose**: Index new auctions, track encryption parameters

#### Move Definition

```move
module atomica::auction {
    struct AuctionCreatedEvent has drop, store {
        /// Unique auction ID
        auction_id: u64,

        /// Auction creator address
        creator: address,

        /// Encryption layers configuration
        encryption_layers: vector<EncryptionLayer>,

        /// Bid submission deadline
        bid_deadline: u64,

        /// Decryption deadline (checkpoint timestamp)
        decryption_deadline: u64,

        /// Encryption epoch (which MPK to use)
        encryption_epoch: u64,
    }

    struct EncryptionLayer has copy, drop, store {
        /// Layer index (0 = outermost, N-1 = innermost)
        layer_index: u8,

        /// Provider type (1=Validator, 2=Seller, 3=Drand)
        provider_type: u8,

        /// Public key for this layer
        public_key: vector<u8>,

        /// Checkpoint when this layer unlocks
        unlock_checkpoint: u64,
    }
}
```

#### Rust Client Usage

```rust
fn on_auction_created(&self, event_bytes: Vec<u8>) -> Result<()> {
    let event: AuctionCreatedEvent = bcs::from_bytes(&event_bytes)?;

    info!("New auction {} created, deadline: {}",
          event.auction_id, event.decryption_deadline);

    // Client-side encryption logic
    let encryption_keys = event.encryption_layers
        .iter()
        .map(|layer| layer.public_key.clone())
        .collect::<Vec<_>>();

    // Store for bid encryption
    self.cache.store_auction_keys(event.auction_id, encryption_keys)?;

    Ok(())
}
```

---

## 4. Event Handle Locations

### 4.1 Event Handle Registry

```move
module aptos_framework::dkg {
    struct DKGEvents has key {
        epoch_change_events: EventHandle<ValidatorEpochChangeEvent>,
        dkg_completed_events: EventHandle<DKGCompletedEvent>,
    }
}

module atomica::timelock {
    struct TimelockEvents has key {
        checkpoint_reached_events: EventHandle<CheckpointReachedEvent>,
        share_posted_events: EventHandle<DecryptionSharePostedEvent>,
    }
}

module atomica::auction {
    struct AuctionEvents has key {
        auction_created_events: EventHandle<AuctionCreatedEvent>,
        bid_submitted_events: EventHandle<BidSubmittedEvent>,
        auction_cleared_events: EventHandle<AuctionClearedEvent>,
    }
}
```

### 4.2 Event Handle Addresses

| Event | Address | Type |
|-------|---------|------|
| `ValidatorEpochChangeEvent` | `0x1` | `0x1::dkg::ValidatorEpochChangeEvent` |
| `DKGCompletedEvent` | `0x1` | `0x1::dkg::DKGCompletedEvent` |
| `CheckpointReachedEvent` | `@atomica` | `atomica::timelock::CheckpointReachedEvent` |
| `DecryptionSharePostedEvent` | `@atomica` | `atomica::timelock::DecryptionSharePostedEvent` |
| `AuctionCreatedEvent` | `@atomica` | `atomica::auction::AuctionCreatedEvent` |

---

## 5. Event Subscription Architecture

### 5.1 Rust Event Subscriber

```rust
// File: aptos-dkg/src/event_subscriber.rs

use aptos_rest_client::Client;
use aptos_types::event::EventKey;
use futures::StreamExt;

pub struct EventSubscriber {
    client: Client,
    subscriptions: HashMap<EventKey, Vec<EventHandler>>,
}

pub type EventHandler = Box<dyn Fn(Vec<u8>) -> Result<()> + Send>;

impl EventSubscriber {
    pub fn new(node_url: &str) -> Self {
        Self {
            client: Client::new(Url::parse(node_url).unwrap()),
            subscriptions: HashMap::new(),
        }
    }

    pub fn subscribe(&mut self, event_key: EventKey, handler: EventHandler) {
        self.subscriptions
            .entry(event_key)
            .or_insert_with(Vec::new)
            .push(handler);
    }

    /// Poll for new events (run in background task)
    pub async fn poll_events(&self) -> Result<()> {
        for (event_key, handlers) in &self.subscriptions {
            let events = self.client
                .get_events_by_event_handle(
                    event_key.get_creator_address(),
                    &event_key.get_type_tag().to_string(),
                    &event_key.get_field_name(),
                    None, // start_sequence_number
                    Some(100), // limit
                )
                .await?;

            for event in events.into_inner() {
                for handler in handlers {
                    handler(event.data)?;
                }
            }
        }

        Ok(())
    }
}
```

### 5.2 Event Processing Pipeline

```
┌──────────────────────────────────────────────────────────┐
│ Move Contract (On-Chain)                                  │
│                                                            │
│  1. Execute transaction                                   │
│  2. Emit event: event::emit(CheckpointReachedEvent {...}) │
│  3. Event stored in transaction output                    │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Aptos Node Event Storage                                  │
│  - Events indexed by EventKey                             │
│  - Queryable via REST API                                 │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Rust Event Subscriber (Off-Chain)                         │
│                                                            │
│  1. Poll REST API: GET /v1/accounts/{addr}/events/{type}  │
│  2. Receive event data (BCS-encoded bytes)                │
│  3. Deserialize: bcs::from_bytes::<Event>(&data)          │
│  4. Route to handler: handler(event)                      │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Event Handler (Validator Logic)                           │
│                                                            │
│  - Generate decryption shares                             │
│  - Submit validator transactions                          │
│  - Update local state                                     │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Error Handling

### 6.1 Event Deserialization Errors

```rust
pub enum EventError {
    /// Failed to deserialize BCS bytes
    DeserializationError {
        event_type: String,
        error: bcs::Error,
    },

    /// Unknown event type received
    UnknownEventType(String),

    /// Event handler execution failed
    HandlerError {
        event_type: String,
        error: anyhow::Error,
    },
}

fn handle_event(event_type: &str, data: Vec<u8>) -> Result<(), EventError> {
    match event_type {
        "0x1::dkg::ValidatorEpochChangeEvent" => {
            let event = bcs::from_bytes::<ValidatorEpochChangeEvent>(&data)
                .map_err(|e| EventError::DeserializationError {
                    event_type: event_type.to_string(),
                    error: e,
                })?;

            on_epoch_change(event)
                .map_err(|e| EventError::HandlerError {
                    event_type: event_type.to_string(),
                    error: e,
                })?;
        }
        _ => return Err(EventError::UnknownEventType(event_type.to_string())),
    }

    Ok(())
}
```

### 6.2 Missed Event Recovery

```rust
impl EventSubscriber {
    /// Catch up on missed events
    pub async fn catch_up_from(&self, last_seen_version: u64) -> Result<()> {
        let current_version = self.client.get_ledger_information()
            .await?
            .inner()
            .version;

        if current_version <= last_seen_version {
            return Ok(()); // Already up to date
        }

        info!(
            "Catching up on events: {} -> {}",
            last_seen_version, current_version
        );

        // Query events in batches
        const BATCH_SIZE: u64 = 1000;
        let mut current = last_seen_version + 1;

        while current <= current_version {
            let end = (current + BATCH_SIZE).min(current_version);

            for (event_key, handlers) in &self.subscriptions {
                let events = self.query_events_in_range(
                    event_key,
                    current,
                    end,
                ).await?;

                for event in events {
                    for handler in handlers {
                        handler(event.data.clone())?;
                    }
                }
            }

            current = end + 1;
        }

        Ok(())
    }
}
```

---

## 7. Testing Event Schemas

### 7.1 Move Unit Tests

```move
#[test(framework = @aptos_framework)]
public fun test_checkpoint_event_emission(framework: &signer) {
    // Setup
    timestamp::set_time_has_started_for_testing(framework);
    timelock::initialize(framework);

    // Create auction with deadline at checkpoint
    let auction_id = 42;
    let checkpoint = 7200;
    register_auction(auction_id, checkpoint);

    // Advance time to checkpoint
    timestamp::fast_forward_seconds(7200);

    // Process checkpoint
    timelock::process_checkpoints(framework);

    // Verify event was emitted
    let events = event::emitted_events<CheckpointReachedEvent>();
    assert!(vector::length(&events) == 1, 0);

    let event = vector::borrow(&events, 0);
    assert!(event.checkpoint_timestamp == 7200, 1);
    assert!(vector::contains(&event.auction_ids, &auction_id), 2);
}
```

### 7.2 Rust Integration Tests

```rust
#[tokio::test]
async fn test_checkpoint_event_subscription() {
    let (swarm, mut subscriber) = setup_test_environment().await;

    // Subscribe to checkpoint events
    let (tx, mut rx) = mpsc::channel(10);
    subscriber.subscribe(
        checkpoint_event_key(),
        Box::new(move |data| {
            tx.blocking_send(data)?;
            Ok(())
        })
    );

    // Create auction on-chain
    create_test_auction(&swarm, /*deadline=*/7200).await?;

    // Fast-forward time to checkpoint
    swarm.fast_forward_time(7200).await?;

    // Wait for event
    let event_data = timeout(Duration::from_secs(10), rx.recv())
        .await?
        .expect("No event received");

    // Verify event contents
    let event: CheckpointReachedEvent = bcs::from_bytes(&event_data)?;
    assert_eq!(event.checkpoint_timestamp, 7200);
    assert!(event.auction_ids.contains(&42));
}
```

---

## 8. Event Versioning

### 8.1 Version Strategy

**Policy**: Events are immutable once deployed. Schema changes require new event types.

```move
// V1 (current)
struct CheckpointReachedEvent has drop, store {
    checkpoint_timestamp: u64,
    block_height: u64,
    auction_ids: vector<u64>,
    encryption_epoch: u64,
}

// V2 (future - if schema needs to change)
struct CheckpointReachedEventV2 has drop, store {
    checkpoint_timestamp: u64,
    block_height: u64,
    auction_ids: vector<u64>,
    encryption_epoch: u64,
    new_field: u64,  // Added field
}
```

**Rust Compatibility**:
```rust
// Support both versions
enum CheckpointEvent {
    V1(CheckpointReachedEvent),
    V2(CheckpointReachedEventV2),
}

fn deserialize_checkpoint_event(data: Vec<u8>) -> Result<CheckpointEvent> {
    // Try V2 first
    if let Ok(v2) = bcs::from_bytes::<CheckpointReachedEventV2>(&data) {
        return Ok(CheckpointEvent::V2(v2));
    }

    // Fallback to V1
    let v1 = bcs::from_bytes::<CheckpointReachedEvent>(&data)?;
    Ok(CheckpointEvent::V1(v1))
}
```

---

## Appendix A: Complete Event Type Index

| Event Name | Module | Frequency | Purpose |
|------------|--------|-----------|---------|
| `ValidatorEpochChangeEvent` | `0x1::dkg` | Rare | Trigger DKG |
| `DKGCompletedEvent` | `0x1::dkg` | Rare | MPK available |
| `CheckpointReachedEvent` | `atomica::timelock` | Periodic | Request shares |
| `DecryptionSharePostedEvent` | `atomica::timelock` | Per validator | Track progress |
| `AuctionCreatedEvent` | `atomica::auction` | Per auction | Index auctions |
| `BidSubmittedEvent` | `atomica::auction` | Per bid | Track bids |
| `AuctionClearedEvent` | `atomica::auction` | Per auction | Settlement ready |

---

## Appendix B: BCS Encoding Reference

### ULEB128 Encoding

```
vector<u64> with 3 elements:
  - length: 0x03 (ULEB128)
  - elements: 8 bytes each × 3 = 24 bytes
  Total: 25 bytes

vector<u64> with 128 elements:
  - length: 0x8001 (ULEB128, 2 bytes)
  - elements: 8 bytes each × 128 = 1024 bytes
  Total: 1026 bytes
```

### Common Type Sizes

| Type | Size |
|------|------|
| `u8` | 1 byte |
| `u64` | 8 bytes |
| `u128` | 16 bytes |
| `address` | 32 bytes |
| `vector<u8>` | ULEB128(len) + len bytes |
| `bool` | 1 byte (0x00 or 0x01) |

---

**End of Event Schema Specification**
