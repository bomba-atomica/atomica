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

Atomica is a **cross-chain auction protocol** that prioritizes:
- **Trustless verification** - No reliance on external oracles or trusted intermediaries
- **Gas efficiency** - Minimize transaction costs through batching and ZK proofs
- **User accessibility** - Standard wallet workflows without specialized accounts
- **Cryptographic security** - BLS signatures, ZK proofs, and merkle tree verification

### High-Level Architecture

Atomica implements **two distinct architectural patterns** based on away chain gas costs:

#### Architecture A: Ethereum (High Gas Cost)
**Off-Chain Double-Entry with ZK Verification**

```
┌──────────────────────────────────────────────────────────────────┐
│                      Atomica Chain (Home)                         │
│  • Auction executes on-chain                                      │
│  • Settlement computed → Merkle root generated                    │
│  • BLS-signed state proofs                                        │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ Merkle Root + BLS Signature
                         │ ZK Proof (off-chain computation)
                         │
┌────────────────────────┴─────────────────────────────────────────┐
│                        Ethereum                                   │
│  • Time Lock contract with deposits                               │
│  • Merkle root verification (BLS signatures)                      │
│  • ZK proof verification (settlement correctness)                 │
│  • Settlement via merkle proofs (not full transactions)           │
└───────────────────────────────────────────────────────────────────┘
```

**Key Insight**: Users withdraw using merkle proofs, avoiding per-user transaction costs.

#### Architecture B: Solana + Low-Cost Chains
**On-Chain Double-Entry with Parallel Auction Execution**

```
┌──────────────────────────────────────────────────────────────────┐
│                      Atomica Chain (Home)                         │
│  • Users submit bids (timelock encrypted)                         │
│  • Auction executes: clearing, settlement                         │
│  • Final state: merkle root of balances                           │
│  • BLS-signed state proofs                                        │
└───────────────────────────────────────────────────────────────────┘
                         ↑
                         │ Same bids submitted to both chains
                         ↓
┌───────────────────────────────────────────────────────────────────┐
│                   Solana / Low-Cost Chain                          │
│  • Users submit same bids (timelock encrypted)                    │
│  • Auction executes: same clearing logic                          │
│  • Final state: merkle root of balances                           │
│  • Both chains verify: merkle roots match                         │
└───────────────────────────────────────────────────────────────────┘
```

**Key Insight**: Ausubel auctions are **order-independent** - given the same set of bids, both chains compute identical settlement regardless of bid ordering. No nonces needed!

---

## Architectural Bifurcation: Why Two Approaches?

### Gas Cost Economics

| Chain Type | Cost/TX | 100 User Settlement | Feasibility |
|------------|---------|---------------------|-------------|
| Ethereum L1 | $10-50 | $1,000-$5,000 | ❌ Prohibitive |
| Arbitrum/Optimism | $0.10-$1 | $10-$100 | ⚠️ Marginal |
| Solana/Sui | $0.0001-$0.001 | $0.01-$0.10 | ✅ Viable |
| Aptos/Atomica | $0.0001-$0.001 | $0.01-$0.10 | ✅ Viable |

### Architecture A: Ethereum (Off-Chain Double-Entry)

**Design Rationale**: Gas costs make per-user settlement transactions economically infeasible.

**Settlement Flow**:
1. Auction completes on Atomica → settlement computed
2. Merkle tree generated from final balances
3. Merkle root submitted to Ethereum (single transaction)
4. ZK proof verifies settlement correctness (single transaction)
5. Users withdraw by providing merkle proof (individual action)

**Accounting Model**: **Off-chain double-entry**
- Atomica: Full transaction history stored on-chain
- Ethereum: Only merkle root stored on-chain
- Double-entry verified cryptographically (merkle roots + ZK proofs)

**Trade-offs**:
- ✅ Extremely gas-efficient ($50 total vs $5000 for 100 users)
- ✅ Scales to thousands of users per auction
- ❌ Less transparency (no per-user tx on Ethereum)
- ❌ Requires off-chain ZK proof generation
- ❌ Users must provide merkle proofs to withdraw

### Architecture B: Solana + Low-Cost Chains (On-Chain Double-Entry)

**Design Rationale**: Gas costs are negligible, enabling true parallel execution on both chains.

**Bid Submission Flow**:
1. User deposits on both Atomica and Solana
2. User submits **same bid to both chains simultaneously**
3. Both bids timelock encrypted with same drand round
4. Both chains receive identical bid set

**Auction Execution Flow**:
1. Timelock expires → bids decrypt on both chains
2. **Atomica executes Ausubel auction** → computes settlement
3. **Solana executes same Ausubel auction** → computes settlement
4. Both chains arrive at **identical settlement** (Ausubel is order-independent!)
5. Both chains compute merkle root of final balances
6. Merkle roots verified to match (consistency check)

**Accounting Model**: **On-chain parallel double-entry**
- Atomica: Full auction execution and settlement
- Solana: Full auction execution and settlement (same logic)
- Both chains independently compute same result
- Cross-chain consistency verified via merkle root comparison
- **No nonces needed** - order-independence guarantees consistency

**Why This Works - Ausubel Order-Independence**:

Ausubel (ascending clinching) auctions have a critical property: **the final allocation and prices depend only on the SET of bids, not their ORDER**.

```
Example Auction for 10 ETH:
Bids: Alice: 5 ETH @ $2000
      Bob:   3 ETH @ $1900
      Carol: 4 ETH @ $1800

Clearing price: $1800 (10 ETH demanded at this price)

Final allocation (independent of bid order):
  Alice: 5 ETH @ $1900 (pays $9,500)
  Bob:   3 ETH @ $1900 (pays $5,700)
  Carol: 2 ETH @ $1800 (pays $3,600)
```

**Mathematical Property**:
```
Given bid set B = {b₁, b₂, ..., bₙ}
Ausubel(B) = Ausubel(π(B))  for any permutation π

Therefore:
  Atomica receives bids: [Alice, Bob, Carol]
  Solana receives bids:  [Carol, Alice, Bob]

  Both compute: Same clearing price, same allocation
```

**Implementation - Identical Auction Logic**:

```rust
// Shared auction clearing algorithm (deployed on both chains)
pub fn clear_ausubel_auction(
    bids: Vec<Bid>,  // Order doesn't matter!
    total_supply: u64
) -> AuctionResult {
    // 1. Sort bids by price (high to low)
    let mut sorted_bids = bids.clone();
    sorted_bids.sort_by(|a, b| b.price.cmp(&a.price));

    // 2. Find clearing price
    let clearing_price = find_clearing_price(&sorted_bids, total_supply);

    // 3. Allocate to winners
    let allocations = compute_allocations(&sorted_bids, clearing_price, total_supply);

    AuctionResult {
        clearing_price,
        allocations,
        merkle_root: compute_merkle_root(&allocations),
    }
}
```

**Deployment**:
- **Atomica**: Same algorithm in Move
- **Solana**: Same algorithm in Rust/Anchor
- **Both chains**: Receive same bids, compute same result, produce same merkle root

**Trade-offs**:
- ✅ Full transparency (complete auction execution on both chains)
- ✅ No ZK proofs required (simpler implementation)
- ✅ Better auditability (all bids queryable on both chains)
- ✅ No merkle proof burden on users
- ✅ Truly distributed (no single source of truth)
- ⚠️ Users must submit bids to both chains (can be automated by wallet/dApp)
- ⚠️ Requires identical auction logic deployment on both chains

### Comparison Table

| Feature | Ethereum (Arch A) | Solana (Arch B) |
|---------|-------------------|-----------------|
| **Bid Submission** | Only to Ethereum | To both chains simultaneously |
| **Auction Execution** | Only on Atomica | On both chains in parallel |
| **Settlement Model** | Merkle root + ZK proof | Parallel execution, merkle root comparison |
| **On-Chain TXs** | 2 (root + proof) | N bids × 2 chains |
| **Cost (100 bids)** | $50-100 | $0.01 ($0.0001 × 100 × 2) |
| **Transparency** | Medium (merkle root only) | High (full auction on both chains) |
| **User Withdrawal** | Requires merkle proof | Automatic (already settled) |
| **ZK Proof Required** | Yes | No |
| **Double-Entry Type** | Off-chain cryptographic | On-chain parallel execution |
| **Order-Independence** | Not relevant | Critical (enables parallel execution) |
| **Merkle Proof Usage** | User withdrawals | Cross-chain consistency verification |

### When to Use Each Architecture

**Use Architecture A (Ethereum Model)**:
- Away chain gas cost > $0.01/transaction
- User base > 100 per auction (gas savings compound)
- Examples: Ethereum L1, Polygon PoS, some L2s

**Use Architecture B (Solana Model)**:
- Away chain gas cost < $0.001/transaction
- Transparency and auditability are priorities
- Can deploy identical auction logic on away chain
- Examples: Solana, Sui, Aptos-derived chains, ultra-low-cost L2s

**Key Decision Factor**: Can users afford to submit N bids to both chains?
- Ethereum: N × $10 = $1000 for 100 bids → **NO**, use Arch A
- Solana: N × $0.0001 × 2 = $0.02 for 100 bids → **YES**, use Arch B

**Hybrid Approach** (Recommended):
- Start with Architecture A on Ethereum
- Expand to Architecture B on Solana/Sui
- Users choose which chain to participate on based on preferences
- Cross-chain auctions possible (Ethereum users + Solana users in same auction via Architecture A)

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

## Settlement & Double-Entry Accounting

### Overview

Atomica implements **two distinct settlement architectures** based on away chain economics (see [Architectural Bifurcation](#architectural-bifurcation-why-two-approaches) above).

### Architecture A: Ethereum Settlement (Off-Chain Double-Entry)

**Challenge**: Ethereum gas costs make per-user settlement transactions prohibitive.

**Solution**: Merkle-proof-based settlement with ZK verification

```
┌──────────────────────────────────────────────────────────────┐
│  Step 1: User deposits on Ethereum                            │
│    TimeLock.deposit(auction_id, token, amount)               │
│    → User balance tracked in contract                         │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────────┐
│  Step 2: Auction executes on Atomica                          │
│    • Bids submitted (timelock encrypted)                     │
│    • Auction clears after decryption                         │
│    • Settlement computed: who pays whom                      │
│    • Merkle tree generated: (account → balance_change)      │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────────┐
│  Step 3: Merkle root submitted to Ethereum                    │
│    • BLS-signed state proof from Atomica                     │
│    • Anyone can submit (permissionless)                      │
│    • Ethereum contract verifies BLS signatures               │
│    • Merkle root stored on-chain                             │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────────┐
│  Step 4: ZK proof submitted to Ethereum                       │
│    • Off-chain client computes settlement from bid logs      │
│    • ZK circuit proves computation correctness               │
│    • Proof outputs merkle root                               │
│    • Ethereum verifies:                                      │
│      (a) ZK proof is valid                                   │
│      (b) Merkle root matches BLS-signed root                 │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────────┐
│  Step 5: Users withdraw on Ethereum                           │
│    TimeLock.withdraw(auction_id, merkle_proof)               │
│    → Verify proof against stored merkle root                 │
│    → Update user balance (single state change)               │
│    → Transfer tokens to user                                 │
└──────────────────────────────────────────────────────────────┘
```

#### Ethereum Gas Efficiency

**Traditional Per-User Settlement**:
- 100 users, 100 auctions → 20,000 transactions
- Cost: ~$60,000 at 50 gwei, 200K gas/tx
- **Prohibitively expensive**

**Atomica Merkle-Proof Settlement**:
- 100 users, 100 auctions → 200 transactions (2 per auction: merkle root + ZK proof)
- Cost: ~$600 at 50 gwei
- **100x reduction in costs**

**Key**: Balances updated via merkle proofs, not individual transactions.

#### Ethereum Security Guarantees

**Double Verification**:
1. **BLS Signatures**: Validators sign merkle root (consensus layer)
2. **ZK Proofs**: Anyone can prove settlement computation is correct (verification layer)

**Attack Resistance**:
- Invalid merkle root: Rejected by BLS signature verification
- Incorrect settlement: ZK proof will not verify
- Collusion: Requires >2/3 validator voting power AND breaking ZK soundness

**User Experience**:
- ✅ Extremely low protocol costs
- ❌ Users must construct merkle proofs to withdraw
- ❌ No per-user transaction visibility on Ethereum

---

### Architecture B: Solana/Low-Cost Chain Settlement (On-Chain Double-Entry)

**Challenge**: Traditional approach is unnecessarily complex when gas costs are negligible.

**Solution**: Parallel auction execution on both chains leveraging Ausubel order-independence

#### Settlement Flow - Solana

```
┌──────────────────────────────────────────────────────────────┐
│  Step 1: User deposits on BOTH chains                         │
│    Atomica: TimeLock.deposit(auction_id, token, amount)      │
│    Solana:  TimeLock.deposit(auction_id, token, amount)      │
│    → User balance tracked on both chains                      │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────────┐
│  Step 2: User submits bids to BOTH chains simultaneously      │
│    Atomica: submit_bid(auction_id, encrypted_bid)            │
│    Solana:  submit_bid(auction_id, encrypted_bid)            │
│    • Same bid encrypted with same drand round                │
│    • Wallet/dApp automates dual submission                   │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────────┐
│  Step 3: Auctions execute independently on BOTH chains        │
│    Atomica:                        Solana:                   │
│    • Bids decrypt (drand)          • Bids decrypt (drand)    │
│    • Ausubel clearing              • Ausubel clearing        │
│    • Settlement computed           • Settlement computed     │
│    • Merkle root generated         • Merkle root generated   │
│                                                               │
│    Both chains compute SAME result (order-independent!)      │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────────┐
│  Step 4: Cross-chain merkle root verification                 │
│    • Atomica publishes merkle root with BLS signatures       │
│    • Solana publishes merkle root independently              │
│    • Anyone can verify: Atomica root == Solana root          │
│    • If mismatch → halt, investigate (should never happen!)  │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────────┐
│  Step 5: Settlement complete on BOTH chains                   │
│    • Atomica: Balances updated, users can withdraw           │
│    • Solana:  Balances updated, users can withdraw           │
│    • No additional transactions needed (already settled!)    │
└──────────────────────────────────────────────────────────────┘
```

#### Solana Implementation Details

**Shared Auction Logic** - Must be identical on both chains:

```rust
// Deployed on both Atomica (Move) and Solana (Rust)
pub fn clear_ausubel_auction(
    bids: Vec<Bid>,
    total_supply: u64,
    auction_id: u64
) -> AuctionResult {
    // 1. Sort bids by price (descending)
    let mut sorted_bids = bids.clone();
    sorted_bids.sort_by(|a, b| b.price.cmp(&a.price));

    // 2. Find clearing price where demand meets supply
    let clearing_price = find_clearing_price(&sorted_bids, total_supply);

    // 3. Allocate to winners
    let mut allocations = Vec::new();
    let mut remaining_supply = total_supply;

    for bid in sorted_bids.iter() {
        if bid.price >= clearing_price && remaining_supply > 0 {
            let allocated = min(bid.quantity, remaining_supply);
            allocations.push(Allocation {
                bidder: bid.bidder,
                quantity: allocated,
                price: clearing_price,
            });
            remaining_supply -= allocated;
        }
    }

    // 4. Compute merkle root from allocations
    let merkle_root = compute_merkle_root(&allocations);

    AuctionResult {
        auction_id,
        clearing_price,
        allocations,
        merkle_root,
    }
}
```

**Atomica Implementation (Move)**:
```move
module atomica::ausubel_auction {
    public fun execute_auction(auction_id: u64) {
        let bids = get_decrypted_bids(auction_id);
        let supply = get_auction_supply(auction_id);

        // Execute identical clearing logic
        let result = clear_ausubel_auction(bids, supply, auction_id);

        // Store results
        store_auction_result(auction_id, result);

        // Publish merkle root
        emit_merkle_root_event(auction_id, result.merkle_root);
    }
}
```

**Solana Implementation (Rust/Anchor)**:
```rust
#[program]
pub mod atomica_solana_auction {
    pub fn execute_auction(
        ctx: Context<ExecuteAuction>,
        auction_id: u64
    ) -> Result<()> {
        let bids = get_decrypted_bids(&ctx.accounts, auction_id)?;
        let supply = ctx.accounts.auction.total_supply;

        // Execute identical clearing logic
        let result = clear_ausubel_auction(bids, supply, auction_id);

        // Store results
        ctx.accounts.auction.result = result.clone();

        // Publish merkle root
        emit!(AuctionCleared {
            auction_id,
            merkle_root: result.merkle_root,
            clearing_price: result.clearing_price,
        });

        Ok(())
    }
}
```

#### Solana Gas Efficiency

**Cost Analysis (100 bids)**:
- Bid submissions: 100 bids × 2 chains × $0.0001 = **$0.02**
- Auction execution: 2 chains × $0.0001 = **$0.0002**
- Total: **~$0.02** for complete auction

**Comparison to Ethereum**:
- Ethereum (merkle proof): $50-100 protocol cost, users withdraw via proofs
- Solana (parallel execution): $0.02 total cost, users already settled
- **2,500-5,000x cheaper than Ethereum**

**Why Parallel Execution Makes Sense**:
- Gas costs negligible ($0.0001/tx)
- Full transparency on both chains
- No merkle proof burden on users
- Better auditability and compliance
- Truly distributed - no single source of truth

#### Solana Security Guarantees

**Dual Verification**:
1. **Independent Execution**: Both chains run auction independently
2. **Merkle Root Comparison**: Final states verified to match

**Attack Resistance**:
- **Bid Manipulation**: Sealed bids (drand timelock) prevent manipulation
- **Invalid Settlement**: Order-independent algorithm guarantees same result
- **State Divergence**: Merkle roots must match or auction halted
- **Missing Bids**: If chains receive different bid sets, roots won't match

**Security Model**:
```
Atomica receives: {Bid_A, Bid_B, Bid_C}
Solana receives:  {Bid_C, Bid_A, Bid_B}  // Different order

Both execute: Ausubel(bids)
Both produce: Same merkle root

If Solana missing Bid_C:
  Solana merkle root ≠ Atomica merkle root
  → Auction halted, investigate
```

**User Experience**:
- ✅ Full transaction visibility on both chains
- ✅ No merkle proof required for users
- ✅ Complete audit trail
- ✅ Simple withdrawal (already settled!)
- ⚠️ Must submit bids to both chains (wallet automates this)

#### Cross-Chain State Consistency

**Verification Protocol**:
```rust
// Anyone can verify consistency
pub fn verify_cross_chain_consistency(
    ctx: Context<VerifyConsistency>,
    auction_id: u64,
    atomica_merkle_root: [u8; 32],
    atomica_bls_proof: Vec<u8>
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    // 1. Verify Atomica's BLS-signed merkle root
    let atomica_validator_set = &ctx.accounts.atomica_validator_set;
    require!(
        verify_bls_signature(
            &atomica_merkle_root,
            &atomica_bls_proof,
            atomica_validator_set
        ),
        ErrorCode::InvalidBLSSignature
    );

    // 2. Compare with Solana's independently computed root
    let solana_merkle_root = auction.merkle_root;
    require!(
        solana_merkle_root == atomica_merkle_root,
        ErrorCode::MerkleRootMismatch
    );

    // 3. Mark auction as verified
    auction.cross_chain_verified = true;

    emit!(CrossChainVerified {
        auction_id,
        atomica_root: atomica_merkle_root,
        solana_root: solana_merkle_root,
    });

    Ok(())
}
```

**Guarantee**: If merkle roots match, both chains executed identical settlement (mathematically guaranteed by Ausubel order-independence).

---

### Comparison: Ethereum vs Solana Settlement

| Feature | Ethereum (Arch A) | Solana (Arch B) |
|---------|-------------------|-----------------|
| **Bid Submission** | Only Ethereum | Both chains simultaneously |
| **Auction Execution** | Only Atomica | Both chains in parallel |
| **Transactions on Away Chain** | 2 (root + proof) | N bids (submitted by users) |
| **Cost (100 bids)** | $50-100 | $0.02 |
| **User Withdrawal** | Requires merkle proof | Direct (already settled) |
| **Transparency** | Merkle root only | Full auction on both chains |
| **Auditability** | Limited | Complete |
| **ZK Proof Required** | Yes | No |
| **Order-Independence** | Not relevant | Critical enabler |
| **Double-Entry Type** | Off-chain cryptographic | On-chain parallel |
| **Gas Efficiency** | Necessary optimization | Negligible cost regardless |
| **Implementation Complexity** | High (ZK circuits) | Medium (identical logic deployment) |

### Recommended Implementation Order

**Phase 1**: Ethereum Architecture (Arch A)
- Highest TVL expected on Ethereum
- Most critical for product-market fit
- Complex but necessary for L1
- Enables cross-chain auctions (Eth users + Atomica users)

**Phase 2**: Solana Architecture (Arch B)
- Simpler implementation (no ZK proofs)
- Reuse auction logic from Atomica (port to Rust/Anchor)
- Better UX due to full transparency
- Demonstrates truly distributed architecture

**Phase 3**: Expand to other chains based on demand
- Use Arch A for expensive chains (Polygon, Avalanche, Base)
- Use Arch B for cheap chains (Sui, other Aptos forks, ultra-low-cost L2s)
- Consider hybrid: Solana users can participate in Ethereum auctions via Arch A bridge

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
