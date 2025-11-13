# Decision: Simplification of Bid Validity - Remove ZK Proofs

**Date:** 2025-11-13
**Status:** ACCEPTED
**Decision Makers:** Core team

---

## Decision

**We will NOT require zero-knowledge proofs of bid validity (balance sufficiency) at submission time.**

Instead, bids will be validated post-decryption by checking balance and filtering out invalid bids. Invalid bids that waste auction resources will incur a griefing deposit penalty.

This significantly simplifies the cryptographic stack while maintaining auction integrity through economic incentives rather than cryptographic guarantees.

---

## Context

### What Was Proposed

A comprehensive ZK proof system where every bid submission included:
- ZK proof that bidder has sufficient balance (via Merkle proof)
- ZK proof that bid amount ≤ balance (solvency constraint)
- ZK proof that bid is within valid range
- ZK proof that encrypted bid ciphertext is correctly formed

**See:** `/docs/technical/cryptographic-stack-analysis.md` Section 1.2 (original design)

**Implementation would require:**
1. Client-side proof generator (Rust, 100-500ms proving time)
2. Custom ZK circuits (Groth16/PLONK or SP1 zkVM programs)
3. On-chain proof verification (~150K gas on Ethereum, near-zero on Solana)
4. Circuit auditing and trusted setup (if using Groth16)
5. Poseidon-based encryption proving within circuits

### Why It Seemed Necessary

**Assumed benefits:**
- Cryptographic guarantee all submitted bids are valid
- Prevents spam bids from invalid participants
- Filters out insufficient balance before decryption
- Professional/sophisticated design

---

## Problems Identified

### Problem 1: Massive Technical Complexity for Minimal Benefit

**What we'd need to build:**
- Bid validity circuits (design, implement, audit)
- Client-side proving infrastructure
- On-chain verification contracts/native functions
- Integration between encryption and proving systems
- Maintenance of proving keys and circuit updates

**What we actually prevent:**
- Invalid bids being submitted

**What happens with invalid bids anyway:**
- They get filtered out post-decryption
- Auction proceeds with valid bids only
- No impact on auction integrity or results

**Conclusion:** Building an entire ZK proving system just to filter invalid bids earlier (pre-decryption vs post-decryption) provides minimal practical benefit.

### Problem 2: Invalid Balance Check Doesn't Prevent All Attacks

**ZK proof guarantees:** Balance was sufficient at submission time

**What it doesn't prevent:**
- Bidder transfers balance away after submission but before settlement
- Bidder participates in multiple auctions with same balance
- Bidder's balance becomes locked in other protocols
- Smart contract-based attacks that drain balance

**Conclusion:** Even with ZK proofs, we still need to check balance at settlement time. The pre-submission check is redundant.

### Problem 3: Griefing is Better Solved Economically

**Root issue:** Need to prevent spam/malformed bids

**Cryptographic approach (original):**
- Build ZK circuits
- Prove bid validity upfront
- Prevents invalid submissions

**Economic approach (simplified):**
- Require small deposit (e.g., $1-5)
- Slash deposit if bid is invalid/malformed
- Return deposit if bid is valid

**Comparison:**

| Dimension | ZK Proof Approach | Economic Deposit |
|-----------|------------------|------------------|
| Implementation complexity | Very high (circuits, proving, verification) | Low (deposit tracking, slashing) |
| Development time | Months (design, audit, test) | Weeks (simple smart contract logic) |
| Client burden | 100-500ms proving time | 0ms (just deposit) |
| Gas costs | ~150K gas (ETH) / near-zero (Solana) | Minimal (deposit tracking) |
| Security assumption | Cryptographic soundness | Economic rationality |
| Prevents spam | Yes (cryptographically) | Yes (economically) |
| Prevents griefing | Yes | Yes (costs $1-5 per spam bid) |
| Circuit audit risk | High (bugs in circuit = broken guarantees) | None (no circuits) |

**Conclusion:** Economic incentives achieve the same goal (prevent spam/griefing) with 1/100th the complexity.

### Problem 4: Encryption Scheme Mismatch

**Original assumption:** Use Poseidon-based encryption for ZK-friendliness

**Reality:** drand's timelock encryption (tlock) uses:
- Identity-Based Encryption (IBE) - Boneh-Franklin scheme
- BLS signatures on BLS12-381 curve
- NOT Poseidon (Poseidon is a hash function, not IBE)

**See:** [tlock: Practical Timelock Encryption from Threshold BLS](https://eprint.iacr.org/2023/189)

**Problem:**
- If we use drand's tlock library directly → can't prove encryption correctness in ZK circuits (IBE is not ZK-friendly)
- If we use custom Poseidon encryption → can't use drand's tlock library, must build custom timelock system
- Either way creates incompatibility and extra work

**Conclusion:** ZK-friendly encryption and practical timelock encryption (drand) are mismatched. Simplifying removes this tension entirely.

### Problem 5: Client Software Complexity

**With ZK proofs:**
```
Client workflow:
1. Fetch balance Merkle proof from chain
2. Generate bid object
3. Serialize bid
4. Encrypt bid (Poseidon or tlock)
5. Generate ZK proof (100-500ms)
   - Prove Merkle path validates balance
   - Prove bid ≤ balance
   - Prove encryption correctness
6. Submit (ciphertext, proof)
```

**Without ZK proofs:**
```
Client workflow:
1. Generate bid object
2. Encrypt bid using drand tlock (IBE)
3. Submit (ciphertext, deposit)
```

**Conclusion:** Removing ZK proofs reduces client complexity by ~70% and eliminates proving time entirely.

---

## Simplified Design

### Bid Submission Flow

```
1. Bidder creates bid: Bid { price, units, ... }
2. Bidder encrypts bid using drand tlock (IBE):
   - Target round: auction close time
   - ciphertext = tlock.encrypt(bid, drand_round)
3. Bidder submits:
   - ciphertext
   - deposit (e.g., 0.001 SOL or 0.0004 ETH)
4. Chain stores: (ciphertext, deposit, bidder)
```

### Post-Decryption Validation

```
1. Auction closes at time T
2. drand reveals randomness for round R (at time T)
3. Anyone can decrypt: plaintext = tlock.decrypt(ciphertext, drand_round_R)
4. For each ciphertext, validate:

   a) Decryption succeeds?
      - If NO → slash deposit (malformed ciphertext)

   b) Decrypted data is valid bid format?
      - If NO → slash deposit (corrupted/malicious data)

   c) Price is within reasonable range (RMS)?
      - If price deviates > 3σ from median → slash deposit (spam bid)

   d) Units are within reasonable range (RMS)?
      - If units deviate > 3σ from median → slash deposit (spam bid)

   e) Balance ≥ bid amount?
      - If NO → exclude from auction (NO PENALTY - just invalid)

5. Valid bids proceed to uniform price auction
6. Invalid bids (a-d) forfeit deposit
7. Insufficient balance bids (e) excluded but deposit returned
```

### Griefing Deposit Criteria

**Deposits are SLASHED (forfeited) for:**

1. **Decryption Failure**
   - Ciphertext cannot be decrypted using revealed drand key
   - Indicates malformed encryption or wrong target round
   - Penalty: Protects against spam submissions

2. **Price Out of Range (Root Mean Square deviation)**
   - Calculate RMS of all decrypted prices
   - If bid price > RMS + 3σ → slash deposit
   - Example: Median price $2000, RMS $2050, bid price $10,000 → spam
   - Penalty: Prevents noise attacks on price discovery

3. **Units Out of Range (Root Mean Square deviation)**
   - Calculate RMS of all decrypted units
   - If bid units > RMS + 3σ → slash deposit
   - Example: Median 10 ETH, RMS 15 ETH, bid 10,000 ETH → spam
   - Penalty: Prevents auction disruption

**Deposits are RETURNED for:**

4. **Insufficient Balance**
   - Balance < bid amount at settlement time
   - NOT penalized (balance could legitimately change)
   - Simply excluded from auction, deposit returned

5. **Valid Bids**
   - Pass all validation checks
   - Included in auction
   - Deposit returned immediately (or with settlement)

**Deposit Amount:**
- Suggested: $1-5 equivalent (0.001 SOL or 0.0004 ETH at $2500/ETH)
- Low enough to not deter legitimate bidders
- High enough to make spam economically unviable
- Adjustable via governance

**Slash Destination:**
- Option A: Burn (reduce token supply)
- Option B: Protocol treasury
- Option C: Distribute to valid bidders (reward good behavior)
- Decision: TBD during implementation

### Client Software Safeguards

**To prevent accidental deposit loss:**

1. **Validation Warnings**
   ```
   Client checks before submission:
   ✓ Bid encrypted with correct drand round
   ✓ Balance sufficient for bid amount
   ✓ Price within expected range (warn if >2x market)
   ✓ Units within expected range (warn if >2x typical)

   Display: "WARNING: Your bid price is 5x higher than market price.
            Continue? Deposit will be forfeited if bid is spam."
   ```

2. **Testnet Validation**
   - Client can test encryption/decryption locally
   - Verify bid will decrypt correctly
   - Check against spam criteria before submission

3. **Dry Run Mode**
   - Submit bid to testnet first
   - Verify it passes all validation
   - Then submit to mainnet

---

## Encryption Specification

### Using drand Timelock (tlock)

**Scheme:** Identity-Based Encryption (IBE) from Boneh-Franklin

**Implementation:** drand tlock library
- Go: `github.com/drand/tlock` (official)
- TypeScript: `drand/tlock-js`
- Rust: `tlock-rs` (community)

**Encryption:**
```rust
use tlock::encrypt;

// Target round for auction close (e.g., 4 hours from now)
let auction_close_time = current_time + 4.hours();
let drand_round = time_to_drand_round(auction_close_time);

// Serialize bid object
let bid = Bid { price: 2000, units: 10, bidder, ... };
let bid_bytes = serialize(&bid); // BCS or JSON

// Encrypt using IBE
let ciphertext = tlock::encrypt(
    drand_round,           // Identity (round number)
    &bid_bytes,            // Message
    &drand_public_key      // League of Entropy public key
);

// Submit ciphertext + deposit
submit_bid(ciphertext, deposit);
```

**Decryption (on-chain or off-chain):**
```rust
use tlock::decrypt;

// After auction closes, drand reveals round signature
let drand_signature = fetch_drand_round_signature(drand_round);

// Decrypt using revealed signature as private key
let plaintext_bytes = tlock::decrypt(
    &ciphertext,
    &drand_signature       // Decryption key (BLS signature)
);

// Deserialize back to bid object
let bid: Bid = deserialize(&plaintext_bytes);

// Validate bid
if validate(bid) {
    include_in_auction(bid);
    return_deposit(bidder);
} else {
    slash_deposit(bidder);
}
```

**Key Properties:**
- Automatic decryption (no reveal phase needed)
- Decentralized (League of Entropy threshold network)
- Predictable timing (3-second drand rounds)
- No ZK-friendliness required (no proving needed)
- Production-ready (Filecoin, Ethereum 2.0 use drand)

**Security:**
- Computational security (BLS signatures)
- Not quantum-resistant (acceptable for short-term privacy)
- 128-bit security level
- Sufficient for 4-24 hour auction windows

---

## Technical Impact

### What We Remove

| Component | Status | Complexity Saved |
|-----------|--------|------------------|
| **Bid validity ZK circuits** | ❌ REMOVED | Very High (design, audit, maintain) |
| **SP1 programs for bid proving** | ❌ REMOVED | High (Rust programs, integration) |
| **Client-side proof generation** | ❌ REMOVED | Medium (100-500ms, libraries) |
| **On-chain proof verification** | ❌ REMOVED | Medium (~150K gas) |
| **Merkle proof infrastructure** | ❌ REMOVED | Medium (state proofs at submission) |
| **Poseidon encryption in circuits** | ❌ REMOVED | High (ZK-friendly encryption) |
| **Circuit auditing** | ❌ REMOVED | Very High (security audits) |
| **Trusted setup ceremony** | ❌ REMOVED | Medium (if using Groth16) |

**Net complexity reduction: ~70% of bid-related cryptographic infrastructure**

### What We Keep

| Component | Status | Why |
|-----------|--------|-----|
| **Cross-chain verification (SP1)** | ✅ KEPT | Still needed for Ethereum↔Solana state proofs |
| **drand timelock encryption** | ✅ KEPT | Core to sealed-bid mechanism |
| **Balance checking** | ✅ KEPT | Moved to post-decryption (on-chain) |
| **Uniform price auction** | ✅ KEPT | Core auction mechanism unchanged |

### Simplified Tech Stack

**Before:**
1. SP1 for cross-chain verification
2. SP1 (or Groth16) for bid validity proving
3. drand for timelock
4. Poseidon for ZK-friendly encryption
5. Merkle proof generation at submission

**After:**
1. SP1 for cross-chain verification only
2. drand tlock for timelock encryption (IBE)
3. Balance checking post-decryption
4. Economic deposits for spam prevention

**Single-vendor dependency: Succinct Labs (SP1) reduced to only cross-chain use case**

---

## Cost Analysis

### Gas Cost Comparison (Per Bid)

| Metric | With ZK Proofs | Without ZK Proofs | Savings |
|--------|----------------|-------------------|---------|
| **On Ethereum** | ~150K gas (~$1.88 @ 50 gwei) | ~5K gas (~$0.06) | $1.82 |
| **On Solana** | ~50K compute units (~$0.00005) | ~10K CU (~$0.00001) | ~$0.00004 |
| **Client proving time** | 100-500ms | 0ms | 100-500ms |
| **Client proof generation cost** | CPU/memory intensive | None | Significant |

### Development Time Comparison

| Phase | With ZK Proofs | Without ZK Proofs | Time Saved |
|-------|----------------|-------------------|------------|
| **Circuit design** | 2-4 weeks | 0 | 2-4 weeks |
| **Circuit implementation** | 4-6 weeks | 0 | 4-6 weeks |
| **Circuit auditing** | 4-8 weeks | 0 | 4-8 weeks |
| **Client proving integration** | 2-3 weeks | 0 | 2-3 weeks |
| **Post-decryption validation** | 0 | 1-2 weeks | -1 to -2 weeks |
| **Deposit mechanism** | 0 | 1 week | -1 week |
| **Total** | **12-21 weeks** | **2-3 weeks** | **10-18 weeks** |

**Time to market improvement: 3-6 months faster**

---

## Decision Rationale

### Why We're Accepting This Simplification

1. **Pragmatic Engineering**
   - ZK proofs prevent invalid bids pre-decryption
   - Post-decryption validation achieves same outcome
   - Filtering invalid bids earlier ≠ better auction results
   - Complexity/benefit ratio is extremely poor

2. **Economic Incentives Are Sufficient**
   - $1-5 deposit makes spam economically unviable
   - Legitimate bidders unaffected (deposit returned)
   - Same griefing protection as cryptographic approach
   - Much simpler implementation

3. **Cryptographic Stack Simplification**
   - Removes entire proving system for bid validity
   - Eliminates ZK-friendly encryption requirement
   - Use drand tlock directly (production-ready IBE)
   - Focus SP1 resources on cross-chain only

4. **Faster Time to Market**
   - 3-6 months saved in development time
   - Avoid complex circuit auditing
   - Reduce implementation risk
   - Ship Phase 1 faster

5. **Alignment with Design Principles**
   - PRD states: "Practical deployability over theoretical privacy"
   - Economic sustainability over cryptographic maximalism
   - Simplicity enables focus on core auction mechanism

6. **Invalid Balance Checking Is Redundant**
   - Must check balance at settlement anyway
   - Pre-submission proof doesn't guarantee settlement-time validity
   - ZK proof provides false sense of security

### What We're NOT Giving Up

**Auction integrity:** Unaffected (invalid bids filtered either way)
**Griefing resistance:** Maintained (economic deposits)
**Spam prevention:** Maintained (economic deposits)
**User experience:** Improved (faster bid submission, no proving delay)

**What we ARE giving up:**
- Cryptographic guarantee of bid validity at submission time
- Privacy of bidders with insufficient balance (revealed post-decryption)

**Assessment:** Acceptable tradeoffs for massive complexity reduction.

---

## Implementation Roadmap

### Phase 1: Update Documentation (Weeks 1-2)

1. ✅ Create this decision document
2. Update `/docs/technical/cryptographic-stack-analysis.md`
   - Remove Section 1.2 (Bid validity ZK proofs)
   - Update Section 4.1 (Unified stack now cross-chain only)
   - Add reference to this decision document
3. Update `/docs/technical/timelock-bids.md`
   - Remove ZK proof sections (lines 42-100)
   - Add post-decryption validation flow
   - Specify drand IBE encryption (not Poseidon)
4. Update `/PRD.md`
   - Remove ZK bid validity requirements (line 70)
   - Add griefing deposit mechanism
5. Update other docs referencing bid validity proofs

### Phase 2: Implement Deposit Mechanism (Weeks 3-4)

1. Smart contract changes:
   - Add deposit requirement to bid submission
   - Implement post-decryption validation logic
   - Add RMS calculation for price/units spam detection
   - Implement slashing logic
2. Client software changes:
   - Add balance warnings before submission
   - Add price/units range warnings
   - Remove proof generation code
   - Simplify to drand tlock encryption only
3. Testing:
   - Test deposit return for valid bids
   - Test slashing for malformed ciphertexts
   - Test slashing for out-of-range prices/units
   - Test insufficient balance handling

### Phase 3: Integration Testing (Week 5)

1. End-to-end auction flow on testnet
2. Verify deposit mechanics work correctly
3. Test griefing attacks (ensure deposits prevent spam)
4. Validate RMS-based outlier detection
5. Confirm drand tlock decryption works on-chain

---

## Related Documents

**This decision affects:**
- `/docs/technical/cryptographic-stack-analysis.md` - Remove bid validity proving sections
- `/docs/technical/timelock-bids.md` - Simplify to post-decryption validation
- `/PRD.md` - Update sealed bid requirements
- `/docs/design/futures-market-model.md` - May reference bid validity
- `/docs/game-theory/shill-bidding-remediation.md` - May reference bid deposits

**Key technical references:**
- [tlock: Practical Timelock Encryption from Threshold BLS](https://eprint.iacr.org/2023/189)
- [drand Timelock Encryption Documentation](https://docs.drand.love/docs/timelock-encryption/)
- [Boneh-Franklin Identity-Based Encryption](https://crypto.stanford.edu/~dabo/papers/bfibe.pdf)

---

## Conclusion

After careful analysis, requiring zero-knowledge proofs of bid validity adds **massive technical complexity** for **minimal practical benefit**.

Invalid bids can be filtered post-decryption with the same auction integrity guarantees. Economic deposits provide sufficient griefing resistance without requiring complex cryptographic infrastructure.

**This simplification:**
- ✅ Reduces development time by 3-6 months
- ✅ Eliminates 70% of bid-related cryptographic complexity
- ✅ Removes circuit auditing risk
- ✅ Improves client UX (no proving delay)
- ✅ Maintains auction integrity
- ✅ Maintains griefing resistance

**Decision:** ACCEPTED. Proceed with post-decryption validation and economic deposit mechanism.

**Focus:** Invest saved engineering resources into perfecting cross-chain verification and core auction mechanism.
