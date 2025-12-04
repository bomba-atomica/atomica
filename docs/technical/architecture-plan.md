# Atomica Architecture Plan

**Document Type**: Technical Architecture Specification
**Status**: Living Document
**Last Updated**: 2025-12-03

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Cross-Chain State Verification](#cross-chain-state-verification)
4. [Account Abstraction & Wallet Integration](#account-abstraction--wallet-integration)
5. [Auction Mechanism](#auction-mechanism)
6. [Settlement & Double-Entry Accounting](#settlement--double-entry-accounting)
7. [Security Model](#security-model)
8. [Implementation Roadmap](#implementation-roadmap)

---

## System Overview

### Design Philosophy

Atomica is a **cross-chain sealed-bid auction protocol** that prioritizes:
- **Sealed auctions** - Timelock encryption prevents bid manipulation and MEV
- **Trustless verification** - Dual-layer security (BLS threshold + ZK proofs)
- **Gas efficiency** - Merkle-proof settlement minimizes transaction costs
- **User accessibility** - Standard wallet workflows via account abstraction
- **Unified architecture** - All away chains use identical verification mechanism

### High-Level Architecture

**Unified Cross-Chain Verification**

```
┌──────────────────────────────────────────────────────────────────┐
│                      Atomica Chain (Home)                         │
│  • Validators implement BLS threshold timelock (tlock)            │
│  • Sealed reserve prices + bids (tlock encrypted)                │
│  • Automatic decryption at auction deadline (2/3 threshold)       │
│  • Ausubel auction clearing in Move                               │
│  • Merkle root generated + BLS threshold signed                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ BLS-Signed Merkle Root + ZK Proof
                         │
┌────────────────────────┴─────────────────────────────────────────┐
│              All Away Chains (Unified Architecture)               │
│              Ethereum, Solana, Base, Arbitrum, etc.               │
│                                                                   │
│  • Time Lock contracts track validator pubkeys                   │
│  • Verify BLS threshold signatures on merkle root                │
│  • Verify ZK proof of auction computation                        │
│  • Enable withdrawals via merkle proofs                          │
│  • Gas-efficient: O(1) settlement cost per auction               │
└───────────────────────────────────────────────────────────────────┘
```

**Key Properties**:
1. **Sealed bids**: Validator timelock prevents MEV and manipulation
2. **Unified verification**: Same mechanism works on all chains (Ethereum = Solana = Base = ...)
3. **Dual security**: BLS consensus + ZK computation both must agree
4. **Gas efficiency**: 100x reduction vs per-user transactions

---

## Unified Away Chain Architecture

**Architectural Decision**: All away chains (Ethereum, Solana, Base, Arbitrum, Polygon, etc.) use **identical verification mechanisms**. There is no chain-specific architecture.

### Why Unified Architecture?

**Alternative Considered**:
- Chain-specific architectures: Merkle proofs + ZK for expensive chains (Ethereum), parallel execution for cheap chains (Solana)

**Chosen Approach**:
- **Single architecture** for ALL away chains
- Merkle-proof-based settlement with dual-layer verification
- Works identically regardless of chain gas costs
- Simplifies implementation, testing, and maintenance

### Gas Cost Analysis

| Chain | Cost/TX | Settlement (100 users) | Architecture |
|-------|---------|------------------------|--------------|
| Ethereum L1 | $10-50 | $50-100 (2 TXs: root + proof) | Unified |
| Arbitrum/Optimism | $0.10-$1 | $0.50-$2 | Unified |
| Base/Polygon | $0.01-$0.10 | $0.05-$0.20 | Unified |
| Solana/Sui | $0.0001-$0.001 | $0.0005-$0.002 | Unified |

**Key Insight**: Even on Solana where gas is negligible ($0.0005), the unified architecture provides:
- Better cross-chain consistency
- Single codebase to maintain
- Identical security model
- Easier auditing

**Trade-off**: Solana could support per-user transactions at low cost, but unified architecture prioritizes consistency over micro-optimization.

---

## Atomica Validator Timelock (tlock) Implementation

### Overview

Atomica uses **Atomica validators' BLS threshold signature infrastructure** to implement decentralized timelock encryption for sealed bids. This eliminates dependency on external services (like drand) while leveraging Aptos-core's battle-tested validator capabilities.

**Note on Technology**: Atomica chain is built using Aptos-core software (consensus, BLS cryptography, Move VM) as the blockchain implementation, but runs as an independent network with its own validators, governance, and token economics.

### BLS Threshold Signatures (via Aptos-core)

**Aptos-core Infrastructure Provides**:
- Validators maintain BLS12-381 key pairs
- Threshold signature scheme (t-of-n) already implemented
- Used for consensus and validator set changes
- Publicly verifiable aggregate signatures

**Atomica Implementation**:
- Leverage Aptos-core BLS threshold infrastructure for timelock encryption
- Atomica validators publish decryption shares at predefined times
- No additional cryptographic primitives needed
- Fully compatible with Aptos-core validator operations

### Timelock Encryption Scheme

**Encryption (Client-Side)**:
```rust
// 1. Get validator threshold public key
let validator_pubkey = get_validator_threshold_pubkey(auction_id, end_time);

// 2. Encrypt bid using IBE-style encryption
let bid = Bid {
    bidder: user_address,
    price: 1500,
    quantity: 10
};
let ciphertext = ibe_encrypt(validator_pubkey, bid, end_time);

// 3. Submit encrypted bid to Atomica
submit_bid(auction_id, ciphertext);
```

**Decryption (Validator Threshold)**:
```rust
// At auction end time, validators automatically:
// 1. Each validator generates decryption share
let decryption_share = validator.generate_decryption_share(
    auction_id,
    end_time
);

// 2. Broadcast decryption share
broadcast_decryption_share(auction_id, decryption_share);

// 3. Once t-of-n shares received, anyone can combine
if shares.len() >= threshold {
    let decryption_key = combine_shares(shares);
    let bid = decrypt(ciphertext, decryption_key);
}
```

### Integration with Aptos Consensus

**Validator Responsibilities**:
1. **Block Production** (existing): Propose and vote on blocks
2. **State Certification** (existing): Sign state roots with BLS
3. **Decryption Share Generation** (new): Publish shares for expired timelocks

**Timing Mechanism**:
```move
module atomica::timelock {
    /// Validators check at each block if decryption shares needed
    public fun maybe_publish_decryption_shares(current_time: u64) {
        let expired_auctions = get_auctions_ending_at(current_time);

        for auction in expired_auctions {
            let share = generate_decryption_share(
                auction.id,
                auction.end_time
            );

            // Emit event for off-chain indexers
            emit_decryption_share_event(auction.id, share);

            // Store on-chain for on-chain decryption
            store_decryption_share(auction.id, share);
        }
    }
}
```

**Liveness Guarantee**: As long as t-of-n validators are online, decryption will succeed. This matches Aptos consensus liveness assumptions.

### Security Properties

**Privacy During Auction**:
- Bids encrypted with threshold public key
- No single validator can decrypt
- Requires t-of-n validator collusion to decrypt early
- Standard: t = 2/3, matching BFT security assumptions

**Decryption Guarantee**:
- Validators automatically publish shares at deadline
- Economic incentive: validators earn fees from auction
- Reputation incentive: failure hurts validator standing
- Fallback: users can petition for decryption if validators stall

**MEV Resistance**:
- Sealed bids prevent validators from front-running
- Threshold requirement prevents single-validator manipulation
- Decryption timing is deterministic (block height or timestamp)

### Comparison to drand

| Feature | drand | Atomica Validator tlock |
|---------|-------|------------------------|
| **Decentralization** | Separate network | Uses Atomica validators |
| **External Dependency** | Yes (drand.love) | No |
| **Liveness** | Separate liveness assumption | Shares Atomica liveness |
| **Integration** | Must sync drand rounds | Native to Atomica |
| **Security Assumption** | Trust League of Entropy | Trust Atomica validators |
| **Latency** | 30 second rounds | Block-level precision |
| **Cost** | Free (external) | Internal to protocol |

**Decision Rationale**: Using Atomica validators eliminates external dependencies while providing equivalent security guarantees. Validators are already trusted for consensus; timelock adds minimal additional trust.

---

## Research Topics for Aptos-core Integration

The following research areas require investigation to implement the Atomica validator timelock scheme using Aptos-core infrastructure:

### 1. BLS Threshold Signature Infrastructure

**Questions**:
- Does Aptos currently support threshold BLS signatures (t-of-n) or only aggregate signatures?
- What is the current threshold parameter (t/n ratio)?
- Can validators generate decryption shares independently without coordinator?
- Are there APIs for accessing validator public keys and generating threshold keys?

**Investigation**:
- Review `aptos-crypto` crate for BLS threshold implementation
- Check `aptos-types` for validator set and key management APIs
- Examine consensus implementation for threshold signature usage
- Look for existing decentralized key generation (DKG) implementations

**Relevant Code**:
- `crates/aptos-crypto/src/bls12381/`
- `types/src/validator_set.rs`
- `consensus/src/`

### 2. Identity-Based Encryption (IBE) for Timelock

**Questions**:
- Can BLS signatures be repurposed for IBE-style encryption?
- What is the cryptographic construction for BLS-based timelock encryption?
- Are there existing IBE implementations compatible with BLS12-381?
- What is the ciphertext overhead for IBE encryption?

**Investigation**:
- Research BLS-based IBE schemes (Boneh-Franklin, BF-IBE)
- Investigate pairing-based encryption on BLS12-381 curve
- Check for Rust libraries: `bls12_381`, `pairing`, `group`
- Evaluate ciphertext size and encryption/decryption performance

**Relevant Resources**:
- Boneh-Franklin Identity Based Encryption (BF-IBE) paper
- `bls12_381` Rust crate documentation
- drand `tlock` scheme (reference implementation)

### 3. Validator Economic Incentives

**Questions**:
- How are validators incentivized to publish decryption shares?
- Should decryption share publication be mandatory (protocol-level)?
- What happens if validators fail to publish shares?
- Can we slash validators for not publishing decryption shares?

**Investigation**:
- Review Aptos validator reward structure
- Examine slashing conditions in Aptos
- Design incentive mechanism for timely decryption share publication
- Consider auction fee distribution to validators

**Relevant Code**:
- `aptos-move/framework/aptos-framework/sources/staking_contract.move`
- `aptos-move/framework/aptos-framework/sources/stake.move`

### 4. Timing and Block Height Integration

**Questions**:
- Should auction deadlines be block height or timestamp based?
- How accurate is Aptos block time (for timestamp-based deadlines)?
- Can validators determine at block N which auctions need decryption?
- What is the latency between deadline and decryption share availability?

**Investigation**:
- Review Aptos block time variance and consistency
- Examine `timestamp` module in Aptos framework
- Design efficient indexing for expired auctions
- Consider off-chain vs on-chain decryption approaches

**Relevant Code**:
- `aptos-move/framework/aptos-framework/sources/timestamp.move`
- `aptos-move/framework/aptos-framework/sources/block.move`

### 5. Decryption Share Aggregation

**Questions**:
- Who aggregates decryption shares (validators, off-chain clients, or contracts)?
- Should aggregation happen on-chain or off-chain?
- What is the gas cost for on-chain share verification and combination?
- Can we optimize share size for on-chain storage?

**Investigation**:
- Benchmark BLS signature aggregation gas costs in Move
- Design share aggregation protocol (on-chain vs off-chain)
- Consider lazy decryption (decrypt only when needed for auction clearing)
- Evaluate trade-offs: gas cost vs decryption latency

**Relevant Code**:
- `aptos-move/framework/aptos-stdlib/sources/cryptography/`
- Native function implementations for BLS operations

### 6. Fallback Mechanisms

**Questions**:
- What if < t validators publish decryption shares?
- Can users petition for decryption after extended delay?
- Should there be a timeout for auction cancellation?
- How to handle validator set rotation during auction?

**Investigation**:
- Design timeout and fallback logic
- Consider social recovery mechanisms (governance vote)
- Handle edge case: validator set changes mid-auction
- Ensure auction liveness even with validator failures

### 7. Move Contract Integration

**Questions**:
- Can Move contracts directly call BLS cryptographic primitives?
- Are there native functions for BLS operations in Aptos VM?
- What is the gas cost for BLS operations in Move?
- How to store encrypted bids efficiently in Move?

**Investigation**:
- Review native function APIs in Aptos Move
- Check `aptos_std::cryptography` module capabilities
- Benchmark gas costs for BLS operations
- Design storage schema for encrypted bid data

**Relevant Code**:
- `aptos-move/framework/aptos-stdlib/sources/cryptography/bls12381.move`
- `aptos-move/framework/aptos-natives/`

### 8. Cross-Chain Synchronization

**Questions**:
- How do away chains verify validator threshold public keys?
- What is the update frequency for validator set changes?
- Can away chains verify BLS threshold signatures efficiently?
- What is the gas cost for BLS verification on Ethereum/Solana?

**Investigation**:
- Review BLS signature verification costs on target chains
- Design validator set synchronization protocol
- Consider using ZK proofs to wrap BLS verification (if too expensive)
- Ensure validator keys are kept up-to-date on away chains

**Relevant**:
- Ethereum: EIP-2537 (BLS precompile) or ZK-wrapped verification
- Solana: Native BLS support via syscalls

---

## Implementation Priority

Based on research topics, recommended investigation order:

**Phase 1: Feasibility Assessment** (2-3 weeks)
1. BLS threshold signature infrastructure in Aptos
2. IBE construction feasibility with BLS12-381
3. Validator economic incentives and protocol integration

**Phase 2: Cryptographic Design** (3-4 weeks)
4. Timelock encryption scheme design and specification
5. Decryption share generation and aggregation protocol
6. Security analysis and threat modeling

**Phase 3: Integration Design** (2-3 weeks)
7. Move contract integration and gas cost analysis
8. Timing mechanisms and block height integration
9. Fallback and fault tolerance design

**Phase 4: Cross-Chain Implementation** (3-4 weeks)
10. Cross-chain validator synchronization
11. Away chain BLS verification (direct or ZK-wrapped)
12. End-to-end testing and auditing

**Total Estimated Research & Design**: 10-14 weeks

---
## Component Architecture

### 1. Atomica Chain Components

#### 1.1 Validator System

**Responsibilities**:
- Consensus on auction state transitions
- BLS signature generation for state proofs
- Validator set rotation with cryptographic handoffs

**Key Features**:
- BLS12-381 aggregate signatures for efficient verification
- Quorum threshold: 2f+1 voting power
- Epoch-based validator set changes

**Implementation Details**: See [Aptos State Proof](./aptps_state_proof.md) for full specification of:
- `StateProof` structure and verification
- `TrustedState` management
- Waypoint bootstrap mechanism
- Epoch change proofs

#### 1.2 Auction Logic (Move Smart Contracts)

**Core Contracts**:
- `AuctionManager` - Auction lifecycle management
- `BidRegistry` - Sealed bid storage and validation
- `SettlementEngine` - Merkle tree generation and balance computation

**Auction Flow**:
1. Auction initialization with asset specifications
2. Sealed bid submission using timelock encryption (see [Timelock Bids](./timelock-bids.md))
3. Bid decryption after auction deadline via drand
4. Auction clearing and winner determination
5. Merkle tree generation of final balances

**Key State**:
```move
struct Auction {
    auction_id: u64,
    start_time: u64,
    end_time: u64,
    asset_pairs: vector<AssetPair>,
    sealed_bids: vector<SealedBid>,
    merkle_root: vector<u8>,  // Final balance merkle root
    status: AuctionStatus,
}
```

**Auction Mechanism**: See [game-theory/](../game-theory/) for:
- [Ausubel auction mechanics](../game-theory/ausubel-clinching-clock.md)
- [MEV resistance strategies](../game-theory/ausubel-mev-mitigation.md)
- [Sealed bid alternatives analysis](../game-theory/sealed-bid-alternatives.md)

#### 1.3 State Proof Generation API

**Capabilities**:
- Generate BLS-signed proofs for any on-chain state
- Merkle root state proofs for auction completion
- Validator set change proofs

**API Endpoints**:
```rust
// Get state proof with BLS signatures
GET /v1/state_proof?version={version}

// Get merkle proof for specific account balance
GET /v1/merkle_proof?auction_id={id}&account={address}

// Get validator set for epoch
GET /v1/validator_set?epoch={epoch}
```

**Technical Reference**: See [Aptos State Proof](./aptps_state_proof.md) for proof generation details.

#### 1.4 Aptos Full Node Proof APIs

Atomica full nodes expose comprehensive REST APIs for generating and retrieving cryptographic proofs. These APIs enable trustless verification of on-chain state by external parties without requiring full node operation.

**Available Proof Types**:

##### 1.4.1 StateProof - Light Client Synchronization

**Endpoint**: `GET /v1/state_proof?known_version={version}`

**Purpose**: Primary light client update mechanism - synchronize from known version to latest blockchain state

**Response Structure**:
```rust
pub struct StateProof {
    latest_li_w_sigs: LedgerInfoWithSignatures,  // Latest state + validator signatures
    epoch_changes: EpochChangeProof,             // Validator set changes
}
```

**Use Cases**:
- Light client synchronization
- Validator set updates on away chains
- Trustless state verification

**Verification Process**:
1. Client maintains `TrustedState` with current version
2. Requests `StateProof` from full node
3. Verifies BLS signatures and epoch changes
4. Updates trusted state to new version

**Performance**:
- Proof size: ~10-50 KB (typical)
- Verification time: <100ms (BLS signature check)
- Update frequency: Per epoch or on-demand

##### 1.4.2 TransactionWithProof - Transaction Inclusion

**Endpoint**: `GET /v1/transactions/{version}/proof?ledger_version={version}&include_events={bool}`

**Purpose**: Prove specific transaction occurred at given version

**Response Structure**:
```rust
pub struct TransactionWithProof {
    version: Version,
    transaction: Transaction,
    proof: TransactionInfoWithProof,
    events: Option<Vec<Event>>,
}

pub struct TransactionInfoWithProof {
    ledger_info_to_transaction_info_proof: TransactionAccumulatorProof,
    transaction_info: TransactionInfo,
}
```

**Proof Components**:
- **Transaction accumulator proof**: Binary Merkle tree proof (~2KB, O(log N))
- **Transaction info**: Hash, gas used, status, state root post-execution
- **Events**: Optional event logs from execution

**Use Cases**:
- Prove deposit transactions on Ethereum to Atomica
- Verify auction participation
- Cross-chain message passing

**Verification**:
```rust
proof.verify(
    ledger_info.transaction_accumulator_hash(),
    transaction.hash(),
    version
) -> Result<()>
```

##### 1.4.3 StateValueWithProof - Account/Resource State

**Endpoint**: `GET /v1/accounts/{address}/state/{key}/proof?version={version}`

**Purpose**: Prove specific account state or resource value with sparse Merkle proof

**Response Structure**:
```rust
pub struct StateValueWithProof {
    version: Version,
    value: Option<StateValue>,
    proof: SparseMerkleProof,
}

pub struct SparseMerkleProof {
    leaf: Option<SparseMerkleLeafNode>,
    siblings: Vec<HashValue>,  // Merkle branch from leaf to root
}
```

**Supported Queries**:
- Account balances
- Resource values (e.g., auction bids, user deposits)
- Contract state
- Non-existence proofs (proves key is not in state)

**Proof Size**: ~8KB (256-level sparse Merkle tree, optimized with placeholders)

**Use Cases for Atomica**:
- Verify user deposit on Ethereum via Atomica light client
- Prove auction state to away chains
- Validate bid eligibility

**Example - Verify Deposit**:
```rust
// On Atomica: Query Ethereum deposit via light client
let (deposit_value, proof) = ethereum_light_client::get_state_with_proof(
    &deposit_key,
    version
)?;

// Verify against trusted Ethereum state root
proof.verify(
    ethereum_state_root,
    deposit_key,
    deposit_value.hash()
)?;
```

##### 1.4.4 EpochChangeProof - Validator Set Evolution

**Endpoint**: `GET /v1/epochs/{start_epoch}/proof?end_epoch={end_epoch}`

**Purpose**: Prove validator set changes across multiple epochs

**Response Structure**:
```rust
pub struct EpochChangeProof {
    ledger_info_with_sigs: Vec<LedgerInfoWithSignatures>,
    more: bool,
}
```

**Verification Chain**:
```
Epoch N validators sign LedgerInfo →
  Contains Epoch N+1 validator set →
    Epoch N+1 validators sign next LedgerInfo →
      Contains Epoch N+2 validator set →
        ...
```

**Use Cases**:
- Bootstrap away chain Time Lock contracts with validator sets
- Update validator public keys on Ethereum
- Enable trustless validator rotation

**Security Property**: Each epoch change is signed by 2f+1 voting power of the **previous** epoch's validators, preventing unauthorized validator set changes.

**Critical for Atomica**: This proof type enables away chains to trustlessly track Atomica's validator set without relying on oracles.

##### 1.4.5 TransactionAccumulatorRangeProof - Batch Verification

**Purpose**: Prove multiple consecutive transactions efficiently

**Use Case**: Batch-verify auction bid submissions or settlement transactions

**Structure**:
```rust
pub struct TransactionAccumulatorRangeProof {
    left_siblings: Vec<HashValue>,
    right_siblings: Vec<HashValue>,
}
```

**Efficiency**: Verify N transactions with O(log M) proof size where M is total transaction count

##### 1.4.6 AccumulatorConsistencyProof - Chain Extension

**Purpose**: Prove transaction accumulator was extended correctly (append-only property)

**Use Case**: Light clients verify blockchain only grows, never forks

**Structure**:
```rust
pub struct AccumulatorConsistencyProof {
    subtrees: Vec<HashValue>,
}
```

**Verification**: Proves accumulator at version V1 is prefix of accumulator at version V2

#### 1.5 Storage Layer Proof Generation

**Implementation Location**: `storage/aptosdb/src/db/aptosdb_reader.rs`

Atomica full nodes generate proofs using storage APIs:

```rust
// State proof from known version to latest
fn get_state_proof(&self, known_version: u64) -> Result<StateProof>

// Transaction with inclusion proof
fn get_transaction_with_proof(
    &self,
    version: Version,
    ledger_version: Version,
    include_events: bool
) -> Result<TransactionWithProof>

// State value with sparse Merkle proof
fn get_state_proof_by_version_ext(
    &self,
    key_hash: &HashValue,
    version: Version,
    root_depth: usize,
) -> Result<SparseMerkleProofExt>

// Epoch change proofs
fn get_epoch_ending_ledger_infos(
    &self,
    start_epoch: u64,
    end_epoch: u64,
) -> Result<EpochChangeProof>

// Account state with proof
fn get_account_state_with_proof(
    &self,
    address: AccountAddress,
    version: Version,
) -> Result<(Option<AccountState>, SparseMerkleProof)>
```

**Performance Characteristics**:
- Proof generation: O(log N) for Merkle proofs
- Storage overhead: Minimal (proofs computed on-demand)
- Concurrency: Thread-safe proof generation

#### 1.6 Proof Verification Flow for Atomica

**Complete Cross-Chain Verification Example**:

```rust
// 1. Bootstrap light client with trusted waypoint
let waypoint = Waypoint::from_str("12345:0xabc123...")?;
let mut trusted_state = TrustedState::from_epoch_waypoint(waypoint);

// 2. Synchronize to latest Atomica state
let state_proof = atomica_fullnode.get_state_proof(trusted_state.version())?;
trusted_state.verify_and_ratchet(&state_proof)?;

// 3. Get auction completion event with proof
let (auction_event, tx_proof) = atomica_fullnode.get_transaction_with_proof(
    auction_completion_version,
    trusted_state.version(),
    true  // include events
)?;

// 4. Extract merkle root from verified event
let merkle_root = extract_merkle_root(&auction_event)?;

// 5. Submit to Ethereum Time Lock contract
ethereum_timelock.submitAuctionResult(
    auction_id,
    merkle_root,
    state_proof.serialize(),
    bls_signature
)?;
```

**Security Guarantees**:
- All proofs cryptographically bind to BLS-signed LedgerInfo
- Merkle proofs ensure state consistency
- 2f+1 validator signatures required (BFT security)
- No trust in full node serving proofs (all data verified)

**Proof Size Summary**:

| Proof Type | Size | Verification Cost |
|------------|------|-------------------|
| Waypoint | ~64 bytes | O(1) |
| StateProof | ~10-50 KB | ~100ms (BLS) |
| AccumulatorProof | ~2 KB | ~30K gas (Ethereum) |
| SparseMerkleProof | ~8 KB | ~50K gas (Ethereum) |
| EpochChangeProof | Variable | ~100K gas per epoch |

**API Performance**:
- Proof generation latency: <100ms typical
- Concurrent requests: Supported
- Rate limiting: Configurable per full node

**Reference Implementation**: See [Aptos State Proof](./aptps_state_proof.md) for complete verification logic and examples.

### 2. Away Chain Components (Ethereum/Solana)

#### 2.1 Time Lock Contracts

**Purpose**: Atomic deposit management for auction participants

**Core Functions**:
```solidity
contract AtomicaTimeLock {
    // Deposit assets for auction participation
    function deposit(
        uint256 auctionId,
        address token,
        uint256 amount
    ) external;

    // Withdraw after auction completion or timeout
    function withdraw(
        uint256 auctionId,
        bytes32[] merkleProof
    ) external;

    // Update validator set with BLS proof
    function updateValidatorSet(
        uint64 newEpoch,
        bytes calldata validatorSetProof,
        bytes calldata blsSignature
    ) external;

    // Submit auction merkle root with BLS proof
    function submitAuctionResult(
        uint256 auctionId,
        bytes32 merkleRoot,
        bytes calldata stateProof,
        bytes calldata blsSignature
    ) external;

    // Execute settlement with ZK proof verification
    function executeSettlement(
        uint256 auctionId,
        bytes calldata zkProof,
        bytes32 merkleRoot
    ) external;
}
```

**State Management**:
- Validator public keys (BLS12-381, 48 bytes each)
- Epoch number and quorum threshold
- Auction merkle roots (submitted via BLS-signed proofs)
- User deposit balances

**Security Properties**:
- Deposits locked only during auction duration
- No custody risk - users control withdrawal
- Time-based automatic unlocking on failure

**Full Specification**: See [Timelock Bids](./timelock-bids.md) for detailed design.

#### 2.2 BLS Signature Verification

**Challenge**: BLS12-381 signature verification is expensive on Ethereum

**Solution Options**:

1. **Direct Verification** (EIP-2537)
   - Gas cost: ~300,000 gas per update
   - Immediate finality
   - Supported natively post-EIP-2537

2. **ZK-SNARK Wrapped Verification** (Recommended)
   - Gas cost: ~250,000 gas per update
   - 5-30 minute latency for proof generation
   - Enables batching of multiple signature verifications
   - **See**: [ZK Light Client](./aptos_zk_light_client.md) for implementation

3. **Optimistic Verification** (Fallback)
   - Gas cost: ~50,000 gas
   - 1-7 day fraud proof window
   - Delayed finality

**Current Recommendation**: ZK-SNARK approach using Succinct SP1 (see [Cryptographic Stack Analysis](./cryptographic-stack-analysis.md)).

#### 2.3 Gas Sponsorship for Proof Submissions

**Challenge**: Proof submissions (validator set updates, auction results, ZK proofs) require gas on away chains. Without sponsorship, individual submitters bear the cost, creating friction and centralization risk.

**Goal**: Enable permissionless proof submission where the protocol or contract pays gas costs, not individual users.

**Architecture Options**:

##### Option 1: Contract-Funded Gas Pool (Recommended for Ethereum)

**Mechanism**: Time Lock contract maintains an ETH balance to reward proof submitters

```solidity
contract AtomicaTimeLock {
    // Gas reward pool
    uint256 public gasRewardPool;
    uint256 public rewardPerProofSubmission = 0.01 ether;  // Configurable

    // Protocol fee on deposits
    uint256 public protocolFeeRate = 50;  // 0.5% (basis points)

    function deposit(
        uint256 auctionId,
        address token,
        uint256 amount
    ) external payable {
        // Collect protocol fee
        uint256 protocolFee = (amount * protocolFeeRate) / 10000;
        gasRewardPool += protocolFee;

        // Store user deposit (minus fee)
        userDeposits[msg.sender][auctionId] += amount - protocolFee;

        emit Deposit(msg.sender, auctionId, amount, protocolFee);
    }

    function submitAuctionResult(
        uint256 auctionId,
        bytes32 merkleRoot,
        bytes calldata stateProof,
        bytes calldata blsSignature
    ) external {
        uint256 gasBefore = gasleft();

        // Verify BLS signature and store merkle root
        require(verifyBLSSignature(stateProof, blsSignature), "Invalid signature");
        auctionRoots[auctionId] = merkleRoot;

        // Calculate gas used
        uint256 gasUsed = gasBefore - gasleft();
        uint256 gasCost = gasUsed * tx.gasprice;

        // Reward submitter (gas cost + fixed incentive)
        uint256 reward = gasCost + rewardPerProofSubmission;
        require(gasRewardPool >= reward, "Insufficient reward pool");

        gasRewardPool -= reward;
        payable(msg.sender).transfer(reward);

        emit AuctionResultSubmitted(auctionId, merkleRoot, msg.sender, reward);
    }

    function updateValidatorSet(
        uint64 newEpoch,
        bytes calldata validatorSetProof,
        bytes calldata blsSignature
    ) external {
        uint256 gasBefore = gasleft();

        // Verify and update validator set
        _updateValidatorSet(newEpoch, validatorSetProof, blsSignature);

        // Reward submitter
        uint256 gasUsed = gasBefore - gasleft();
        uint256 reward = (gasUsed * tx.gasprice) + rewardPerProofSubmission;

        require(gasRewardPool >= reward, "Insufficient reward pool");
        gasRewardPool -= reward;
        payable(msg.sender).transfer(reward);

        emit ValidatorSetUpdated(newEpoch, msg.sender, reward);
    }

    // Admin function to top up gas pool
    function fundGasPool() external payable {
        gasRewardPool += msg.value;
    }
}
```

**Benefits**:
- Permissionless submission (anyone can submit proofs)
- Submitter paid for gas + small incentive
- Self-sustaining through protocol fees
- No external dependencies

**Economics**:
- Protocol fee: 0.5% of deposits
- Average auction: $100K TVL → $500 in fees
- Proof submission cost: ~$10-20 at 50 gwei
- Sustainable for 25-50 proof submissions per auction

##### Option 2: ERC-4337 Paymaster (Alternative for Ethereum)

**Mechanism**: Use Account Abstraction paymaster to sponsor proof submission transactions

```solidity
contract AtomicaPaymaster is BasePaymaster {
    // Paymaster validates UserOperations for proof submissions
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        // Verify this is a valid proof submission call
        require(
            isValidProofSubmission(userOp.callData),
            "Only proof submissions sponsored"
        );

        // Check paymaster has sufficient balance
        require(
            paymasterBalance >= maxCost,
            "Insufficient paymaster balance"
        );

        // Approve sponsorship
        paymasterBalance -= maxCost;
        return (abi.encode(userOp.sender), 0);
    }

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external override {
        // Refund unused gas to paymaster
        if (mode == PostOpMode.opSucceeded) {
            paymasterBalance += (maxCost - actualGasCost);
        }
    }
}
```

**Benefits**:
- Compatible with ERC-4337 infrastructure
- Fine-grained control over sponsored operations
- Can integrate with existing paymasters (Pimlico, Alchemy)

**Trade-offs**:
- More complex integration
- Requires ERC-4337 compatible wallet for submitters
- External dependencies on bundler infrastructure

##### Option 3: Automated Relayer Network (Gelato/Chainlink Automation)

**Mechanism**: Use existing automation networks to submit proofs automatically

```solidity
contract AtomicaTimeLock {
    // Register proof submission task with Gelato
    function registerProofSubmissionTask(uint256 auctionId) external {
        gelatoOps.createTask(
            address(this),                    // Target contract
            abi.encodeWithSelector(
                this.submitAuctionResult.selector,
                auctionId
            ),                                // Function to call
            ModuleData(...),                  // Execution conditions
            ETH                               // Payment token
        );
    }

    // Gelato-compatible resolver - checks if proof is ready
    function checkProofReady(uint256 auctionId)
        external
        view
        returns (bool canExec, bytes memory execPayload)
    {
        // Query Atomica full node for auction completion
        bool auctionComplete = _isAuctionComplete(auctionId);

        if (auctionComplete && auctionRoots[auctionId] == bytes32(0)) {
            return (
                true,
                abi.encodeWithSelector(
                    this.submitAuctionResult.selector,
                    auctionId
                )
            );
        }

        return (false, bytes(""));
    }
}
```

**Benefits**:
- Fully automated - no manual proof submission needed
- Professional infrastructure (uptime, monitoring)
- Can handle complex execution logic

**Trade-offs**:
- External dependency on relayer network
- Higher ongoing costs
- Less control over submission timing

##### Option 4: Solana-Specific Approach

For Solana away chains, gas costs are negligible (~$0.0001/transaction), making direct protocol payment practical:

```rust
// Solana program pays for proof verification from protocol treasury
#[program]
pub mod atomica_timelock {
    pub fn submit_auction_result(
        ctx: Context<SubmitAuctionResult>,
        auction_id: u64,
        merkle_root: [u8; 32],
        bls_signature: Vec<u8>
    ) -> Result<()> {
        // Verify BLS signature
        verify_bls_signature(&ctx.accounts.validator_set, &bls_signature)?;

        // Store merkle root
        ctx.accounts.timelock.auction_roots.insert(auction_id, merkle_root);

        // Transfer small SOL reward from protocol treasury to submitter
        **ctx.accounts.protocol_treasury.try_borrow_mut_lamports()? -= 1_000_000; // 0.001 SOL
        **ctx.accounts.submitter.try_borrow_mut_lamports()? += 1_000_000;

        Ok(())
    }
}
```

**Why Simple on Solana**:
- Transaction fees: ~0.000005 SOL ($0.0001)
- Protocol can easily fund millions of submissions
- No complex fee market dynamics

#### Recommended Approach Per Chain

| Chain | Mechanism | Rationale |
|-------|-----------|-----------|
| Ethereum | Contract-Funded Gas Pool | Self-sustaining, no external dependencies |
| Arbitrum/Optimism | Contract-Funded Gas Pool | Lower gas costs, same model works |
| Solana | Direct Protocol Payment | Negligible gas costs |
| Base/Polygon | Contract-Funded Gas Pool | Moderate gas costs, proven model |

#### Economic Sustainability

**Revenue Sources**:
1. **Protocol fees on deposits**: 0.5% of TVL
2. **Auction fees**: Optional small fee on auction participation
3. **Late withdrawal penalties**: Users who don't withdraw timely

**Cost Structure**:
```
Average Auction Economics:
- TVL: $100,000
- Protocol fee (0.5%): $500
- Number of proofs needed:
  * Validator set update (if epoch change): 1 × $20 = $20
  * Auction result submission: 1 × $15 = $15
  * ZK proof submission: 1 × $25 = $25
- Total proof costs: $60
- Net revenue per auction: $440
```

**Break-Even Analysis**:
- Minimum TVL per auction: ~$15,000 (for 0.5% fee)
- Expected TVL per auction: $50K-$500K (well above break-even)

**Safety Mechanisms**:
```solidity
// Circuit breaker if gas pool depleted
function submitAuctionResult(...) external {
    if (gasRewardPool < minimumPoolBalance) {
        // Fallback: Allow submission without reward
        // Or: Increase protocol fee temporarily
        emit GasPoolDepleted(gasRewardPool);
    }

    // Continue with proof verification...
}
```

#### Implementation Priority

**Phase 1 (MVP)**:
- Contract-Funded Gas Pool on Ethereum
- Manual top-ups of gas pool by protocol
- Fixed reward per submission

**Phase 2 (Optimization)**:
- Dynamic reward based on gas price
- Automated pool management
- Multi-chain support (Solana, L2s)

**Phase 3 (Decentralization)**:
- Optional: Integrate Gelato for automation
- Optional: ERC-4337 paymaster support
- Proof submission marketplace (competitive rewards)

#### Security Considerations

**Sybil Resistance**:
- Proofs can only be submitted once per auction/epoch
- Invalid proofs rejected (BLS signature verification fails)
- No economic incentive to spam

**DoS Prevention**:
```solidity
// Rate limiting on proof submissions
mapping(address => uint256) public lastSubmissionTime;
uint256 public minSubmissionInterval = 5 minutes;

function submitAuctionResult(...) external {
    require(
        block.timestamp >= lastSubmissionTime[msg.sender] + minSubmissionInterval,
        "Submission too frequent"
    );
    lastSubmissionTime[msg.sender] = block.timestamp;

    // Continue with verification...
}
```

**Griefing Prevention**:
- First valid submission wins reward
- Subsequent submissions of same proof revert
- No cost to contract if verification fails

---

## Cross-Chain State Verification

### Overview

The core challenge: trustlessly verify Atomica chain state on away chains (Ethereum/Solana) without oracles.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Application Logic                                  │
│  • Auction settlement contracts                              │
│  • User balance merkle proofs                                │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│  Layer 3: State Proof Verification                           │
│  • BLS signature verification (ZK-wrapped)                   │
│  • Merkle root validation                                    │
│  • Epoch change verification                                 │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│  Layer 2: ZK Light Client                                    │
│  • Validator set synchronization                             │
│  • State transition proofs                                   │
│  • Consensus verification                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│  Layer 1: Atomica Chain State                                │
│  • BLS validator signatures                                  │
│  • State proofs via API                                      │
│  • Merkle trees for auction results                          │
└─────────────────────────────────────────────────────────────┘
```

### Validator Set Synchronization

**Genesis State**:
- Time Lock contract initialized with current validator set
- BLS public keys stored on-chain
- Epoch number and quorum threshold set

**Update Flow**:
1. Validator set changes on Atomica chain (new epoch)
2. State proof generated with old validator signatures
3. Anyone submits proof to away chain Time Lock contract
4. Contract verifies BLS signatures against current known validators
5. Validator set updated on-chain

**Proof Structure**:
```rust
struct ValidatorSetUpdate {
    old_epoch: u64,
    new_epoch: u64,
    new_validators: Vec<ValidatorInfo>,
    quorum_threshold: u128,
    state_proof: StateProof,  // Signed by old validator set
    bls_signature: AggregateSignature,
}
```

**Security**: Only valid if signed by 2f+1 voting power of **old** validator set, preventing unauthorized updates.

**Implementation**: See [Cross-Chain Verification](./cross-chain-verification.md) and [Aptos-Ethereum Bridge Implementation](./aptos_ethereum_bridge_implementation.md).

### Merkle Root Submission

**Auction Completion Flow**:
1. Auction completes on Atomica chain
2. Settlement engine computes final balances
3. Merkle tree constructed: `leaf = hash(account, asset, balance)`
4. Merkle root stored in on-chain state
5. State proof generated with BLS signatures
6. Anyone submits merkle root + proof to away chain

**Proof Verification**:
```solidity
function submitAuctionResult(
    uint256 auctionId,
    bytes32 merkleRoot,
    bytes calldata stateProof
) external {
    // 1. Verify BLS signatures against current validator set
    require(
        verifyBLSSignature(stateProof, currentValidatorSet),
        "Invalid signature"
    );

    // 2. Extract merkle root from signed state
    bytes32 stateMerkleRoot = extractMerkleRoot(stateProof);
    require(stateMerkleRoot == merkleRoot, "Root mismatch");

    // 3. Store merkle root
    auctionRoots[auctionId] = merkleRoot;

    emit AuctionResultSubmitted(auctionId, merkleRoot);
}
```

### ZK Proof Verification

**Off-Chain Computation**:
- Client technology processes auction bid logs
- ZK circuit computes settlement from bid data
- Circuit outputs merkle root of final balances

**Circuit Constraints** (Simplified):
```
CIRCUIT AuctionSettlement:
  PRIVATE INPUTS:
    - bids: Vec<Bid>
    - initial_balances: Vec<Balance>

  PUBLIC OUTPUTS:
    - merkle_root: Hash

  CONSTRAINTS:
    1. All bids are properly decrypted
    2. Auction clearing price computed correctly
    3. Winner allocation matches auction rules
    4. Final balances = initial_balances + settlement
    5. merkle_root = MerkleTree(final_balances).root
```

**Settlement Execution**:
```solidity
function executeSettlement(
    uint256 auctionId,
    bytes calldata zkProof,
    bytes32 computedMerkleRoot
) external {
    // 1. Verify ZK proof that settlement was computed correctly
    require(
        zkVerifier.verify(zkProof, computedMerkleRoot),
        "Invalid ZK proof"
    );

    // 2. Verify computed root matches BLS-signed root from Atomica
    require(
        auctionRoots[auctionId] == computedMerkleRoot,
        "Merkle root mismatch"
    );

    // 3. Mark auction as settled
    settled[auctionId] = true;

    emit AuctionSettled(auctionId);
}
```

**Key Property**: Settlement only executes if:
- ZK proof verifies (computation was correct)
- **AND** merkle root matches BLS-signed state from Atomica
- This provides **double verification** of settlement correctness

**Technical Details**: See [Cryptographic Stack Analysis](./cryptographic-stack-analysis.md) for ZK system selection.

---

## Account Abstraction & Wallet Integration

### Design Goal

Enable users to participate in Atomica auctions using standard Ethereum wallets (MetaMask, etc.) **without**:
- Creating new Atomica accounts
- Acquiring Atomica gas tokens
- Using specialized wallet software

### Technical Approach

Leverage **Aptos Derivable Account Abstraction (AIP-113)** to:
1. Accept Ethereum ECDSA signatures on Atomica
2. Derive Atomica addresses deterministically from Ethereum keys
3. Sponsor gas fees for user transactions
4. Verify Ethereum state (locked deposits) before execution

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User (Browser + MetaMask)                 │
│  • Signs Ethereum-style transaction with ECDSA               │
│  • No Atomica wallet required                                │
└────────────────────────┬────────────────────────────────────┘
                         │ Signed Transaction
                         ↓
┌─────────────────────────────────────────────────────────────┐
│               Atomica Sequencer/Validator                    │
│                                                               │
│  Step 1: Verify ECDSA signature (AIP-49)                    │
│    → secp256k1::ecdsa_recover(message, signature)           │
│                                                               │
│  Step 2: Derive Atomica account (AIP-113)                   │
│    → address = derive_daa(ethereum_pubkey, auth_fn, domain) │
│    → Create account if first transaction                     │
│                                                               │
│  Step 3: Verify Ethereum deposit (ZK Light Client)          │
│    → Query Ethereum state root on Atomica                    │
│    → Verify user locked ETH via merkle proof                │
│                                                               │
│  Step 4: Sponsor gas (AIP-39)                               │
│    → Fee payer signs as sponsor                              │
│    → User pays no Atomica gas                                │
│                                                               │
│  Step 5: Execute transaction on Atomica                      │
│    → Call Move entry function                                │
│    → Update auction state                                    │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Ethereum Signature Verification (AIP-49)

Atomica validators verify Ethereum signatures natively:

```move
module atomica::ethereum_auth {
    use aptos_std::secp256k1;

    public fun verify_ethereum_signature(
        message_hash: vector<u8>,  // 32-byte keccak256 hash
        signature: vector<u8>,      // 65 bytes (r, s, v)
        expected_address: address
    ): bool {
        let pubkey = secp256k1::ecdsa_recover(
            message_hash,
            signature
        );

        // Ethereum address = last 20 bytes of keccak256(pubkey)
        let recovered_address = ethereum_address_from_pubkey(pubkey);
        recovered_address == expected_address
    }
}
```

#### 2. Derivable Account Abstraction (AIP-113)

Atomica accounts derived deterministically from Ethereum keys:

```
atomica_address = SHA3-256(
    ethereum_pubkey ||
    authentication_function_id ||
    account_identity  // dApp-specific domain
)
```

**Benefits**:
- Same Ethereum key always maps to same Atomica address
- No pre-registration required
- No key management overhead

#### 3. Cross-Chain State Verification

Before executing Atomica transaction, verify user has locked assets on Ethereum:

```move
public fun submit_bid(
    user: &signer,
    auction_id: u64,
    encrypted_bid: vector<u8>
) {
    let ethereum_address = get_ethereum_address(user);

    // Query Ethereum light client on Atomica
    let deposit = ethereum_light_client::get_deposit(
        ethereum_address,
        auction_id
    );

    assert!(deposit.amount >= minimum_deposit, E_INSUFFICIENT_DEPOSIT);

    // Store sealed bid
    bid_registry::submit(auction_id, encrypted_bid);
}
```

**Light Client**: Atomica maintains ZK light client tracking Ethereum state (see [ZK Light Client](./aptos_zk_light_client.md)).

#### 4. Gas Sponsorship (AIP-39)

Atomica protocol sponsors gas for user transactions:

```move
// Sponsored transaction structure
struct SponsoredUserOp {
    sender: address,           // Ethereum-derived address
    payload: vector<u8>,       // Transaction data
    signature: vector<u8>,     // Ethereum ECDSA signature
    fee_payer: address,        // Atomica gas sponsor
    fee_payer_signature: vector<u8>,
}
```

**Implementation**: See [Ethereum Wallet → Atomica Bridge](./ethereum-wallet-atomica-bridge.md) for complete specification.

### User Experience Flow

1. **User deposits on Ethereum**:
   - User calls `TimeLock.deposit(auctionId, token, amount)` using MetaMask
   - Standard Ethereum transaction

2. **User submits bid on Atomica** (via dApp):
   - dApp constructs Atomica transaction
   - User signs with MetaMask (Ethereum signature)
   - dApp submits to Atomica sequencer
   - **No Atomica wallet or gas tokens required**

3. **Atomica validates and executes**:
   - Verifies Ethereum signature
   - Checks Ethereum deposit via light client
   - Executes bid submission
   - Protocol sponsors gas

4. **Settlement**:
   - Auction completes on Atomica
   - Merkle root submitted to Ethereum
   - User withdraws via `TimeLock.withdraw(merkleProof)`

**Critical UX Note**: Transactions will **not** appear in MetaMask activity. dApp must provide custom transaction status UI (see [Account Abstraction](./account-abstraction.md)).

---

## Auction Mechanism

### Auction Type

Atomica implements **Ausubel auctions** (ascending clinching auction):
- Incentive compatible (truthful bidding is optimal)
- MEV resistant through cryptographic commitment
- Efficient price discovery
- Sealed-bid format with timelock encryption

**Full Analysis**: See [game-theory/ausubel-summary.md](../game-theory/ausubel-summary.md) and [MEV mitigation strategies](../game-theory/ausubel-mev-mitigation.md).

### Sealed Bid Implementation

**Privacy Mechanism**: drand timelock encryption (Identity-Based Encryption)

```rust
// Client-side bid encryption
let bid = Bid {
    bidder: ethereum_address,
    auction_id: 42,
    price: 1500,  // USD per ETH
    quantity: 10, // ETH
};

let encrypted_bid = drand::encrypt(
    &bid,
    round_number // drand round corresponding to auction end time
);

// Submit to Atomica chain
submit_sealed_bid(auction_id, encrypted_bid);
```

**Decryption**: Automatic after drand publishes randomness for specified round
- No user interaction required
- No reveal phase (grief-resistant)
- Decryption happens off-chain or on-chain via drand signature

**Security**: Temporary privacy sufficient for auction duration (4-12 hours).

**Implementation Details**: See [Timelock Bids](./timelock-bids.md) for complete specification.

### Bid Validation

**Post-Decryption Validation** (Economic Security):
- Bids validated **after** decryption
- Invalid bids result in deposit slashing
- Economic incentive ensures honest participation

**Validation Rules**:
1. Bid amount ≤ user's locked deposit
2. Bid price within reasonable bounds
3. Bid signature valid
4. Auction not expired

**Previous Design**: Used ZK proofs for pre-validation, removed for simplicity (see [Bid Validity Simplification Decision](../decisions/bid-validity-simplification.md)).

---


## Security Model

### Trust Assumptions

**Validator Honesty**:
- Assumption: >2/3 of validator voting power is honest
- Consequence: BLS signatures can be trusted
- Mitigation: Validator slashing for misbehavior

**ZK Soundness**:
- Assumption: ZK proof system is cryptographically sound
- Consequence: Invalid computations cannot be proven
- Mitigation: Use audited, production-grade systems (Succinct SP1)

**Timelock Encryption**:
- Assumption: drand network remains live and honest
- Consequence: Bids decrypt at specified time
- Mitigation: drand is multi-party, distributed network with strong liveness

### Attack Vectors

#### 1. Invalid Merkle Root Submission

**Attack**: Malicious actor submits incorrect merkle root to Ethereum

**Defense**:
- BLS signature verification rejects roots not signed by validators
- Requires >2/3 validator collusion to forge signature

#### 2. Incorrect Settlement Computation

**Attack**: ZK proof claims invalid settlement is correct

**Defense**:
- ZK proof system cryptographically prevents false proofs
- Anyone can re-compute settlement and submit correct proof

#### 3. Front-Running Bids

**Attack**: Sequencer observes encrypted bid, front-runs with better bid

**Defense**:
- Bids are encrypted until auction end
- Front-running requires breaking timelock encryption (computationally infeasible)

**Additional Analysis**: See [MEV Resistance](../game-theory/ausubel-mev-resistance.md).

#### 4. Validator Set Takeover

**Attack**: Attacker gains control of >2/3 validator voting power

**Defense**:
- Economic security: Validator stake slashing
- Validator diversity: Geographic and institutional distribution
- Social layer: Governance can intervene in catastrophic scenarios

#### 5. Denial of Service (Bid Withholding)

**Attack**: Users submit encrypted bids but bids are invalid after decryption

**Defense**:
- Economic deposits: Invalid bids result in deposit slashing
- Reputation system: Repeat offenders banned
- Previous approach (ZK pre-validation) was removed for simplicity

**Analysis**: See [Bid Validity Simplification Decision](../decisions/bid-validity-simplification.md).

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Months 1-3)

**Atomica Chain**:
- [ ] Fork Aptos codebase
- [ ] Configure BLS validator signature scheme
- [ ] Deploy state proof generation API
- [ ] Implement Move auction smart contracts

**Ethereum Contracts**:
- [ ] Deploy Time Lock contract
- [ ] Implement BLS signature verification (ZK-wrapped)
- [ ] Validator set synchronization logic
- [ ] Merkle root submission and verification

**Documentation**: [Aptos-Ethereum Bridge Implementation](./aptos_ethereum_bridge_implementation.md)

### Phase 2: Account Abstraction (Months 2-4)

**Ethereum Signature Support**:
- [ ] Implement secp256k1 ECDSA verification in Move
- [ ] Derivable account abstraction (AIP-113)
- [ ] Gas sponsorship mechanism

**Ethereum Light Client**:
- [ ] Deploy Succinct SP1 light client on Atomica
- [ ] Ethereum state root synchronization
- [ ] Merkle proof verification for deposits

**Documentation**: [Ethereum Wallet → Atomica Bridge](./ethereum-wallet-atomica-bridge.md)

### Phase 3: Auction Mechanism (Months 3-5)

**Sealed Bid System**:
- [ ] Integrate drand timelock encryption
- [ ] Client library for bid encryption
- [ ] On-chain bid storage and decryption

**Auction Logic**:
- [ ] Ausubel auction implementation in Move
- [ ] Bid validation and settlement computation
- [ ] Merkle tree generation for final balances

**Documentation**: [Timelock Bids](./timelock-bids.md), [Ausubel Summary](../game-theory/ausubel-summary.md)

### Phase 4: Settlement & ZK Proofs (Months 4-6)

**Off-Chain Settlement Computation**:
- [ ] Client technology for settlement from bid logs
- [ ] ZK circuit design for settlement verification
- [ ] Proof generation and submission

**On-Chain Verification**:
- [ ] ZK verifier contract on Ethereum
- [ ] Settlement execution logic
- [ ] User withdrawal with merkle proofs

**Documentation**: [Cryptographic Stack Analysis](./cryptographic-stack-analysis.md)

### Phase 5: Testing & Audit (Months 6-8)

**Security Audits**:
- [ ] Smart contract audit (Ethereum)
- [ ] Move contract audit (Atomica)
- [ ] Cryptography audit (BLS, ZK proofs)

**Testing**:
- [ ] Testnet deployment
- [ ] Load testing (1000+ concurrent auctions)
- [ ] Cross-chain stress testing

**Bug Bounty**: Public bug bounty program with $500K+ pool

### Phase 6: Mainnet Launch (Month 9+)

**Phased Rollout**:
1. Limited beta (whitelisted users)
2. Public testnet with incentives
3. Mainnet launch with deposit caps
4. Full production deployment

**Monitoring**:
- Real-time validator monitoring
- Proof submission latency tracking
- Gas cost analytics

---

## References

### Technical Documentation

- [Ethereum Wallet → Atomica Bridge](./ethereum-wallet-atomica-bridge.md) - Account abstraction implementation
- [Account Abstraction Overview](./account-abstraction.md) - ERC-4337 and Aptos AA comparison
- [Cross-Chain Verification](./cross-chain-verification.md) - Atomic guarantees and ZK light clients
- [Timelock Bids](./timelock-bids.md) - Sealed bid encryption with drand
- [Aptos State Proof](./aptps_state_proof.md) - BLS signatures and light client verification
- [Cryptographic Stack Analysis](./cryptographic-stack-analysis.md) - ZK system selection (SP1)
- [ZK Light Client](./aptos_zk_light_client.md) - ZK-SNARK wrapped BLS verification
- [Aptos-Ethereum Bridge Implementation](./aptos_ethereum_bridge_implementation.md) - Smart contract specifications

### Game Theory & Economics

- [Ausubel Auction Summary](../game-theory/ausubel-summary.md) - Auction mechanism overview
- [Ausubel MEV Mitigation](../game-theory/ausubel-mev-mitigation.md) - MEV resistance strategies
- [Sealed Bid Alternatives](../game-theory/sealed-bid-alternatives.md) - Comparison of bid privacy mechanisms
- [Fee Philosophy](../game-theory/fee-philosophy.md) - Economic incentive design

### Design Decisions

- [Bid Validity Simplification](../decisions/bid-validity-simplification.md) - Removal of ZK bid pre-validation

---

## Appendix: Cryptographic Primitives

### BLS12-381 Signatures

**Properties**:
- Aggregate signatures: Combine N signatures into one
- Efficient verification: Single pairing check for aggregated signature
- Security: 128-bit security level

**Usage in Atomica**:
- Validator signatures on state proofs
- Aggregate signature size: 48 bytes (regardless of N validators)
- Public key size: 96 bytes per validator

### Merkle Trees

**Construction**:
```
leaf = hash(account || asset || balance)
internal_node = hash(left_child || right_child)
root = top-level internal_node
```

**Proof Size**: `O(log N)` where N = number of leaves
- 1000 users: ~10 hashes (320 bytes)
- Verification: ~30K gas on Ethereum

### ZK-SNARKs (Succinct SP1)

**Proof System**: Recursively verified STARKs wrapped in Groth16
- Proof size: ~200 bytes
- Verification cost: ~250K gas on Ethereum
- Proving time: ~5-30 minutes (depending on computation size)

**Security**: 100-bit statistical soundness, upgradeable to 128-bit

### drand Timelock Encryption

**Mechanism**: Identity-Based Encryption (IBE) with public randomness
- Encryption: Uses future drand round number as public key
- Decryption: Requires drand signature from that round
- Security: 128-bit security (BLS12-381)

**Liveness**: drand publishes randomness every 30 seconds (currently 3 seconds on mainnet)

---

**End of Architecture Plan**
