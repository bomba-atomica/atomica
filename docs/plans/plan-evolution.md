# Atomica Protocol Evolution Roadmap

## v0.1 Beta → v1.0 → v2.0 Trust Reduction and Feature Expansion

This document outlines the multi-phase evolution of the Atomica protocol, progressively reducing trust assumptions and expanding capabilities.

---

## Executive Summary

| Phase | Trust Model | Key Innovation | Timeline |
|-------|-------------|----------------|----------|
| **v0.1 Beta** | Trusted validators | Working system with single verification | Current |
| **v1.0** | Same validators + ZK double-check | ZK auction verification (validators + ZK must match) | Future |
| **v2.0** | Same + cross-chain | Cross-chain auctions + BitVM ratchet | Future |

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
3. ✓ Auction clearing logic in Move contracts (single verification - TRUSTED)
4. ✓ Validator liveness (they can sign)
```

### Security Properties

- **BLS Signature Verification**: Cryptographically verified
- **State Root**: Signed by validator set
- **Auction Logic**: Trust Move implementation
- **Deposit Finality**: Based on validator signatures

### Limitations

- Must trust validators don't collude to manipulate auction
- Must trust MoveVM implementation
- Must trust auction clearing is correct (no independent verification)
- No independent verification of bid validity

---

## v1.0 (Future)

### Trust Model

**Reduced Trust Assumptions:**

| v0 Trust Assumption | v1 Trust Level | How It's Verified |
|---------------------|----------------|-------------------|
| Validator honesty | Same | 2/3 honest assumption (unchanged) |
| MoveVM correctness | Reduced | ZK circuit independent execution |
| Auction clearing | Same | **Double verification** - validators AND ZK circuit must match |
| Bid validity | Verified | ZK circuit verifies all bids included |

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
- Gate 2 (ZK): Independent ZK verification that auction clearing matches
- Result: Validators CANNOT deviate from correct auction logic - any manipulation will be caught
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
        compute_uniform_price_clearing(sorted_eth, sorted_usdc);
    
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

| Property | v0.1 Beta | v1.0 | v2.0 |
|----------|-----------|------|------|
| **Validator Honesty** (2/3 threshold) | Trust assumption | Trust assumption | Trust assumption |
| **Cross-Chain Trust** | N/A | N/A | Ratchet mechanism |
| **Auction Logic** | Trust MoveVM | ZK verified | ZK verified |
| **Bid Validity** | Trust validators | ZK verified | ZK verified |
| **MoveVM Correctness** | Trust implementation | ZK isolation | ZK isolation |

**Key Observations:**
- **Validator honesty is a constant assumption** across all versions: We trust that 2/3 of validators are not colluding (standard BLS threshold security)
- **v1 reduces trust in auction logic**: Validators can't manipulate auction outcome because ZK circuit independently verifies
- **v2 adds cross-chain trust**: Ratchet mechanism ensures funds only release when other chain has committed

### Security Comparison

#### Trust Thickness (lower = less trust required)

```
v0.1 Beta:
████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Validator     Auction Logic    Bid Validity    MoveVM        Cross-Chain
Honesty       (2/3 thresh)    Trust validrs   (all bids verified in ZK)
(2/3 thresh)

v1.0:
███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Validator     ZK Circuit      ZK Circuit     ZK Circuit
Honesty       (isolated)      (correct)      (complete)
(2/3 thresh)

v2.0:
███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Validator     ZK Circuit      ZK Circuit     ZK Circuit     Ratchet
Honesty       (isolated)      (correct)      (complete)    (atomic)
(2/3 thresh)
```

### Attack Surface Reduction

| Attack Vector | v0.1 Severity | v1 Mitigation | v2 Mitigation |
|---------------|---------------|---------------|---------------|
| Validator collusion (2/3) | Critical | ZK verification | ZK + BitVM |
| Auction manipulation | High | ZK double-check | ZK + multi-chain |
| Cross-chain rollback | N/A | N/A | Ratchet mechanism |
| MoveVM bug | Critical | ZK isolation | ZK isolation + circuits |
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
