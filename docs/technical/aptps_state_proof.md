# Aptos State Proofs and Light Client Verification

## Overview

Aptos Core provides a sophisticated **light client verification system** that allows external parties to cryptographically verify on-chain state and state transitions without maintaining a full node. This is achieved through multiple layers of cryptographic proofs based on Merkle trees and BFT consensus signatures.

## Key Proof Mechanisms

### 1. **StateProof** - The Primary Light Client Update

**Location:** `types/src/state_proof.rs:24`

This is the main response type for light client synchronization. It contains:
- `latest_li_w_sigs: LedgerInfoWithSignatures` - The latest blockchain state with validator signatures
- `epoch_changes: EpochChangeProof` - Proof of validator set changes across epochs

External verifiers request a `StateProof` to update their trusted view of the blockchain from a known version to the latest version.

### 2. **TrustedState** - Light Client State Management

**Location:** `types/src/trusted_state.rs:27`

This tracks a light client's current trusted state. It has two modes:
- `EpochWaypoint` - Bootstrap mode with just a trusted checkpoint
- `EpochState` - Operational mode with full epoch and validator set information

**Key method:** `verify_and_ratchet()` at line 138 - This is the core verification function that:
1. Takes a `StateProof` from an upstream node
2. Cryptographically verifies epoch changes and signatures
3. Updates the trusted state to the new version
4. Returns whether this was a version change or epoch change

### 3. **Waypoint** - Bootstrap Mechanism

**Location:** `types/src/waypoint.rs:31`

A compact, shareable trust anchor in the format `version:hash_value`. Waypoints can be:
- Distributed out-of-band (hardcoded in network configs)
- Used as initial trust points for new light clients
- Verified against `LedgerInfo` structures

### 4. **Transaction Accumulator Proofs**

**Location:** `types/src/proof/definition.rs:34`

Multiple proof types for transaction verification:
- **`AccumulatorProof<H>`** (line 35) - Proves a specific transaction's inclusion
- **`TransactionAccumulatorRangeProof`** - Proves a batch of consecutive transactions
- **`AccumulatorConsistencyProof`** - Proves the accumulator extended correctly
- **`TransactionAccumulatorSummary`** - Minimal representation for light clients

### 5. **Sparse Merkle Proofs** for State

**Location:** `types/src/proof/` and `storage/jellyfish-merkle/`

- **`SparseMerkleProof`** - Proves existence/non-existence of state keys
- **`SparseMerkleProofExt`** - Extended version with detailed sibling information
- **`SparseMerkleRangeProof`** - Proves ranges of state changes

These allow verification of:
- Account balances and resources
- Specific state values at any version
- State changes between versions

## Storage API for Proof Generation

**Location:** `storage/aptosdb/src/db/aptosdb_reader.rs` and `storage/storage-interface/src/lib.rs`

Key methods available for retrieving proofs:

```rust
// Get state proof from known version to latest
fn get_state_proof(&self, known_version: u64) -> Result<StateProof>

// Get transaction with inclusion proof
fn get_transaction_with_proof(
    &self,
    version: Version,
    ledger_version: Version,
    include_events: bool
) -> Result<TransactionWithProof>

// Get state value with Merkle proof
fn get_state_proof_by_version_ext(
    &self,
    key_hash: &HashValue,
    version: Version,
    root_depth: usize,
) -> Result<SparseMerkleProofExt>

// Get epoch change proof
fn get_epoch_ending_ledger_infos(
    &self,
    start_epoch: u64,
    end_epoch: u64,
) -> Result<EpochChangeProof>
```

**Implementation:** `storage/aptosdb/src/db/aptosdb_reader.rs:597-670`

## Light Client Workflow

Here's how an external verifier would use this system:

### Initial Bootstrap

```rust
// 1. Obtain a trusted waypoint (from secure channel)
let waypoint = Waypoint::from_str("12345:0xabc123...")?;
let mut trusted_state = TrustedState::from_epoch_waypoint(waypoint);
```

### Synchronization Loop

```rust
// 2. Request StateProof from full node
let state_proof: StateProof = full_node.get_state_proof(trusted_state.version())?;

// 3. Verify and update trusted state
match trusted_state.verify_and_ratchet(&state_proof)? {
    TrustedStateChange::Epoch { new_state, .. } => {
        // Validator set changed, update verifier
        trusted_state = new_state;
    }
    TrustedStateChange::Version { new_state } => {
        // Just version updated, same epoch
        trusted_state = new_state;
    }
    TrustedStateChange::NoChange => {
        // Already up to date
    }
}
```

### Verify Specific State

```rust
// 4. Get account state with proof
let (state_value, proof) = full_node.get_state_value_with_proof(
    &account_key,
    trusted_state.version()
)?;

// 5. Verify against trusted root hash
proof.verify(trusted_state.waypoint().value(), state_value.hash())?;
```

## Verification Guarantees

The system provides cryptographic guarantees that:

1. **Consensus signatures are valid** - BFT validator signatures verify that 2/3+ of validators signed the state
2. **Merkle proofs are correct** - All state values can be traced to the root hash in the signed LedgerInfo
3. **Epoch transitions are valid** - Validator set changes are chained and verifiable
4. **Transaction inclusion** - Any transaction can be proven to exist at a specific version
5. **State consistency** - Accumulator consistency proofs ensure the blockchain only extends, never forks

## Key Data Structures

### EpochChangeProof

**Location:** `types/src/epoch_change.rs:39`

- Chain of `LedgerInfoWithSignatures` across epoch boundaries
- Each LedgerInfo contains the next epoch's validator set
- Verified iteratively: current validators → next epoch → next validators → ...

### LedgerInfo

Referenced throughout the codebase:
- Contains: epoch, version, transaction accumulator root, timestamp
- Signed by 2/3+ validators using BFT aggregate signatures
- Commits to entire blockchain state via root hashes

### Jellyfish Merkle Tree

**Location:** `storage/jellyfish-merkle/src/lib.rs`

- 256-bit sparse Merkle tree for state
- Optimized with placeholder nodes for empty subtrees
- Generates proofs via `get_with_proof(key, version)`

## Proof Verification Flow

### Step 1: Bootstrap
Light clients start with a trusted **Waypoint** (version + hash) obtained from:
- Network configuration files
- Social consensus
- Trusted third parties
- Previous successful sync

### Step 2: Request StateProof
Client requests proof from current trusted version to latest blockchain state:
```
GET /v1/state_proof?known_version=12345
```

### Step 3: Verify Epoch Changes
If epoch changed since known version:
1. Verify first epoch change using current trusted validator set
2. Extract next epoch's validator set from verified LedgerInfo
3. Use new validator set to verify next epoch change
4. Chain verification until reaching target epoch

### Step 4: Verify Latest State
Once in correct epoch:
1. Verify latest LedgerInfo signature using epoch's validator set
2. Update trusted state to new version and root hash

### Step 5: Query and Verify State
With updated trusted state:
1. Request state values with Merkle proofs
2. Verify proofs against trusted root hash
3. Trust verified values without full state

## Example Use Cases

1. **Light wallets** - Verify account balances and transactions without full blockchain
2. **Cross-chain bridges** - Cryptographically prove events/state to other chains
3. **Data indexers** - Verify data received from untrusted full nodes
4. **Compliance auditors** - Verify specific historical state without storing everything
5. **Mobile clients** - Minimal storage requirements while maintaining security
6. **State attestation** - Prove on-chain state to external systems

## API Endpoints (Conceptual)

While the core proof functionality is implemented in storage and types, full nodes would expose endpoints like:

```
GET /v1/state_proof?known_version={version}
  → Returns: StateProof

GET /v1/transactions/{version}/proof?ledger_version={version}
  → Returns: TransactionWithProof

GET /v1/accounts/{address}/state/{key}/proof?version={version}
  → Returns: StateValueWithProof

GET /v1/epochs/{start_epoch}/proof?end_epoch={end_epoch}
  → Returns: EpochChangeProof
```

## Implementation Details

### Merkle Tree Structure

**Transaction Accumulator** (append-only):
- Binary Merkle tree of all transaction hashes
- Root hash included in every LedgerInfo
- Proves transaction ordering and inclusion

**State Tree** (sparse Merkle tree):
- 256-bit key space (account addresses + resource types)
- Optimized for sparse data with placeholder nodes
- Root hash included in LedgerInfo
- Proves current state and non-existence

### Signature Verification

**BFT Aggregate Signatures:**
- Each validator signs the LedgerInfo
- Aggregated into single compact signature
- Verifiable against validator set public keys
- Requires 2f+1 signatures (where f is max Byzantine validators)

### Proof Size Considerations

- **Waypoint**: ~64 bytes (version + hash)
- **AccumulatorProof**: ~2KB (63 siblings max)
- **SparseMerkleProof**: ~8KB (256 levels, optimized with placeholders)
- **EpochChangeProof**: Variable (depends on epoch changes)
- **StateProof**: ~10-50KB typically

## Security Considerations

### Trust Assumptions

Light clients must trust:
1. **Initial waypoint** - Must come from secure source
2. **2/3+ honest validators** - BFT security assumption
3. **Cryptographic primitives** - Hash functions, signatures

Light clients do NOT need to trust:
- Full nodes serving proofs (all data is verified)
- Network infrastructure (proofs are self-contained)
- Historical data availability (can verify any subset)

### Attack Resistance

The proof system resists:
- **State equivocation** - Merkle tree binds all state to single root
- **Transaction reordering** - Accumulator fixes transaction order
- **Invalid state transitions** - Proofs only attest to committed state
- **Eclipse attacks** - Multiple full nodes can be queried
- **Long-range attacks** - Epoch changes bind validator set evolution

## Testing and Examples

Comprehensive tests demonstrate usage:

- **`types/src/unit_tests/trusted_state_test.rs`** - Light client verification tests
- **`types/src/epoch_change.rs:145`** - Epoch change proof verification tests
- **`execution/executor/tests/db_bootstrapper_test.rs`** - Bootstrap and sync tests
- **`storage/jellyfish-merkle/src/jellyfish_merkle_test.rs`** - Merkle proof tests

These tests show exactly how to construct and verify proofs programmatically.

## Performance Characteristics

**Proof Generation:**
- State proofs: O(log N) where N is state size
- Transaction proofs: O(log M) where M is transaction count
- Epoch proofs: O(E) where E is number of epoch changes

**Proof Verification:**
- Constant time signature verification (aggregate signatures)
- Logarithmic Merkle proof verification
- Linear epoch change verification

**Storage Requirements:**
- Full node: Complete state and history
- Light client: ~100KB (waypoint + current epoch state)
- Archival light client: Can prune proofs after verification

## Related Documentation

- **Consensus:** `consensus/` - BFT consensus implementation
- **Storage:** `storage/aptosdb/` - Proof generation implementation
- **Execution:** `execution/` - State transition verification
- **Crypto:** `crates/aptos-crypto/` - Cryptographic primitives

## Conclusion

This proof system is production-ready and designed for external consumption. The main entry point is the `StateProof` type combined with `TrustedState::verify_and_ratchet()`, which provides a complete light client verification solution without requiring full node infrastructure.

External verifiers can trustlessly validate any on-chain state or state transition using only:
1. A trusted initial waypoint
2. Access to full node APIs (untrusted)
3. The proof verification code in `aptos-types`

This enables secure, lightweight blockchain clients suitable for resource-constrained environments while maintaining the full security guarantees of the underlying consensus protocol.
