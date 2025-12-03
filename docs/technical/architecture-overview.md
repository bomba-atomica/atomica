# Atomica Architecture Overview

## System Overview

Atomica is a cross-chain auction system enabling trustless, gas-efficient trading across multiple blockchains. The architecture consists of a home chain (Atomica), away chains (Ethereum, Solana), cryptographic verification mechanisms, and off-chain ZK proofs.

## Core Components

### 1. Atomica Chain (Home Chain)

**Foundation**: Aptos-derived blockchain with native auction capabilities

**Validators**:
- Maintain BLS key pairs for cryptographic signatures
- Sign state transitions and auction completion proofs
- Enable trustless verification on away chains

**Auction Logic**:
- Fully implemented in Move smart contracts
- Produces merkle tree of final account balances upon completion
- Merkle root hash stored as on-chain state
- API-accessible state proofs signed by validator BLS signatures

**State Proofs**:
- Validator set changes
- Auction completion events
- Balance merkle roots

### 2. Away Chains (Ethereum, Solana)

**Time Lock Contracts**:
- Accept atomic deposits from sellers and bidders
- Deposits locked only for auction duration
- Implement double-entry accounting without double transactions

**Validator Synchronization**:
- Genesis state contains initial validator BLS public keys
- Anyone can submit validator set update proofs
- BLS signatures verify authenticity of updates
- Maintains current validator public keys on-chain

**Settlement Mechanism**:
- Accepts merkle root submissions with BLS-signed state proofs
- Verifies proofs against current validator public keys
- Deducts balances when ZK proof matches merkle root
- Gas-optimized: avoids per-transaction settlement costs

### 3. Cross-Chain Verification Flow

1. Auction completes on Atomica chain → merkle root generated
2. BLS-signed state proof produced via API (anyone can generate)
3. State proof submitted to away chain Time Lock contract
4. Contract verifies BLS signatures against known validator keys
5. Merkle root accepted as authoritative auction result

### 4. Off-Chain ZK Proof System

**Purpose**: Independent verification of auction computation

**Process**:
- Client technology processes auction bid logs
- ZK circuit computes final balance merkle root
- Proof submitted to away chain (Ethereum)
- If ZK proof merkle root matches state proof merkle root → settlement executes

**Benefit**: Trustless verification that auction was computed correctly

### 5. User Experience

**Wallet Compatibility**:
- Users interact with standard wallets (MetaMask, etc.)
- No specialized wallet required
- No new account creation needed

**Account Abstraction**:
- Leverages Aptos-Ethereum account abstraction (see `ethereum-wallet-atomica-bridge.md`)
- Users bid and deposit using existing Ethereum accounts
- Seamless cross-chain participation without friction

**Deposit Flow**:
- Sellers/bidders deposit to Time Lock contract on preferred chain
- Participate in auction via standard wallet workflows
- Receive settlements after auction completion and proof verification

## Key Features

**Security**:
- Cryptographic verification via BLS signatures
- Independent ZK proof validation
- No central authority required for proof submission

**Efficiency**:
- Double-entry accounting without double transactions
- Gas optimization through batch settlement
- Atomic deposits with automatic unlocking

**Accessibility**:
- No specialized wallets or new accounts
- Standard Web3 user experience
- Cross-chain without bridges

## Future Considerations

For chains with low transaction fees, full double-entry accounting on both chains may be implemented for enhanced transparency and auditability.
