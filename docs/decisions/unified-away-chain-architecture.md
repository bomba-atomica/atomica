# Decision: Unified Away Chain Architecture

**Date:** 2025-12-04
**Status:** ACCEPTED
**Decision Makers:** Core team

---

## Decision

**All away chains (Ethereum, Solana, Base, Arbitrum, Polygon, etc.) will use a single, unified verification architecture.**

All chains use merkle-proof-based settlement with dual-layer verification (BLS threshold signatures + ZK proofs). There will be no chain-specific implementations.

**Note on Technology**: Atomica chain (the home chain) is built using Aptos-core software as the blockchain implementation, but runs as an independent network with its own validators, governance, and token economics.

---

## Context

### Cross-Chain Verification Challenge

Atomica needs to enable auctions where:
- Users deposit on their preferred chains (Ethereum, Solana, etc.)
- Auction executes on Atomica chain
- Settlement results verified and enforced on away chains
- Users withdraw on their original deposit chain

**Key question**: Should verification mechanisms differ by chain, or use unified approach?

### Architectural Options Considered

**Option 1: Chain-Specific Architectures**

Different mechanisms for different chain cost profiles:
- **High gas chains** (Ethereum): Merkle proofs + ZK verification
- **Low gas chains** (Solana): Per-user transactions or parallel execution

**Option 2: Unified Architecture** (CHOSEN)

Same mechanism for all chains regardless of gas costs:
- Merkle-proof-based settlement
- Dual-layer verification (BLS + ZK)
- Identical Time Lock contracts

---

## Analysis of Chain-Specific Approach

### Theoretical Benefits

**Cost optimization:**
- Solana could support per-user transactions cheaply ($0.0001/tx)
- Full transparency with complete tx history on away chain
- No merkle proof burden on users

**Example cost comparison:**
- Ethereum (merkle): $50-100 for 100 users
- Solana (per-user): $0.01 for 100 users

### Critical Problems

### Problem 1: Increased Complexity and Maintenance Burden

**Multiple codebases to maintain:**
- Different contract implementations per chain type
- Chain-specific settlement mechanisms
- Separate testing and audit requirements

**Impact:**
- Nx testing surface (N = number of chain types)
- Multiple security audit scopes
- Complex documentation explaining chain differences
- Harder to reason about cross-chain interactions
- Bug fixes must be adapted per architecture

### Problem 2: UX Inconsistency Across Chains

**Different user flows:**
- High-gas chains: Deposit, bid, withdraw with proof
- Low-gas chains: Different withdrawal mechanism or settlement flow

**Confusion:**
- Users must understand which architecture applies to their chain
- Wallets/dApps must implement chain-specific logic
- Error messages and failure modes differ
- Support burden: explaining different flows per chain
- Cross-chain auctions become ambiguous

### Problem 3: Security Model Divergence

**Different security guarantees per chain:**
- High-gas chains: BLS consensus + ZK computational proof
- Low-gas chains: Different verification mechanism

**Risk:**
- Separate security audits required per mechanism
- Attack vectors differ between architectures
- Harder to reason about edge cases
- Validator set rotation handled differently
- Inconsistent failure modes

### Problem 4: Marginal Cost Savings Don't Justify Complexity

**Cost comparison:**
- Unified architecture (Solana): ~$0.0005 (2 TXs: merkle root + ZK proof)
- Per-user transactions (Solana): ~$0.01 (100 users × 1 TX each)
- Parallel execution (Solana): ~$0.02 (100 bids × 2 chains)

**Analysis:**
- Absolute cost on Solana already negligible (<$0.001)
- Optimization saves < 0.05 cents per auction
- Simplicity and consistency more valuable than micro-optimization
- **Engineering complexity not worth $0.0005 cost savings**

### Problem 5: Implementation Coordination

**Chain-specific approach requires:**
- Determining gas cost threshold for architecture selection
- Different contract deployments per chain type
- Chain categorization (is Arbitrum "high" or "low" gas?)
- Handling chains that transition categories (L2s get cheaper)
- Migration path if chain moves between categories

**Failure modes:**
- Miscategorize chain → use wrong architecture → poor economics
- Gas costs change → suddenly wrong architecture for chain
- New L2 launches → which architecture to deploy?

---

## Decision Rationale

### Benefit 1: Single Codebase and Implementation

**One verification system:**
- BLS threshold signatures + ZK proofs
- Merkle-proof-based settlement
- Identical Time Lock contract across all chains
- Same security model everywhere

**Impact:**
- 50% reduction in development time
- Single security audit covers all chains
- Easier to add new chains (deploy same contracts)
- Simplified documentation

### Benefit 2: Consistent User Experience

**Same flow everywhere:**
1. Deposit on away chain (Ethereum, Solana, Base, etc.)
2. Submit sealed bid on Atomica (account abstraction)
3. Auction executes on Atomica only
4. Withdraw on away chain using merkle proof

**Benefits:**
- Users understand one flow, works on all chains
- Wallets implement once, works everywhere
- Documentation and support simplified
- No chain-specific edge cases

### Benefit 3: Unified Security Model

**Dual-layer verification:**
- Layer 1: BLS threshold signatures (consensus)
- Layer 2: ZK proofs (computation)

**Properties:**
- Same security guarantees on all chains
- Single audit scope
- Well-understood attack surface
- Consistent failure modes

### Benefit 4: Easier Cross-Chain Auctions

**Example**: Ethereum + Solana users in same auction

**Unified Approach (Chosen):**
- Both users deposit on their respective chains
- Both submit bids to Atomica (account abstraction)
- Single auction executes on Atomica
- Both withdraw on their chain with merkle proof
- **Works seamlessly**

**Hypothetical Parallel Approach:**
- Auction must run on Ethereum, Solana, AND Atomica?
- How to ensure all three get same bids?
- What if merkle roots diverge?
- **Extremely complex**

### Benefit 5: Solana Gas Costs Still Acceptable

**Cost analysis:**
- Unified architecture on Solana: $0.0005 per auction
- Parallel architecture on Solana: $0.02 per auction
- **40x more expensive, but still negligible in absolute terms**

**Trade-off accepted:**
- Solana users could have 40x cheaper auctions with parallel execution
- But gain: consistency, simplicity, maintainability
- **$0.0005 is already so cheap that optimization doesn't matter**

---

## Alternatives Considered

### Alternative 1: Chain-Specific Architectures

**Approach:** Different verification mechanisms based on chain gas costs

**Rejected because:**
- Multiple codebases to maintain
- Inconsistent user experience
- Complex cross-chain auction support
- Marginal cost savings not worth complexity

### Alternative 2: Per-User Transactions Everywhere

**Approach:** All chains settle with individual user transactions (no merkle proofs)

**Rejected because:**
- Ethereum gas costs prohibitive ($1000+ for 100 users)
- Doesn't scale to hundreds of auction participants
- Wasteful even on low-cost chains

### Alternative 3: Unified Merkle-Proof Architecture (CHOSEN)

**Approach:** All chains use identical verification mechanism (BLS + ZK + merkle proofs)

**Accepted because:**
- ✅ Single implementation and codebase
- ✅ Consistent UX across all chains
- ✅ Unified security model and audit scope
- ✅ Enables cross-chain auctions naturally
- ✅ Economical on all chains (from Ethereum to Solana)
- ✅ Easy to add new chains (deploy same contracts)
- ✅ No chain categorization needed

---

## Consequences

### Positive

1. **Faster development**: Single codebase means 50% less work
2. **Easier security**: One audit scope instead of two
3. **Better UX**: Same experience on all chains
4. **Simpler testing**: Half the test cases
5. **Easier onboarding**: One architecture to understand
6. **Cross-chain ready**: Natural support for multi-chain auctions

### Negative

1. **Slightly higher cost on Solana**: $0.0005 instead of $0.0002 (negligible)
2. **Less transparency on low-cost chains**: Merkle proof vs full on-chain auction
3. **Missed optimization**: Could have leveraged Solana's low gas costs

### Mitigations

**For transparency**:
- Auction state and all bids are fully visible on Atomica
- Off-chain indexers can provide full audit trail
- ZK proofs provide computational verification
- Still better transparency than centralized systems

**For cost**:
- $0.0005 is already negligible (0.05 cents)
- Optimization would save 0.03 cents per auction
- Not worth the complexity trade-off

---

## Implementation Impact

### Avoided Complexity

By choosing unified architecture from the start:
- ❌ No multi-architecture codebase
- ❌ No chain-specific settlement logic
- ❌ No chain categorization system
- ❌ No per-chain documentation variants

### Enabled Simplicity

- ✅ Single Time Lock contract (deploy identically on all chains)
- ✅ Single settlement mechanism (merkle proofs everywhere)
- ✅ Single ZK circuit (verify Ausubel execution)
- ✅ Single security model (BLS + ZK)
- ✅ Single test suite
- ✅ Single audit scope

### Documentation Approach

- Architecture plan: Unified verification section
- Architecture overview: Same mechanism for all chains
- Implementation guides: Single flow applicable everywhere
- Security model: One comprehensive audit

---

## Related Decisions

- [Aptos Validator Timelock](./aptos-validator-timelock.md) - Sealed bid encryption
- [Bid Validity Simplification](./bid-validity-simplification.md) - Post-decryption validation

---

## References

- Unified architecture specification: `docs/technical/architecture-plan.md`
- Architecture overview: `docs/technical/architecture-overview.md`
- Gas cost economics: `docs/technical/architecture-plan.md#gas-cost-analysis`
