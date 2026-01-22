# Atomica Protocol Evolution Roadmap

## v0.1 Beta → v1.0 → v2.0 Trust Reduction and Feature Expansion

This document outlines the multi-phase evolution of the Atomica protocol, progressively reducing trust assumptions and expanding capabilities.

---

## Executive Summary

| Phase | Trust Model | Key Innovation | Timeline |
|-------|-------------|----------------|----------|
| **v0.1 Beta** | Trusted validator set | Working system | Current |
| **v1.0** | Reduced validator trust | ZK auction verification | Future |
| **v2.0** | Minimal trust | Cross-chain auctions + BitVM | Future |

---

## v0.1 Beta (Current)

### Trust Model

**Assumptions:**
- Validator BLS public keys are trusted at deployment
- Validators behave honestly when signing state proofs
- MoveVM implementation on Atomica is correct
- Auction clearing logic in Move is correct

### What We Verify

```
v0 Trust Flow:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐   │
│  │   Bids      │────▶│  Atomica Move   │────▶│   BLS-signed state      │   │
│  │  Submitted  │     │    Contracts    │     │        proof            │   │
│  └─────────────┘     └─────────────────┘     └───────────┬─────────────┘   │
│                                                           │                 │
│                                                           ▼                 │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │   Users     │◀────│   Ethereum Contract                              │   │
│  │  Verified   │     │   - Verify BLS signature                         │   │
│  └─────────────┘     │   - Execute transfers based on state proof       │   │
│                      └─────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Trust Points (what we accept without proof):
1. ✓ Validator BLS keys (trusted at deployment)
2. ✓ MoveVM execution correctness
3. ✓ Move contract auction logic
4. ✓ Validator liveness (they can sign)
```

### Security Properties

- **BLS Signature Verification**: Cryptographically verified
- **State Root**: Signed by validator set
- **Auction Logic**: Trust Move implementation
- **Deposit Finality**: Based on validator signatures

### Limitations

- Must trust validators don't collude
- Must trust MoveVM implementation
- Must trust auction clearing is correct
- No independent verification of bid validity

---

## v1.0 (Future)

### Trust Model

**Reduced Trust Assumptions:**

| v0 Trust Assumption | v1 Trust Level | How It's Reduced |
|---------------------|----------------|------------------|
| Validator honesty | Reduced | ZK proof of auction correctness |
| MoveVM correctness | Reduced | ZK circuit independent verification |
| Auction logic | Minimal | ZK double-check of clearing |
| Bid validity | Verified | ZK circuit verifies all bids |

### Key Innovation: ZK Auction Verification

```
v1 Trust Flow:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐   │
│  │   Bids      │────▶│  Atomica Move   │────▶│   BLS-signed state      │   │
│  │  Submitted  │     │    Contracts    │     │        proof            │   │
│  └─────────────┘     └─────────────────┘     └───────────┬─────────────┘   │
│                                                           │                 │
│                          ┌───────────────────────────────┘                 │
│                          │                                                     │
│                          ▼                                                     │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │   ZK        │────▶│   ZK Circuit                                     │   │
│  │  Circuit    │     │   - Verify ALL bids included                      │   │
│  └─────────────┘     │   - Recalculate auction clearing                  │   │
│                      │   - Verify bid validity (no duplicates, etc)      │   │
│                      │   - Generate ZK proof of correctness              │   │
│                      └───────────────────────┬─────────────────────────┘   │
│                                              │                             │
│                                              ▼                             │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │   Users     │◀────│   Ethereum Contract                              │   │
│  │  Verified   │     │   1. Verify BLS signature (gate 1)              │   │
│  └─────────────┘     │   2. Verify ZK proof (gate 2 - FINAL)           │   │
│                      │   3. Execute transfers                           │   │
│                      └─────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Trust Reduction:
- Gate 1 (BLS): Validators only need to generate receipts for bids they received
- Gate 2 (ZK): Independent verification that auction clearing is correct
- Result: Validators can't manipulate auction outcome
```

### What the ZK Circuit Verifies

```rust
// Pseudo-code for ZK circuit constraints

circuit AuctionZKProof {
    // Public inputs
    state_root: PublicInput,
    auction_params: PublicInput,
    final_clearing_price: PublicInput,
    total_eth_collected: PublicInput,
    total_usdc_collected: PublicInput,
    
    // Private inputs (witness)
    all_bids: PrivateInput[],
    bid_proofs: PrivateInput[],
    
    // Constraints
    constraint state_root == compute_state_root(all_bids);
    
    for bid in all_bids {
        // 1. Bid validity
        constraint bid.amount > 0;
        constraint bid.user != address(0);
        constraint bid.nonce == unique(bid.nonce);
        
        // 2. Bid included in state
        constraint verify_inclusion(bid, bid_proof, state_root);
        
        // 3. Bid within auction window
        constraint bid.timestamp >= auction_params.start;
        constraint bid.timestamp < auction_params.deadline;
    }
    
    // 4. Auction clearing is correct
    let sorted_eth = sort(all_bids.filter(is_eth), by_price_desc);
    let sorted_usdc = sort(all_bids.filter(is_usdc), by_price_asc);
    
    let (clearing_price, eth_filled, usdc_filled) = 
        compute_ausubel_clearing(sorted_eth, sorted_usdc);
    
    constraint clearing_price == final_clearing_price;
    constraint eth_filled == total_eth_collected;
    constraint usdc_filled == total_usdc_collected;
    
    // 5. Allocations are correct
    for bidder in all_bids {
        let allocation = compute_allocation(bidder, clearing_price);
        constraint allocation == get_state_allocation(bidder);
    }
}
```

### Trust Reduction Properties

| Property | v0 Trust | v1 Trust | Reduction |
|----------|----------|----------|-----------|
| Validator honesty | Full trust | Receipt generation only | ~90% |
| MoveVM correctness | Full trust | Isolated ZK verification | ~95% |
| Auction logic | Full trust | ZK double-check | ~99% |
| Bid validity | Unverified | Verified in ZK | 100% |

### Implementation Requirements

1. **Isolated ZK Source Code**
   - No shared Rust components with MoveVM
   - Independent circuit implementation
   - Audit-friendly separation

2. **Proof System**
   - Choice of: PLONK, Groth16, or STARK
   - Ethereum on-chain verification
   - Efficient recursion for scalability

3. **Trusted Setup** (if applicable)
   - Ceremony for initial setup
   - Transparent setup preferred
   - Backup mechanisms

### Security Properties

- **Valid Receipts**: Validators must have actually received bids
- **Correct Clearing**: ZK circuit independently verifies
- **No Manipulation**: Even colluding validators can't fake
- **Isolated Trust**: No shared code = no shared bugs

---

## v2.0 (Future)

### Cross-Chain Auctions

Extending the protocol to support auctions across multiple blockchains:

```
v2 Cross-Chain Architecture:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Atomica Hub (Aptos-based)                        │    │
│  │                                                                      │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐    │    │
│  │  │   BTC     │  │   ETH     │  │   USDC    │  │   (Future)    │    │    │
│  │  │  Bridge   │  │  Bridge   │  │  Bridge   │  │   Chains      │    │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────┬───────┘    │    │
│  │        │              │              │                  │            │    │
│  │        ▼              ▼              ▼                  ▼            │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │              Cross-Chain Auction Coordinator                  │    │    │
│  │  │                                                              │    │    │
│  │  │  - Match bids across chains                                  │    │    │
│  │  │  - Generate cross-chain settlement                           │    │    │
│  │  │  - Coordinate multi-step releases                            │    │    │
│  │  └──────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────┬───────────────────────────────┘    │
│                                        │                                        │
│            ┌───────────────────────────┼───────────────────────────┐        │
│            ▼                           ▼                           ▼        │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│  │   Bitcoin       │     │   Ethereum      │     │    Solana       │      │
│  │   (BitVM)       │     │   (EVM)         │     │    (Anchor)     │      │
│  │                 │     │                 │     │                 │      │
│  │ - Taproot       │     │ - BLS proofs    │     │ - SeaLevel      │      │
│  │ - STARK proofs  │     │ - ZK auction    │     │ - (Future)      │      │
│  │ - Covenant-based│     │ - Settlement    │     │                 │      │
│  │   releases      │     │                 │     │                 │      │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Chain-Specific Verification

| Chain | v2 Verification Method | Notes |
|-------|------------------------|-------|
| **Bitcoin** | BitVM + STARK proofs | Fraud proofs, covenant-based releases |
| **Ethereum** | BLS + ZK auction proof | Existing v1 verification + cross-chain |
| **Solana** | SeaLevel + ZK proofs | Future integration |
| **Aptos** | Native Move | Hub chain, already trusted |

### Bitcoin Integration (BitVM)

```
Bitcoin Cross-Chain Settlement:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  1. DEPOSIT PHASE                                                            │
│     ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐ │
│     │   User      │────▶│  Atomica Hub    │────▶│   Bitcoin               │ │
│     │   locks BTC │     │  (records UTXO) │     │   (P2SH output)         │ │
│     └─────────────┘     └─────────────────┘     └─────────────────────────┘ │
│                                                                              │
│  2. AUCTION PHASE                                                            │
│     ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐ │
│     │   Cross-    │────▶│  ZK Auction     │────▶│   Cross-chain           │ │
│     │   chain bid │     │  Clearing       │     │   allocation            │ │
│     └─────────────┘     └─────────────────┘     └─────────────────────────┘ │
│                                                                              │
│  3. SETTLEMENT PHASE (Multi-Step Ratchet)                                    │
│                                                                              │
│     Step A: Atomica confirms auction                                         │
│     ┌─────────────────────────────────────────────────────────────────────┐  │
│     │  Atomica Hub ──(ZK proof)──▶ BitVM Challenge Program               │  │
│     │  - Auction results verified                                         │  │
│     │  - No fraud detected (challenge window)                             │  │
│     └─────────────────────────────────────────────────────────────────────┘  │
│                                      │                                       │
│                                      ▼                                       │
│     Step B: Bitcoin release commitment                                       │
│     ┌─────────────────────────────────────────────────────────────────────┐  │
│     │  Covenant tx ──▶ Time-locked release tx                            │  │
│     │  - Recipient must prove Atomica confirmed                          │  │
│     │  - Timeout allows anyone to broadcast                               │  │
│     └─────────────────────────────────────────────────────────────────────┘  │
│                                      │                                       │
│                                      ▼                                       │
│     Step C: Completion or Challenge                                          │
│     ┌─────────────────────────────────────────────────────────────────────┐  │
│     │  IF no challenge:                                                   │  │
│     │    - Release tx becomes valid after timeout                         │  │
│     │    - User claims BTC                                                │  │
│     │                                                                      │  │
│     │  IF challenge:                                                      │  │
│     │    - BitVM resolves via STARK proof                                 │  │
│     │    - Winner takes all                                               │  │
│     └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Step Ratchet Design

Each chain uses a ratchet mechanism to ensure funds are only released when the other chain has irreversibly committed:

```rust
// Generic ratchet interface
trait CrossChainRatchet<ChainState, Proof> {
    // Initiate release on this chain
    fn initiate_release(
        &self,
        amount: Coin,
        recipient: Address,
        other_chain_commitment: Commitment
    ) -> Result<RatchetTransaction>;
    
    // Prove the other chain has committed
    fn prove_other_commitment(
        &self,
        commitment: Commitment,
        proof: Proof
    ) -> Result<ConfirmedRelease>;
    
    // Finalize after timeout (no challenges)
    fn finalize(&self, tx: RatchetTransaction);
    
    // Challenge a fraudulent release
    fn challenge(
        &self,
        tx: RatchetTransaction,
        fraud_proof: FraudProof
    );
}
```

### Trust Properties

| Property | v0 | v1 | v2 |
|----------|----|----|-----|
| Single-chain security | Validator trust | ZK verified | ZK + BitVM |
| Cross-chain atomicity | N/A | N/A | Multi-step ratchet |
| Chain-specific trust | MoveVM | ZK circuit | Isolated proof systems |
| Liveness assumptions | Validators | Validators | All chains must be live |

---

## Implementation Roadmap

```
Timeline:
─────────────────────────────────────────────────────────────────────────────────▶

v0.1 Beta          v1.0                       v2.0
   │                │                          │
   │    ┌───────────┴───────────┐             │
   │    │                       │             │
   │    │  ZK Circuit Dev       │             │
   │    │  - Circuit design     │             │
   │    │  - Proof system eval  │             │
   │    │  - Trusted setup      │             │
   │    │                       │             │
   │    └───────────────────────┘             │
   │                                          │
   │  ┌───────────────────────────────────────┴───────────────────┐
   │  │                                                           │
   │  │  v1: ZK Auction Verification                              │
   │  │  - BLS signature verification (Gate 1)                    │
   │  │  - ZK proof verification (Gate 2 - FINAL)                 │
   │  │  - Isolated Rust implementation                           │
   │  │                                                           │
   │  └───────────────────────────────────────────────────────────┘
   │                                                     │
   │                                                     ┌───────────────────────┐
   │                                                     │                       │
   │                                                     │  v2: Cross-Chain      │
   │                                                     │  - Bitcoin BitVM      │
   │                                                     │  - Multi-chain        │
   │                                                     │    ratchets           │
   │                                                     │  - STARK proofs       │
   │                                                     │                       │
   │                                                     └───────────────────────┘
```

---

## Security Comparison

### Trust Thickness (lower = less trust required)

```
v0.1 Beta:
██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Validator    MoveVM    Auction Logic    Bid Validity    MoveVM
  Trust       Trust       Trust           None          (all bids verified in ZK)

v1.0:
██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Receipt Gen    ZK Circuit   ZK Circuit    ZK Circuit
  (receipts)    (isolated)   (correct)    (complete)

v2.0:
█░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Receipt Gen   ZK Circuit   BitVM       STARK       Multi-chain
  + liveness   (isolated)  (fraud)     (valid)     (ratchet)
```

### Attack Surface Reduction

| Attack Vector | v0.1 Severity | v1 Mitigation | v2 Mitigation |
|---------------|---------------|---------------|---------------|
| Validator collusion | Critical | ZK verification | ZK + BitVM |
| MoveVM bug | Critical | ZK isolation | ZK isolation + circuits |
| Auction manipulation | High | ZK double-check | ZK + multi-chain |
| Cross-chain rollback | N/A | N/A | Ratchet mechanism |
| ZK circuit bug | N/A | Audit + testing | Audit + multi-proof |

---

## Dependencies Between Versions

```
v0.1 Beta
    │
    │ (ZK circuit development, proof system selection)
    ▼
v1.0 ──────▶ Requires:
    │         • Working v0 system
    │         • ZK circuit implementation
    │         • Trusted setup (if needed)
    │         • On-chain verifier contract
    │         • Independent audit
    │
    │ (Bitcoin integration, BitVM development, ratchet design)
    ▼
v2.0 ──────▶ Requires:
    │         • Working v1 system
    │         • BitVM contracts
    │         • STARK proof system
    │         • Cross-chain coordination
    │         • Multi-chain testing
    │
    ▼
Future: Additional chains, improved proof systems, etc.
```

---

## Documentation References

This evolution roadmap is referenced from:

- **PRD.md**: Product requirements and high-level goals
- **docs/plan/evm-contracts-implementation-plan.md**: EVM contract implementation
- **docs/plan/ethereum-state-verification-plan.md**: State proof verification strategy
- **docs/technical/aptos-proof-systems-summary.md**: Proof system architecture
- **docs/technical/cryptographic-stack-analysis.md**: Cryptographic components

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Related: v0.1 Beta → v1.0 → v2.0 Evolution*
