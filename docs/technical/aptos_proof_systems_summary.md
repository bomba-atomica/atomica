# Aptos Core State Proof and Light Client Verification Systems

## Overview

Aptos Core implements a comprehensive proof system for external verifiers and light clients to verify blockchain state without running a full node. The system uses cryptographic proofs based on Merkle trees and accumulators to allow clients to securely ratchet their trusted state forward.

## Proof Structures and Types

### 1. State Proofs (StateProof)
**Location:** `/home/david/projects/libra/aptos-core/types/src/state_proof.rs`

```rust
pub struct StateProof {
    latest_li_w_sigs: LedgerInfoWithSignatures,
    epoch_changes: EpochChangeProof,
}
```

The `StateProof` is the main response structure for state proof requests. It combines:
- **latest_li_w_sigs**: The most recent LedgerInfoWithSignatures with validator signatures
- **epoch_changes**: An EpochChangeProof documenting all epoch changes to reach the latest epoch

This allows a light client to ratchet their `TrustedState` forward while verifying all epoch changes.

### 2. Transaction Accumulator Proofs
**Location:** `/home/david/projects/libra/aptos-core/types/src/proof/definition.rs`

#### AccumulatorProof<H>
- Proves inclusion of a transaction at a specific index in the transaction accumulator
- Stores sibling hashes from leaf to root
- Used to authenticate transaction existence given a trusted root hash

#### TransactionAccumulatorProof
- Specialized AccumulatorProof using TransactionAccumulatorHasher
- Verifies transactions exist in the ledger via `verify(root_hash, element_hash, element_index)`

#### TransactionAccumulatorRangeProof
- Proves a range of consecutive transactions
- Stores left_siblings and right_siblings for efficient verification
- Authenticates a batch of transactions from `first_leaf_index` through multiple leaves

#### TransactionAccumulatorSummary
- In-memory representation of the transaction accumulator (frozen subtree roots)
- Used by light clients to store minimal state
- Methods:
  - `verify_consistency(ledger_info)`: Ensures accumulator matches ledger info
  - `try_from_genesis_proof(proof, version)`: Bootstrap from genesis
  - `try_extend_with_proof(proof, target_li)`: Ratchet forward with consistency proof

#### AccumulatorConsistencyProof
- Proves two accumulators are consistent (one extends the other)
- Contains subtree roots representing new leaves
- Essential for light clients to trustlessly advance their accumulator

#### AccumulatorExtensionProof<H>
- Similar to consistency proof but with more explicit structure
- Includes frozen_subtree_roots, num_leaves, and new leaves
- Used to verify correct computation and return updated tree state

### 3. Sparse Merkle Tree Proofs
**Location:** `/home/david/projects/libra/aptos-core/types/src/proof/definition.rs`

#### SparseMerkleProof
- Proves state value existence or non-existence in the state tree
- Contains optional SparseMerkleLeafNode and sibling hashes
- Supports both inclusion and non-inclusion proofs
- Methods:
  - `verify(root_hash, key, value)`: Verify value exists at key
  - `verify_by_hash(root_hash, key, element_hash)`: Verify by hash
  - `verify_by_hash_partial(root_hash, key, element_hash, root_depth)`: Partial tree verification

#### SparseMerkleProofExt
- Extended version with detailed sibling node information
- Supports partial proofs with root_depth
- Better for complex verification scenarios

#### SparseMerkleRangeProof
- Proves a range of consecutive leaves from leftmost to rightmost known
- Stores right_siblings for path from root to last leaf
- Optimized for verifying account state ranges

### 4. Transaction Info Proofs
**Location:** `/home/david/projects/libra/aptos-core/types/src/proof/definition.rs`

#### TransactionInfoWithProof
```rust
pub struct TransactionInfoWithProof {
    pub ledger_info_to_transaction_info_proof: TransactionAccumulatorProof,
    pub transaction_info: TransactionInfo,
}
```
- Proves a specific transaction and its effects at a version
- Method: `verify(ledger_info, transaction_version)`

#### TransactionInfoListWithProof
- Proves a list of consecutive transaction infos
- Uses TransactionAccumulatorRangeProof
- Methods:
  - `verify(ledger_info, first_version)`: Batch verification
  - `verify_extends_ledger(num_txns, root_hash, first_version)`: Check consistency with existing ledger

## Light Client Architecture

### TrustedState
**Location:** `/home/david/projects/libra/aptos-core/types/src/trusted_state.rs`

The core light client state tracking mechanism:

```rust
pub enum TrustedState {
    EpochWaypoint(Waypoint),  // Initial state at epoch boundary
    EpochState {
        waypoint: Waypoint,
        epoch_state: EpochState,  // Validator set for current epoch
    },
}
```

Key methods:
- `verify_and_ratchet(state_proof)`: Main verification and state advancement
- `verify_and_ratchet_inner(latest_li, epoch_change_proof)`: Core ratcheting logic

The ratcheting process:
1. Verifies latest LedgerInfo is not stale
2. If epoch change required, verifies EpochChangeProof
3. Updates validator set to new epoch if needed
4. Updates waypoint to latest verified ledger info
5. Returns TrustedStateChange indicating what changed

### TrustedStateChange
Indicates the result of ratcheting:
```rust
pub enum TrustedStateChange<'a> {
    Version { new_state: TrustedState },  // Only version updated
    Epoch { new_state: TrustedState, latest_epoch_change_li: &'a LedgerInfoWithSignatures },
    NoChange,  // State already at this version
}
```

### Waypoint
**Location:** `/home/david/projects/libra/aptos-core/types/src/waypoint.rs`

Compact commitment to a LedgerInfo (version + hash):
- Serializes as "version:hash" string (e.g., "1000000:abc123...")
- Used as trusted bootstrap point
- Methods:
  - `new_any(ledger_info)`: Create from any ledger info
  - `new_epoch_boundary(ledger_info)`: Create from epoch change ledger info
  - `verify(ledger_info)`: Verify a ledger info matches

### EpochChangeProof
**Location:** `/home/david/projects/libra/aptos-core/types/src/epoch_change.rs`

```rust
pub struct EpochChangeProof {
    pub ledger_info_with_sigs: Vec<LedgerInfoWithSignatures>,
    pub more: bool,  // Indicates if more epochs follow
}
```

- Chain of epoch-ending LedgerInfos with signatures
- Each LI contains next epoch's validator set
- Verification skips stale ledger infos
- Method: `verify(verifier)` - verifies entire chain

## Merkle Tree Implementations

### Jellyfish Merkle Tree
**Location:** `/home/david/projects/libra/aptos-core/storage/jellyfish-merkle/src/lib.rs`

State authentication data structure:
- 256-bit sparse Merkle tree with optimization
- Subtrees with 0-1 leaves replaced by leaf or placeholder
- Uses InternalNode (16 children, 4-level binary tree) and LeafNode
- Public API: `get_with_proof(key, version)` returns (value, SparseMerkleProof)

### Sparse Merkle Tree (Scratchpad)
**Location:** `/home/david/projects/libra/aptos-core/storage/scratchpad/src/sparse_merkle/mod.rs`

In-memory tree for uncommitted transaction execution:
- Immutable trees using Arc<Node> structure
- Base tree chaining for transaction forking
- Proof generation via `get_proof(key, root_depth)`
- Used during block execution for state verification

### Merkle Accumulator
**Location:** `/home/david/projects/libra/aptos-core/storage/accumulator/src/lib.rs`

Append-only accumulator for transaction history:
- Frozen nodes (immutable) and non-frozen nodes (changing)
- Placeholder nodes ensure all leaves have proof paths
- Physical representation: post-order tree traversal
- Methods:
  - `append(leaves)`: Add new transactions
  - `get_proof(leaf_index)`: Get transaction inclusion proof
  - `get_range_proof(first, count)`: Batch proof generation

## Storage Layer Interfaces

### Key Methods in AptosDB
**Location:** `/home/david/projects/libra/aptos-core/storage/`

**Proof Generation:**
- `get_transaction_with_proof(version, ledger_version)`: TransactionInfoWithProof
- `get_transaction_range_proof(first_version, num_txns, ledger_version)`: Range proof
- `get_with_proof_ext(key, version)`: SparseMerkleProofExt from state tree

**Accumulator Operations:**
- Transaction accumulator database with frozen node storage
- Range proof generation for transaction batches
- Version-indexed access for all historical data

## Proof Verification Flow Example

Light client receiving a StateProof:

```
1. Receive StateProof containing:
   - Latest LedgerInfoWithSignatures
   - EpochChangeProof (chain of epoch endings)

2. Call TrustedState::verify_and_ratchet(state_proof)

3. If epoch change needed:
   - Verify EpochChangeProof chain with current validator set
   - Extract new validator set from latest epoch-ending LI
   - Verify latest LI with new validator set

4. Update TrustedState:
   - New waypoint from latest verified LI
   - New epoch_state if epoch changed

5. Now can verify transaction proofs:
   - Use accumulator proof against root in latest LI
   - Optionally update local accumulator with consistency proof
```

## External Verifier APIs and Integration Points

### REST API Integration
**Location:** `/home/david/projects/libra/aptos-core/api/src/`

While not explicitly named "get_state_proof", the state module provides endpoints for:
- Account state queries with version
- Transaction queries with proofs
- Event queries

### Storage Service (State Sync)
**Location:** `/home/david/projects/libra/aptos-core/state-sync/storage-service/`

Peer-to-peer protocol for:
- Serving accumulated proofs to syncing nodes
- Transaction range proof delivery
- State value requests with proofs

### Backup Service
**Location:** `/home/david/projects/libra/aptos-core/storage/backup/`

Provides historical data export including:
- TransactionInfoWithProof for state snapshots
- Transaction range proofs
- Full transaction history with authentication

## Example Usage Patterns

### Light Client Bootstrap
```rust
// Start with a trusted waypoint (e.g., from genesis or network checkpoint)
let trusted_state = TrustedState::from_epoch_waypoint(waypoint);

// Request StateProof from full node
let state_proof = full_node.get_state_proof().await;

// Verify and ratchet
let change = trusted_state.verify_and_ratchet(&state_proof)?;
match change {
    TrustedStateChange::Epoch { new_state, .. } => 
        trusted_state = new_state,  // Epoch changed
    TrustedStateChange::Version { new_state } => 
        trusted_state = new_state,  // Only version updated
    TrustedStateChange::NoChange => {}  // Already at this state
}

// Now can verify transaction proofs with latest state
```

### Transaction Verification
```rust
let txn_proof: TransactionInfoWithProof = ...;
let ledger_info = trusted_state.latest_ledger_info();

// Verify transaction at specific version
txn_proof.verify(ledger_info, txn_version)?;

// Access verified transaction info
let txn_info = txn_proof.transaction_info();
```

### State Value Verification
```rust
let state_proof: SparseMerkleProof = ...;
let root_hash = ledger_info.state_root_hash();

// Verify account state value
state_proof.verify(root_hash, account_key, Some(&account_value))?;

// Or non-existence proof
state_proof.verify(root_hash, non_existing_key, None)?;
```

## Key Design Principles

1. **Minimal Trust Assumption**: Light clients only need to trust a waypoint or initial epoch validator set
2. **Efficient Proofs**: Merkle proofs are logarithmic in tree size
3. **Accumulator Ratcheting**: TransactionAccumulatorSummary allows incremental proof verification
4. **Epoch-based Security**: Validator set changes are cryptographically proven
5. **Non-Inclusion Proofs**: Can prove absence of data (non-membership)
6. **Batch Verification**: Range proofs enable efficient multi-transaction verification
7. **Immutable History**: Append-only accumulator ensures transaction history integrity

## Integration with External Systems

The proof system is designed for:
- **Light wallets**: Verify account balance and transactions
- **Cross-chain bridges**: Provide cryptographic proofs of Aptos state
- **Indexers**: Verify historical data authenticity
- **Archive nodes**: Verify state at historical versions
- **DeFi protocols**: Verify on-chain state changes

All proofs are deterministically generated and can be verified independently without access to the full blockchain.
