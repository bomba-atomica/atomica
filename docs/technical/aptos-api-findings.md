# Aptos REST API Endpoint Definitions and Documentation - Search Results

## Overview

This document summarizes findings from a comprehensive search of the Atomica codebase for Aptos REST API endpoint definitions, documentation, and proof generation APIs. The search focused on state proofs, transaction proofs, merkle proofs, and REST API specifications.

---

## 1. API ENDPOINT DEFINITIONS

### Conceptual API Endpoints (From aptps_state_proof.md)

The following REST API endpoints are documented as how Aptos full nodes would expose proof functionality:

**1.1 State Proof Endpoint**
```
GET /v1/state_proof?known_version={version}
Returns: StateProof
Description: Get state proof from a known version to the latest blockchain state
```

**1.2 Transaction Proof Endpoint**
```
GET /v1/transactions/{version}/proof?ledger_version={version}
Returns: TransactionWithProof
Description: Get transaction with inclusion proof at specific version
Parameters:
  - version: Transaction version
  - ledger_version: Current ledger version for proof
```

**1.3 Account State Proof Endpoint**
```
GET /v1/accounts/{address}/state/{key}/proof?version={version}
Returns: StateValueWithProof
Description: Get account state value with Merkle proof
Parameters:
  - address: Account address
  - key: State key within account
  - version: Version at which to retrieve proof
```

**1.4 Epoch Change Proof Endpoint**
```
GET /v1/epochs/{start_epoch}/proof?end_epoch={end_epoch}
Returns: EpochChangeProof
Description: Get proof of validator set changes across epochs
Parameters:
  - start_epoch: Starting epoch
  - end_epoch: Ending epoch
```

**1.5 Transaction Submission Endpoint (Custom Implementation)**
```
POST /submit
Request body:
{
  ethereum_address: string,
  ethereum_signature: string,
  raw_transaction: RawTransaction,
  dapp_domain: string
}
Returns: { txHash: string }
Description: Submit Ethereum-signed transaction to Atomica
```

**1.6 Transaction Status Endpoint**
```
GET /transactions/{txHash}
Returns: TransactionStatus
Description: Get status of submitted transaction
Parameters:
  - txHash: Aptos transaction hash
```

---

## 2. PROOF STRUCTURES AND REQUEST/RESPONSE FORMATS

### 2.1 StateProof Structure
**File:** `docs/technical/aptos_proof_systems_summary.md`

```rust
pub struct StateProof {
    latest_li_w_sigs: LedgerInfoWithSignatures,
    epoch_changes: EpochChangeProof,
}
```

**Components:**
- `latest_li_w_sigs`: Most recent LedgerInfoWithSignatures with validator signatures
- `epoch_changes`: EpochChangeProof documenting all epoch changes to reach latest epoch

**Usage:**
```rust
// Request from full node
let state_proof: StateProof = full_node.get_state_proof(trusted_state.version())?;

// Verify and update trusted state
match trusted_state.verify_and_ratchet(&state_proof)? {
    TrustedStateChange::Epoch { new_state, .. } => {
        trusted_state = new_state;  // Validator set changed
    }
    TrustedStateChange::Version { new_state } => {
        trusted_state = new_state;  // Version updated, same epoch
    }
    TrustedStateChange::NoChange => {}  // Already up to date
}
```

### 2.2 Transaction Accumulator Proofs

**AccumulatorProof<H>**
- Proves inclusion of a transaction at a specific index
- Stores sibling hashes from leaf to root
- Type: Binary Merkle tree proof

**TransactionAccumulatorProof**
- Specialized AccumulatorProof using TransactionAccumulatorHasher
- Verification: `verify(root_hash, element_hash, element_index)`

**TransactionAccumulatorRangeProof**
- Proves a range of consecutive transactions
- Contains left_siblings and right_siblings
- Verifies batch of transactions from first_leaf_index through multiple leaves

**TransactionAccumulatorSummary**
- In-memory representation of transaction accumulator (frozen subtree roots)
- Methods:
  - `verify_consistency(ledger_info)`
  - `try_from_genesis_proof(proof, version)`
  - `try_extend_with_proof(proof, target_li)`

**AccumulatorConsistencyProof**
- Proves two accumulators are consistent (one extends the other)
- Contains subtree roots representing new leaves
- Essential for light clients to trustlessly advance accumulator

### 2.3 Sparse Merkle Tree Proofs

**SparseMerkleProof**
- Proves state value existence or non-existence in state tree
- Contains optional SparseMerkleLeafNode and sibling hashes
- Supports both inclusion and non-inclusion proofs
- Methods:
  - `verify(root_hash, key, value)`
  - `verify_by_hash(root_hash, key, element_hash)`
  - `verify_by_hash_partial(root_hash, key, element_hash, root_depth)`

**SparseMerkleProofExt**
- Extended version with detailed sibling node information
- Supports partial proofs with root_depth
- Better for complex verification scenarios

**SparseMerkleRangeProof**
- Proves range of consecutive leaves from leftmost to rightmost known
- Stores right_siblings for path from root to last leaf

### 2.4 Transaction Info Proofs

**TransactionInfoWithProof**
```rust
pub struct TransactionInfoWithProof {
    pub ledger_info_to_transaction_info_proof: TransactionAccumulatorProof,
    pub transaction_info: TransactionInfo,
}
```
- Proves a specific transaction and its effects at a version
- Method: `verify(ledger_info, transaction_version)`

**TransactionInfoListWithProof**
- Proves list of consecutive transaction infos
- Uses TransactionAccumulatorRangeProof
- Methods:
  - `verify(ledger_info, first_version)`
  - `verify_extends_ledger(num_txns, root_hash, first_version)`

---

## 3. STORAGE API FOR PROOF GENERATION

**File:** `docs/technical/aptps_state_proof.md`

Key methods available from AptosDB storage layer:

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

**Implementation Location:** `storage/aptosdb/src/db/aptosdb_reader.rs:597-670`

---

## 4. LIGHT CLIENT VERIFICATION FLOW

### 4.1 Bootstrap (Initial Setup)

```rust
// 1. Obtain a trusted waypoint (from secure channel)
let waypoint = Waypoint::from_str("12345:0xabc123...")?;
let mut trusted_state = TrustedState::from_epoch_waypoint(waypoint);
```

**Waypoint Format:** `version:hash_value` (e.g., "1000000:abc123...")

### 4.2 Synchronization Loop

```rust
// 1. Request StateProof from full node
let state_proof: StateProof = full_node.get_state_proof(trusted_state.version())?;

// 2. Verify and update trusted state
match trusted_state.verify_and_ratchet(&state_proof)? {
    TrustedStateChange::Epoch { new_state, .. } => {
        trusted_state = new_state;  // Validator set changed
    }
    TrustedStateChange::Version { new_state } => {
        trusted_state = new_state;  // Version only
    }
    TrustedStateChange::NoChange => {}
}
```

### 4.3 State Verification

```rust
// Get account state with proof
let (state_value, proof) = full_node.get_state_value_with_proof(
    &account_key,
    trusted_state.version()
)?;

// Verify against trusted root hash
proof.verify(trusted_state.waypoint().value(), state_value.hash())?;
```

---

## 5. RELATED DATA STRUCTURES

### 5.1 EpochChangeProof
**Location:** `types/src/epoch_change.rs:39`

```rust
pub struct EpochChangeProof {
    pub ledger_info_with_sigs: Vec<LedgerInfoWithSignatures>,
    pub more: bool,  // Indicates if more epochs follow
}
```

- Chain of epoch-ending LedgerInfos with signatures
- Each LI contains next epoch's validator set
- Verification: Iterative chain verification with validator set updates

### 5.2 LedgerInfo

- Contains: epoch, version, transaction accumulator root, timestamp
- Signed by 2/3+ validators using BFT aggregate signatures
- Commits to entire blockchain state via root hashes

### 5.3 TrustedState (Light Client State)
**Location:** `types/src/trusted_state.rs:27`

```rust
pub enum TrustedState {
    EpochWaypoint(Waypoint),  // Initial state at epoch boundary
    EpochState {
        waypoint: Waypoint,
        epoch_state: EpochState,  // Validator set for current epoch
    },
}
```

**Key method:** `verify_and_ratchet()` at line 138
- Takes StateProof from upstream node
- Cryptographically verifies epoch changes and signatures
- Updates trusted state to new version
- Returns TrustedStateChange

---

## 6. MERKLE TREE IMPLEMENTATIONS

### 6.1 Jellyfish Merkle Tree
**Location:** `storage/jellyfish-merkle/src/lib.rs`

- 256-bit sparse Merkle tree with optimization
- Subtrees with 0-1 leaves replaced by leaf or placeholder
- Uses InternalNode (16 children) and LeafNode
- Public API: `get_with_proof(key, version)` returns (value, SparseMerkleProof)

### 6.2 Merkle Accumulator
**Location:** `storage/accumulator/src/lib.rs`

- Append-only accumulator for transaction history
- Frozen nodes (immutable) and non-frozen nodes (changing)
- Methods:
  - `append(leaves)` - Add new transactions
  - `get_proof(leaf_index)` - Get transaction inclusion proof
  - `get_range_proof(first, count)` - Batch proof generation

---

## 7. PROOF VERIFICATION FLOW

### Step 1: Bootstrap
Light clients start with a trusted **Waypoint** (version + hash) from:
- Network configuration files
- Social consensus
- Trusted third parties
- Previous successful sync

### Step 2: Request StateProof
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

---

## 8. PROOF SIZE CONSIDERATIONS

From `aptps_state_proof.md`:

- **Waypoint**: ~64 bytes (version + hash)
- **AccumulatorProof**: ~2KB (63 siblings max)
- **SparseMerkleProof**: ~8KB (256 levels, optimized with placeholders)
- **EpochChangeProof**: Variable (depends on epoch changes)
- **StateProof**: ~10-50KB typically

---

## 9. PROOF VERIFICATION GUARANTEES

The system provides cryptographic guarantees that:

1. **Consensus signatures are valid** - BFT validator signatures verify 2/3+ validators signed
2. **Merkle proofs are correct** - All state values can be traced to root hash in signed LedgerInfo
3. **Epoch transitions are valid** - Validator set changes are chained and verifiable
4. **Transaction inclusion** - Any transaction can be proven to exist at specific version
5. **State consistency** - Accumulator consistency proofs ensure blockchain only extends, never forks

---

## 10. ETHEREUM CROSS-CHAIN INTEGRATION

### 10.1 Custom Transaction Submission (From ethereum-wallet-atomica-bridge.md)

**Endpoint:** `POST https://atomica-rpc.example.com/submit`

**Request Format:**
```typescript
{
  ethereum_address: string,
  ethereum_signature: string,
  raw_transaction: RawTransaction,
  dapp_domain: string
}
```

**Response:**
```typescript
{
  txHash: string  // Atomica transaction hash
}
```

### 10.2 Transaction Status Check

**Endpoint:** `GET https://atomica-rpc/transactions/{txHash}`

**Response:**
```typescript
{
  confirmed: boolean,
  blockNumber?: number,
  gasUsed?: number,
  failed?: boolean,
  error?: string
}
```

### 10.3 Ethereum State Proof Endpoints

**Verify Account State:**
```
POST /verify_account_state
{
  accountKey: string,      // Ethereum address
  stateValue: string,      // State value data
  proof: string[]          // Sparse Merkle proof siblings
}
```

### 10.4 Solidity Contract Interfaces

From `aptos_ethereum_bridge_implementation.md`:

**AptosLightClient Contract Methods:**
```solidity
// Initialize with waypoint
function initialize(
    uint64 version,
    bytes32 stateRoot,
    bytes32 accumulator,
    uint64 timestamp,
    uint64 epoch,
    ValidatorInfo[] calldata validators
) external initializer

// Update state with proof
function updateState(
    bytes calldata stateProof,
    bytes calldata epochChangeProof
) external

// Verify account state
function verifyAccountState(
    bytes32 accountKey,
    bytes calldata stateValue,
    bytes calldata proof
) external view returns (bool)

// Verify transaction
function verifyTransaction(
    bytes32 txnHash,
    uint64 version,
    bytes calldata proof
) external view returns (bool)
```

---

## 11. ZK-SNARK BASED VERIFICATION

### 11.1 From aptos_zk_light_client.md

**Circuit: aptos_bls_verify.circom**
- Proves BLS signature verification off-chain
- Public inputs: messageHash, quorumVotingPower, stateRoot changes, epoch info
- Private inputs: BLS signatures, public keys, voting powers
- Proof system: Groth16 or Plonk

**Circuit Constraints:** ~10M constraints (100 validators)

**Proof Characteristics:**
- Proving time: 30-60 seconds
- Proof size: 256 bytes (Groth16) or 400 bytes (Plonk)
- Memory: 8-16 GB RAM
- On-chain verification cost: ~250K gas

**Batching Performance:**
- Single update: 250K gas
- 10 updates batched: 280K gas (~28K per update)
- 100 updates batched: 400K gas (~4K per update)

---

## 12. PERFORMANCE CHARACTERISTICS

### Proof Generation
- State proofs: O(log N) where N is state size
- Transaction proofs: O(log M) where M is transaction count
- Epoch proofs: O(E) where E is number of epoch changes

### Proof Verification
- Constant time signature verification (aggregate signatures)
- Logarithmic Merkle proof verification
- Linear epoch change verification

### Storage Requirements
- Full node: Complete state and history
- Light client: ~100KB (waypoint + current epoch state)
- Archival light client: Can prune proofs after verification

---

## 13. KEY FILES AND LOCATIONS

### Documentation Files Found
- `/Users/lucas/code/rust/atomica/docs/technical/aptps_state_proof.md`
- `/Users/lucas/code/rust/atomica/docs/technical/aptos_proof_systems_summary.md`
- `/Users/lucas/code/rust/atomica/docs/technical/aptos_ethereum_bridge_implementation.md`
- `/Users/lucas/code/rust/atomica/docs/technical/aptos_zk_light_client.md`
- `/Users/lucas/code/rust/atomica/docs/technical/ethereum-wallet-atomica-bridge.md`
- `/Users/lucas/code/rust/atomica/source/PROJECT_OVERVIEW.md`
- `/Users/lucas/code/rust/atomica/source/IMPLEMENTATION_SUMMARY.md`

### Implementation Directories
- `/Users/lucas/code/rust/atomica/source/diem-prover-native/`
- `/Users/lucas/code/rust/atomica/source/diem-prover-zkp/`
- `/Users/lucas/code/rust/atomica/source/diem-prover-plonk/`
- `/Users/lucas/code/rust/atomica/source/diem-prover-stwo/`
- `/Users/lucas/code/rust/atomica/source/diem-prover-circom/`
- `/Users/lucas/code/rust/atomica/source/diem-prover-sp1/`

---

## 14. USE CASES

The proof system enables:

1. **Light wallets** - Verify account balances and transactions without full blockchain
2. **Cross-chain bridges** - Cryptographically prove events/state to other chains
3. **Data indexers** - Verify data received from untrusted full nodes
4. **Compliance auditors** - Verify specific historical state
5. **Mobile clients** - Minimal storage requirements
6. **State attestation** - Prove on-chain state to external systems
7. **Token bridges** - Lock/mint/burn/unlock across chains
8. **Price oracles** - Verified prices from Aptos
9. **Governance** - Cross-chain voting
10. **NFT bridges** - Transfer NFTs with metadata

---

## SUMMARY

The Aptos REST API endpoints are **conceptually documented** but not fully implemented in this codebase. The search found:

✅ **Comprehensive API specifications** - Clear endpoint paths and request/response formats documented
✅ **Proof data structures** - Detailed definitions of all proof types (state, transaction, merkle)
✅ **Light client architecture** - Complete verification flow and usage examples
✅ **Smart contract interfaces** - Solidity contract methods for verification
✅ **ZK-SNARK implementations** - Off-chain BLS verification with proof generation
✅ **Performance metrics** - Gas costs, proof sizes, verification times
✅ **Ethereum integration** - Custom transaction submission and state verification endpoints

⚠️ **Not implemented:** Actual HTTP REST API handlers (no web framework code found)

The documentation provides production-ready specifications for implementing these endpoints on full nodes, suitable for developers building light clients, bridges, or cross-chain applications.

