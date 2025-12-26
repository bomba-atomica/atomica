# Atomica Technical Risks

**Document Type**: Risk Assessment & Status Tracking
**Last Updated**: 2025-12-22
**Status**: Active Development

---

## Overview

This document tracks the three major technical risks in the Atomica project and their current status. These represent critical path items that could significantly impact the project's viability if not successfully resolved.

---

## Risk #1: Ethereum Signing of Aptos Platform Transactions

**Status**: ✅ **COMPLETED**

### Description

Enable users to sign Aptos/Move transactions using their Ethereum wallets (MetaMask, Ledger, etc.) without requiring Aptos-native wallets or gas tokens.

### Technical Challenge

- Ethereum uses secp256k1 ECDSA signatures
- Aptos natively uses Ed25519 signatures
- Need to verify Ethereum signatures on-chain in Move
- Must derive Aptos addresses deterministically from Ethereum keys
- Require gas sponsorship for seamless UX

### Solution Implemented

**Account Abstraction via Aptos AIP-113 (Derivable Accounts)**:

1. **Signature Verification**: Use `aptos_std::secp256k1::ecdsa_recover` to verify Ethereum signatures in Move
2. **Deterministic Address Derivation**:
   ```
   atomica_address = SHA3-256(ethereum_pubkey || auth_fn_id || domain)
   ```
3. **Gas Sponsorship**: Fee payer backend service sponsors user transactions
4. **No Pre-Registration**: Accounts created on first transaction

### Key Files

- `/docs/technical/ethereum-wallet-atomica-bridge.md` - Full specification
- `/docs/technical/account-abstraction.md` - Implementation details
- `/source/atomica-aptos/aptos-move/framework/aptos-stdlib/sources/cryptography/secp256k1.move` - Signature verification

### Remaining Work

- [ ] Production deployment of fee payer service
- [ ] Frontend integration with MetaMask
- [ ] Gas cost optimization for signature verification

---

## Risk #2: Implement Timelock Encryption End-to-End

**Status**: 🟡 **IN PROGRESS** (Partial - Next Priority)

### Description

Implement N-layer "Onion" timelock encryption for sealed bids and reserve prices, preventing early decryption through collusion while maintaining liveness guarantees.

### Technical Challenge

**N-Layer Onion Architecture**:
- **Flexible Layer Composition**: Support arbitrary number of encryption layers (N ≥ 1)
- **Pluggable Key Providers**: Each layer can use different key material sources
- **Configurable Order**: Layer ordering can change based on security requirements
- **Orthogonal Key Generation**: How providers generate keys is independent of onion structure
- **Collusion Resistance**: Attackers must compromise ALL layers to decrypt early
- **Liveness Guarantee**: Decryption succeeds if threshold met in each layer

**Example Configurations**:

*Configuration 1: Dual-Layer (Validators + Sellers)*
- Layer 1 (Outer): Atomica validator timelock (>67% consensus required)
- Layer 2 (Inner): Auction seller group (>33% seller stake required)

*Configuration 2: Dual-Layer (Validators + Drand)*
- Layer 1 (Outer): Atomica validator timelock (>67% consensus)
- Layer 2 (Inner): Drand tlock (public randomness beacon)

*Configuration 3: Triple-Layer (Validators + Drand + Sellers)*
- Layer 1 (Outer): Atomica validator timelock (>67% consensus)
- Layer 2 (Middle): Drand tlock (public randomness)
- Layer 3 (Inner): Auction seller group (>33% stake)

**Key Provider Independence**: The onion encryption framework is agnostic to how each layer's key material is generated (DKG, centralized beacon, threshold schemes, etc.)

**Integration Complexity**:
- Span changes across zapatos (BLS DKG), atomica-move-contracts (sealed bid logic), and atomica-web (encryption UI)
- Requires low-level cryptographic primitives
- Performance constraints for on-chain operations

### Work Completed in zapatos

✅ **BLS12-381 DKG Infrastructure**:
- `/source/atomica-aptos/crates/aptos-dkg/` - Full DKG implementation
  - PVSS (Publicly Verifiable Secret Sharing)
  - Weighted threshold schemes
  - Range proofs for secret validation
  - ElGamal encryption on BLS12-381

✅ **Move Smart Contract Primitives**:
- `/source/atomica-aptos/aptos-move/framework/aptos-framework/sources/dkg.move` - DKG state management
- `/source/atomica-aptos/aptos-move/framework/aptos-framework/sources/timelock.move` - Timelock rotation logic
- BLS signature aggregation support

✅ **Proof of Concept**:
- `/source/atomica-aptos/crates/aptos-dkg/tests/tlock_poc.rs` - IBE encryption/decryption demo
- Demonstrates Boneh-Franklin IBE on BLS12-381
- Shows pairing-based encryption working correctly

### Remaining Work

See **Implementation Plan** below for detailed breakdown.

**High-Level Phases**:

**a) Confirm zapatos functionality with low-level tests** (2-3 weeks)
- Validate DKG correctness at scale (100+ participants)
- Test threshold decryption under adversarial conditions
- Benchmark encryption/decryption performance
- Test failure modes and liveness guarantees

**b) Update atomica-move-contracts** (3-4 weeks)
- Implement N-layer onion encryption framework
- Support configurable layer composition (validators, drand, sellers, etc.)
- Integrate multi-layer encryption for reserve prices and bids
- Implement on-chain decryption aggregation for each layer
- Add deposit slashing for invalid bids
- Implement Scuttle Reward mechanism

**c) Update atomica-web interface** (2-3 weeks)
- Client-side encryption library (TypeScript/WASM)
- UI for encrypting reserve prices
- UI for encrypting bids
- Transaction payload construction for MetaMask
- Decryption status monitoring

### Dependencies

- Risk #1 (Ethereum signing) - ✅ Completed
- zapatos BLS infrastructure - ✅ Completed
- Auction mechanism design - ✅ Completed (see `/docs/game-theory/uniform-price-auctions.md`)

### Risk Mitigation

**Cryptographic Risk**: Using production-tested `aptos-dkg` crate (no new crypto)
**Liveness Risk**: Low seller threshold (33%) ensures >67% can grief without breaking
**Integration Risk**: Incremental testing at each layer (Rust → Move → Web)

---

## Risk #3: Confirm Ethereum Transaction Inclusion Cross-Chain

**Status**: ⏳ **NOT STARTED** (Last Priority)

### Description

Verify that user deposits on Ethereum (and other away chains) have been included in finalized blocks, and make this state available to Atomica chain validators for auction eligibility checks.

### Technical Challenge

**Cross-Chain State Verification**:
- Atomica chain must trustlessly verify Ethereum state
- Cannot rely on centralized oracles
- Must handle chain reorganizations
- Need efficient proof mechanisms (low gas cost)
- Must work identically across all away chains (Ethereum, Solana, Base, etc.)

**Dual-Layer Verification**:
1. **BLS Threshold Signatures** - Atomica validators sign Ethereum state roots
2. **ZK Proofs** - Anyone can verify state transitions are correct

### Proposed Solution

**ZK Light Client on Atomica**:
- Use Succinct SP1 to generate ZK proofs of Ethereum block headers
- Atomica maintains Ethereum state root on-chain
- Users prove deposit inclusion via Merkle proofs against verified state root
- Settlement requires both BLS consensus + ZK computation agreement

**Unified Architecture for All Chains**:
- Same verification mechanism for Ethereum, Solana, Base, Arbitrum, etc.
- Merkle-proof-based settlement (O(1) cost per auction, not per user)
- See `/docs/technical/architecture-plan.md` (Unified Away Chain Architecture section)

### Remaining Work

**Phase 1: Ethereum Light Client** (4-6 weeks)
- [ ] Deploy Succinct SP1 ZK verifier on Atomica
- [ ] Implement Ethereum header verification circuit
- [ ] Sync Ethereum state roots to Atomica
- [ ] Test reorg handling

**Phase 2: Deposit Verification** (2-3 weeks)
- [ ] Implement Merkle proof verification in Move
- [ ] Add deposit registry to auction contracts
- [ ] Link deposit proofs to bid eligibility
- [ ] Add timeout mechanisms for stale proofs

**Phase 3: Multi-Chain Support** (4-6 weeks)
- [ ] Solana light client (different architecture)
- [ ] L2s (Arbitrum, Optimism, Base) - reuse Ethereum logic
- [ ] Unified interface for all chains

### Dependencies

- ZK proof system selection - ✅ Completed (Succinct SP1, see `/docs/technical/cryptographic-stack-analysis.md`)
- BLS signature verification - ✅ Completed in zapatos
- Risk #2 (Timelock encryption) - 🟡 In Progress

### Risk Mitigation

**Latency Risk**: ZK proof generation (5-30 min) - acceptable for 1-hour settlement window
**Gas Cost Risk**: Use ZK-wrapped BLS verification (~250K gas vs 300K gas direct)
**Reorganization Risk**: Wait for finality (12 minutes on Ethereum) before accepting deposits

---

## Overall Project Risk Assessment

### Critical Path

```
Risk #1 (Ethereum Signing) → Risk #2 (Timelock) → Risk #3 (Cross-Chain Verification)
        ✅ DONE                    🟡 IN PROGRESS              ⏳ PENDING
```

### Timeline Estimate

- **Risk #2 (Timelock)**: 7-10 weeks (next sprint)
- **Risk #3 (Cross-Chain)**: 10-15 weeks (after Risk #2)
- **Total Remaining**: ~4-6 months to MVP

### Success Criteria

**MVP Definition (All risks resolved)**:
- ✅ Users can sign Atomica transactions with MetaMask
- 🟡 Bids are encrypted end-to-end with dual-layer timelock
- ⏳ Ethereum deposits verified trustlessly on Atomica
- 🟡 Auction clears and settles successfully
- ⏳ Users withdraw funds on Ethereum with Merkle proofs

### De-Risking Strategy

1. **Incremental Testing**: Each layer tested independently before integration
2. **Testnet Deployment**: Full system deployed to testnet before mainnet
3. **Fallback Mechanisms**: Graceful degradation if any component fails
4. **Security Audits**: Independent review of cryptographic components

---

## References

### Architecture Documents
- [Architecture Overview](/docs/technical/architecture-overview.md)
- [Architecture Plan](/docs/technical/architecture-plan.md)
- [Ethereum Wallet Bridge](/docs/technical/ethereum-wallet-atomica-bridge.md)

### Cryptography Documents
- [Timelock Seller-Stake DKG](/docs/design/timelock-seller-stake-dkg.md)
- [Cryptographic Stack Analysis](/docs/technical/cryptographic-stack-analysis.md)
- [Cross-Chain Verification](/docs/technical/cross-chain-verification.md)

### Design Documents
- [Product Requirements Document](/Prd.md)
- [Futures Market Model](/docs/design/futures-market-model.md)
- [Uniform Price Auctions](/docs/game-theory/uniform-price-auctions.md)

---

**Last Updated**: 2025-12-22
**Next Review**: After Risk #2 completion
