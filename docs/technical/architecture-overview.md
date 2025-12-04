# Atomica Architecture Overview

## System Overview

Atomica is a cross-chain sealed-bid auction system enabling trustless, gas-efficient trading across multiple blockchains. The architecture consists of a home chain (Atomica), multiple away chains (Ethereum, Solana, etc.), and a unified cryptographic verification mechanism using BLS threshold signatures and ZK proofs.

## Core Components

### 1. Atomica Chain (Home Chain)

**Foundation**: Independent blockchain built using Aptos-core software with native sealed-bid auction capabilities

**Technology Stack**: Atomica uses Aptos-core as its blockchain implementation (consensus, execution, storage) while maintaining its own independent network, validators, and governance

**Validators with Timelock Decryption**:
- Maintain BLS key pairs for threshold cryptography
- Implement timelock encryption (tlock) scheme using BLS threshold signatures
- Publish decryption secrets at predefined times (auction end)
- Sign state transitions and auction completion proofs
- Enable trustless verification on away chains

**Sealed Auction Logic**:
- Fully implemented in Move smart contracts
- **Sealed reserve prices** from sellers (tlock encrypted)
- **Sealed bids** (quantity + price) from buyers (tlock encrypted)
- Automatic decryption at auction deadline via validator threshold signatures
- Produces merkle tree of final account balances upon completion
- Merkle root hash stored as on-chain state
- API-accessible state proofs signed by validator BLS signatures

**Timelock Encryption (tlock)**:
- Encryption key derived from validator BLS threshold public key
- Decryption requires threshold signatures from validators (e.g., 2/3)
- Validators automatically publish decryption shares at auction end time
- No interactive reveal phase required
- Grief-resistant: cannot prevent auction completion

**State Proofs**:
- Validator set changes
- Auction completion events with merkle roots
- Transaction execution proofs

### 2. Away Chains (Unified Architecture)

**Note**: All away chains (Ethereum, Solana, Base, Arbitrum, etc.) use the same verification architecture.

**Time Lock Contracts**:
- Accept atomic deposits from sellers and bidders
- Deposits locked only for auction duration
- Users deposit using their native chain wallets (MetaMask, Phantom, etc.)
- No new accounts or specialized wallets required

**Validator Synchronization**:
- Genesis state contains initial validator BLS public keys
- Anyone can submit validator set update proofs (permissionless)
- BLS threshold signatures verify authenticity of updates
- Maintains current validator public keys on-chain
- Updates happen on validator set rotation

**Settlement Mechanism (ZK-Verified Merkle Proofs)**:
1. Accepts merkle root submissions with BLS-signed state proofs from Atomica
2. Verifies BLS threshold signatures against current validator public keys
3. Off-chain client replays all auction transactions through ZK circuit
4. ZK proof submitted to away chain, proves computation correctness
5. If ZK proof merkle root matches BLS-signed merkle root → settlement enabled
6. Users withdraw via merkle proofs (single state update per user)
7. Gas-optimized: avoids per-transaction settlement costs

### 3. Complete Auction Flow

**Step 1: Deposits on Away Chains**
- Sellers deposit assets to sell on away chain Time Lock contracts
- Bidders deposit collateral/payment on away chain Time Lock contracts
- Standard wallet workflows (MetaMask, Phantom, etc.)

**Step 2: Sealed Bid Submission on Atomica**
- Sellers submit sealed reserve prices (tlock encrypted)
- Bidders submit sealed bids with quantity + price (tlock encrypted)
- Account abstraction enables Ethereum wallet signatures on Atomica
- No new accounts or wallets required

**Step 3: Auction Execution on Atomica**
- Auction deadline reaches → validators publish decryption shares
- Threshold decryption (e.g., 2/3 validators) reveals all bids and reserves
- Ausubel auction clearing algorithm executes in Move
- Final allocations and prices computed
- Merkle tree of balances generated → merkle root stored on-chain

**Step 4: Cross-Chain Settlement Verification**
1. BLS-signed state proof generated (contains merkle root)
2. Anyone submits state proof to away chain Time Lock contract
3. Contract verifies BLS threshold signatures → merkle root accepted
4. Off-chain client replays auction transactions through ZK circuit
5. ZK proof submitted to away chain
6. If ZK merkle root matches BLS-signed merkle root → settlement enabled

**Step 5: User Withdrawals**
- Users provide merkle proofs to claim their balances
- Single state update per user (gas-efficient)
- Automatic unlocking of unclaimed deposits after timeout

### 4. Dual-Layer Verification

**Layer 1: BLS Threshold Signatures (Consensus Layer)**
- Validators sign merkle root with BLS threshold scheme
- Requires 2/3+ validator agreement
- Proves consensus was reached on Atomica
- Prevents single validator manipulation

**Layer 2: ZK Proof (Computation Layer)**
- Anyone can verify auction computation was correct
- Replays all transactions through ZK circuit
- Proves merkle root was computed correctly from inputs
- Independent of validator honesty

**Security Property**: Settlement requires BOTH layers to agree on merkle root

### 5. User Experience & Account Abstraction

**Deposit on Away Chain** (Standard Workflow):
- Users deposit on Ethereum/Solana using MetaMask/Phantom
- No changes to familiar wallet experience
- Standard ERC-20/SPL token transfers

**Bid Submission on Atomica** (Abstracted Workflow):
- Users sign with their Ethereum wallet (MetaMask)
- Account abstraction maps Ethereum address to Atomica account
- Transaction executes on Atomica with gas sponsorship
- Bid encrypted with validator tlock public key
- No Atomica wallet or gas tokens required

**Settlement & Withdrawal**:
- After auction clears, users withdraw on away chain
- Provide merkle proof to claim winnings
- Standard wallet transaction

**Key Innovation**: Users never leave their preferred wallet ecosystem, yet participate in cross-chain auctions.

**See**: `ethereum-wallet-atomica-bridge.md` for complete account abstraction specification

## Key Features

**Sealed-Bid Auctions**:
- Timelock encryption using validator BLS threshold signatures
- Automatic decryption at auction deadline
- Grief-resistant: no interactive reveal phase
- Prevents bid manipulation and front-running

**Cross-Chain Security**:
- Dual-layer verification (BLS consensus + ZK computation)
- Trustless validator set synchronization
- No central authority or oracle dependency
- Permissionless proof submission

**Gas Efficiency**:
- Merkle-proof-based settlement (not per-user transactions)
- 100x gas reduction vs traditional bridges
- Works identically on all chains (Ethereum, Solana, etc.)

**User Accessibility**:
- No specialized wallets or new accounts
- Standard Web3 user experience
- Account abstraction for seamless cross-chain participation

## Technical Innovation

**Aptos Validator Timelock**: Leverages existing Aptos BLS threshold signature infrastructure to provide decentralized timelock encryption, eliminating dependency on external services like drand while maintaining decentralization.
