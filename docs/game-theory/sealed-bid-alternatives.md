# Sealed-Bid Alternatives: Public-Bid Auction Formats for Multi-Unit Uniform Price Auctions

## Document Purpose

This document evaluates alternatives to sealed-bid auctions in case timelock encryption technology (drand-based tlock) is not production-ready or encounters implementation challenges. We need a defensible auction format that:

1. **Allows fully public bids** throughout the auction window
2. **Maintains multi-unit uniform price clearing**
3. **Meets auction requirements** documented in auction-requirements.md
4. **Has real-world precedent** (preferably battle-tested on blockchain)

This analysis provides a fallback strategy if sealed-bid mechanisms prove impractical for launch.

---

## Table of Contents

### Part 1: Why This Matters
1. [Motivation: When Sealed Bids May Not Be Viable](#motivation-when-sealed-bids-may-not-be-viable)
2. [What We're Giving Up](#what-were-giving-up)
3. [What We Must Preserve](#what-we-must-preserve)

### Part 2: Public-Bid Format Enumeration
4. [Single-Round Public Auctions](#single-round-public-auctions)
5. [Multi-Round Ascending Price Auctions](#multi-round-ascending-price-auctions)
6. [Continuous Auction Windows](#continuous-auction-windows)
7. [Hybrid Mechanisms](#hybrid-mechanisms)
8. [Clinching Clock Auction (Ausubel Auction)](#clinching-clock-auction-ausubel-auction)

### Part 3: Real-World Analysis
8. [Blockchain Implementations](#blockchain-implementations)
9. [Traditional Finance Precedents](#traditional-finance-precedents)
10. [Successes and Failures](#successes-and-failures)

### Part 4: Evaluation
11. [Requirement Scorecard](#requirement-scorecard)
12. [Attack Surface Analysis](#attack-surface-analysis)
13. [Seller Protection: The Undersubscription Problem](#seller-protection-the-undersubscription-problem)
14. [Recommendation](#recommendation)

---

# Part 1: Why This Matters

## Motivation: When Sealed Bids May Not Be Viable

### Technical Risks with Timelock Encryption

**Drand Dependency**:
- Reliance on external randomness beacon (League of Entropy)
- Single point of failure if drand network unavailable
- Delayed decryption if threshold signatures delayed
- No mature fallback if drand becomes unreliable

**Implementation Complexity**:
- IBE (Identity-Based Encryption) cryptography less battle-tested than standard primitives
- Limited auditor familiarity with tlock schemes
- Potential bugs in encryption/decryption implementation
- Gas costs for on-chain decryption verification

**Cryptographic Assumptions**:
- Newer cryptographic scheme compared to standard ECDSA/EdDSA
- Smaller security research community scrutinizing tlock
- Potential unknown vulnerabilities in IBE constructions
- Standards not as mature as traditional public key crypto

### Operational Concerns

**User Experience**:
- Encrypted bids harder to debug (can't verify bid contents until reveal)
- Wallet support may be limited for IBE encryption
- Education burden: users must understand timelock concept
- Error recovery more complex (can't cancel/modify encrypted bids easily)

**Auditor Concerns**:
- Security audits more expensive (specialized cryptography knowledge)
- Longer audit timelines (unfamiliar with IBE)
- Higher perceived risk may delay partnerships or integrations
- Regulatory uncertainty around novel cryptography

### Strategic Considerations

**Time-to-Market**:
- Sealed bids add 3-6 months development time
- Testing and auditing more extensive
- May delay launch versus simpler public-bid mechanism
- Competitive pressure to launch faster

**Iterative Development**:
- Start with simpler public-bid mechanism
- Prove product-market fit first
- Add sealed bids in v2 once economic model validated
- De-risk cryptographic complexity

**Regulatory Clarity**:
- Public bids easier to audit for regulators
- Transparent price formation may be preferred in some jurisdictions
- Sealed bids may face scrutiny (hidden information)
- Start conservative, add privacy later

---

## What We're Giving Up

### Privacy During Auction

**Information Leakage**:
- All bids visible in mempool before confirmation
- Competitors can observe bidding strategies
- Late bidders have information advantage (see early bids)
- Bidder identity visible (address-based)

**Strategic Implications**:
- Winner's curse amplified (more information asymmetry)
- Timing games possible (submit bid right before close)
- Potential for bid sniping attacks
- Copycat bidding (follow-the-leader behavior)

### MEV Protection

**Front-Running Vulnerability**:
- Validators/searchers can see pending bids
- Can submit competing bids ahead in block ordering
- Transaction reordering attacks possible within block
- Sandwich attacks (bid before and after victim)

**Mitigation Difficulty**:
- Cannot prevent mempool visibility (fundamental blockchain property)
- Cannot prevent intra-block reordering (validator control)
- Economic incentives for MEV extraction remain

### Fair Information Structure

**Asymmetric Information**:
- Early bidders reveal strategies first (disadvantage)
- Late bidders observe all previous bids (advantage)
- Timing of bid submission becomes strategically important
- Creates information cascade effects

**Coordination Risk**:
- Visible bids enable tacit collusion (observe competitors not bidding high)
- Easier to maintain cartel (can verify compliance)
- Harder to defect unnoticed

---

## What We Must Preserve

### Critical Requirements (Non-Negotiable)

From auction-requirements.md, these requirements are essential regardless of bid visibility:

**R7: No Bid Lowering (Increase-Only Rule)**:
- Must prevent last-minute bid reduction
- Enforced via smart contract state transitions
- Critical for preventing clearing price collapse
- **Status**: Can be preserved in public-bid format ✓

**R8: Capital Efficiency**:
- Active bidder deployment (not passive pools)
- Capital only locked when clearing specific auction
- **Status**: Independent of bid visibility ✓

**R12: Sustainable Bidder Compensation**:
- Self-sustaining through bid-ask spreads
- No external subsidies required
- **Status**: Independent of bid visibility ✓

**Uniform Price Clearing**:
- All winners pay same clearing price
- Multi-unit allocation
- **Status**: Independent of bid visibility ✓

### Important Requirements (Degraded but Manageable)

**R4: MEV Resistance**:
- **Sealed bids**: Excellent (transaction ordering irrelevant, bids hidden)
- **Public bids**: Poor (front-running possible, mempool visible)
- **Mitigation**: Batch clearing still makes ordering less relevant; accept degradation

**R11: Fair Execution**:
- **Sealed bids**: Excellent (symmetric information)
- **Public bids**: Moderate (late bidders advantage)
- **Mitigation**: Increase-only rule + uniform price partially compensates

**R6: Collusion Resistance**:
- **Sealed bids**: Excellent (cannot verify cartel compliance)
- **Public bids**: Moderate (can observe competitors' bids)
- **Mitigation**: Open entry + defection incentives still present

### What We're Willing to Accept

**Degraded Privacy**: Accept that bids are public; focus on other defenses

**Some MEV Leakage**: Accept front-running risk; mitigate through batch clearing

**Information Asymmetry**: Accept late bidder advantage; mitigate through auction design

**Higher Bid Shading**: Accept more strategic bidding; ensure competition keeps it limited

---

# Part 2: Public-Bid Format Enumeration

## Single-Round Public Auctions

### Format 1: Simple Batch Auction (Gnosis Auction Style)

**Mechanism**:
1. Fixed auction window (e.g., 4 hours: 08:00-12:00 UTC)
2. Bidders submit bids anytime during window
3. All bids visible on-chain as submitted
4. At close (12:00), compute uniform clearing price
5. Atomic settlement at clearing price

**Bid Structure**:
```
Submit: (quantity, price_per_unit, bidder_address)
Example: (50 ETH, $2000/ETH, 0x123...)
```

**Clearing Algorithm**:
```
1. Collect all bids: [(q₁,p₁), (q₂,p₂), ..., (qₙ,pₙ)]
2. Sort by price descending: highest bids first
3. Aggregate quantity until supply met
4. Clearing price = lowest accepted bid
5. All winners pay clearing price
```

**Characteristics**:
- **Simplicity**: Very simple to implement and understand
- **Transparency**: All information public throughout
- **Finality**: Single round, fast execution
- **MEV**: Vulnerable (mempool visibility)

**Example**:
```
Auction: 100 ETH available
Bids submitted over 4 hours:
- 08:15: Alice bids 40 ETH @ $2,000
- 09:30: Bob bids 30 ETH @ $1,980
- 11:45: Carol bids 40 ETH @ $1,950

At 12:00:
- Total bids: 110 ETH (over-subscribed)
- Sort: Alice ($2,000), Bob ($1,980), Carol ($1,950)
- Cumulative: 40, 70, 110 ETH
- Clearing price: $1,950 (Carol's bid marginal)
- All pay $1,950 per ETH
```

**Attack Surface**:
- **Bid sniping**: Carol waited until 11:45 to see Alice and Bob's bids
- **Front-running**: Validator could see Carol's pending bid, submit $1,949 ahead
- **Timing games**: Strategic advantage to bidding late

**Mitigations**:
- **Increase-only rule**: Cannot lower bid after submission
- **Uniform price**: Late bidders don't pay more (everyone pays marginal)
- **Batch clearing**: Transaction ordering within block less relevant

**Real-World Example**: Gnosis Auction (EasyAuction)
- Used for token launches, liquidations
- Live on Ethereum mainnet since 2021
- Hundreds of successful auctions
- Public bids throughout window

**Verdict**: **Viable** - Simplest public-bid alternative

---

### Format 2: Gnosis Auction with Minimum Commitment

**Enhancement to Format 1**:
Add minimum bid commitment to reduce late sniping

**Mechanism**:
- Bidders submit initial commitment (hash of minimum bid)
- Can increase bid during auction
- Cannot bid below committed minimum
- Reduces information advantage of late bidding

**Commitment Structure**:
```
t=0: Submit commitment: hash(min_price, nonce)
t=0-close: Can submit actual bid >= min_price
Close: Verify actual bid >= committed minimum
```

**Example**:
```
Alice commits: hash($1,900, salt) at t=0
During auction: Can bid $1,900, $2,000, $2,100... (any price >= $1,900)
Cannot bid: $1,800 (below commitment)
```

**Benefit**:
- Early bidders reveal less information (only minimum)
- Late bidders less advantaged (don't know exact early bids)
- Still public (commitments visible) but some uncertainty

**Drawback**:
- Added complexity (commit-reveal scheme)
- Griefing risk (commit but don't reveal → auction fails)
- Gas costs (two transactions per bidder)

**Verdict**: **Viable but complex** - Marginal improvement over Format 1

---

## Multi-Round Ascending Price Auctions

### Format 3: Simultaneous Multiple Round (FCC Spectrum Style)

**Mechanism**:
Based on FCC spectrum auctions (SMRA - Simultaneous Multiple Round Auction)

**Structure**:
1. **Round 1**: All bidders submit initial bids at minimum price
2. **Round 2**: See results of Round 1; can increase bids
3. **Round 3**: See results of Round 2; can increase bids
4. **Continue**: Until no new bids in a round
5. **Final**: Uniform clearing price from last round

**Round Structure**:
```
Round N:
- Duration: 30 minutes
- Bidders see all previous round results
- Can increase bids or stand pat
- Cannot decrease bids (increase-only rule)
- Round closes, results published
- Wait period (10 min) before next round

Termination:
- If no new bids in Round N → auction ends
- Clearing price = current marginal bid
- All winners from last round pay clearing price
```

**Information Revelation**:
- **After Round 1**: All initial bids public
- **After Round 2**: All increases public
- **Progressive transparency**: Full information develops over rounds

**Example**:
```
100 ETH auction, 3 rounds:

Round 1 (09:00-09:30):
- Alice: 40 ETH @ $1,900
- Bob: 30 ETH @ $1,900 (minimum)
- Carol: 40 ETH @ $1,900
- → 110 ETH bid, clearing at $1,900

Round 2 (09:40-10:10):
- Alice: 40 ETH @ $1,950 (raised)
- Bob: 30 ETH @ $1,900 (stand pat)
- Carol: 40 ETH @ $1,920 (raised)
- → 110 ETH bid, clearing at $1,920

Round 3 (10:20-10:50):
- Alice: 40 ETH @ $1,950 (stand pat)
- Bob: 30 ETH @ $1,900 (stand pat)
- Carol: 40 ETH @ $1,920 (stand pat)
- → No new bids, auction ends
- Final clearing price: $1,920
```

**Characteristics**:
- **Price discovery**: Excellent (competitive bidding across rounds)
- **Information aggregation**: Strong (see competitor responses)
- **Complexity**: High (multiple rounds, timing coordination)
- **Duration**: Long (hours to days for multiple rounds)

**Attack Surface**:
- **Jump bidding**: Aggressive early bids to signal strength
- **Retaliatory bidding**: Punish defectors from tacit collusion
- **Demand reduction**: Reveal willingness to pay slowly across rounds
- **Sniping in final round**: Last round = high stakes

**Mitigations**:
- **Activity rules**: Must bid minimum percentage each round (prevents free-riding)
- **Withdrawal penalties**: Cannot withdraw bids from prior rounds
- **Round timing**: Sufficient time between rounds to prevent snap decisions

**Real-World Examples**:
- **FCC Spectrum Auctions**: Hundreds of billions in value allocated
- **EU Spectrum Auctions**: Used across European countries
- **Treasury Auctions (historical)**: Multi-round format before switching to single-round

**Verdict**: **Viable but complex** - Best price discovery, high coordination cost

---

### Format 4: Dutch Auction (Descending Price)

**Mechanism**:
Price starts high, descends until supply met

**Structure**:
1. Auction starts at high price (e.g., $3,000/ETH)
2. Price decreases continuously or in discrete steps
3. Bidders submit quantity wanted at current price
4. When total quantity bid ≥ supply → auction closes
5. All winners pay the clearing price (price when auction closed)

**Price Descent**:
```
t=0: Price = $3,000 (no bids)
t=1min: Price = $2,950 (no bids)
t=2min: Price = $2,900 (no bids)
...
t=10min: Price = $2,000 (50 ETH bid)
t=11min: Price = $1,980 (30 ETH bid, total 80)
t=12min: Price = $1,960 (40 ETH bid, total 120)
→ Supply met (100 ETH), auction closes
→ Clearing price: $1,960
→ All winners pay $1,960
```

**Characteristics**:
- **Speed**: Can be very fast (minutes)
- **Simplicity**: Single dimension (time/price)
- **No strategic bidding**: Optimal to bid at true valuation
- **Price discovery**: Moderate (one-shot, no iteration)

**Attack Surface**:
- **Sniping**: Wait until last moment to bid at lowest price
- **Coordination**: Multiple bidders wait, then rush → chaotic
- **Gas wars**: If price drops fast, bidders race to submit → MEV
- **Timing precision**: Network latency creates unfair advantages

**Mitigations**:
- **Slow descent**: Gradual price drops reduce timing pressure
- **Minimum duration**: Auction must last at least X minutes
- **Price steps**: Discrete steps (not continuous) reduce precision gaming

**Real-World Examples**:
- **Minter Network**: NFT Dutch auctions on Ethereum
- **Foundation**: NFT marketplace Dutch auctions
- **Seaport (OpenSea)**: Supports Dutch auction format

**Challenges on Blockchain**:
- Network latency varies (unfair advantages)
- Gas price spikes at critical moments
- Hard to coordinate "when did auction actually close?"

**Verdict**: **Viable but timing-sensitive** - Fast but gaming-prone

---

## Continuous Auction Windows

### Format 5: Continuous Batch with Periodic Clearing

**Mechanism**:
Continuous order submission with periodic batch clearing (CoW Swap style)

**Structure**:
1. **Continuous submission**: Bids accepted 24/7
2. **Periodic clearing**: Every X hours (e.g., every 6 hours)
3. **Batch execution**: All bids since last clearing execute at uniform price
4. **Rolling window**: New bids accumulate for next batch

**Clearing Schedule**:
```
00:00 UTC: Clear batch 1 (bids from 18:00-00:00)
06:00 UTC: Clear batch 2 (bids from 00:00-06:00)
12:00 UTC: Clear batch 3 (bids from 06:00-12:00)
18:00 UTC: Clear batch 4 (bids from 12:00-18:00)
Repeat...
```

**Batch Clearing**:
```
Batch at 12:00 clears bids from 06:00-12:00:
- Alice (06:30): 40 ETH @ $2,000
- Bob (08:15): 30 ETH @ $1,980
- Carol (11:45): 40 ETH @ $1,950
→ Uniform price clearing at 12:00
→ All pay $1,950
```

**Characteristics**:
- **Flexibility**: Users can submit anytime (not wait for specific auction)
- **Frequency**: Multiple clearings per day
- **Liquidity fragmentation**: Splits volume across multiple batches
- **Complexity**: Must manage overlapping time windows

**Attack Surface**:
- **Batch timing prediction**: Know when batch clears → time bids accordingly
- **Cross-batch gaming**: Submit to batch with less competition
- **Last-minute sniping**: Submit right before batch close

**Mitigations**:
- **Randomized clearing times**: Unpredictable exactly when batch clears
- **Minimum batch size**: Only clear if sufficient volume
- **Increase-only**: Cannot lower bids across batches

**Real-World Examples**:
- **CoW Swap**: Batch auctions every few minutes
- **UniswapX**: Periodic batch settlement
- **1inch Fusion**: Batch execution model

**Verdict**: **Viable for high-frequency** - Good for frequent trading, complex coordination

---

### Format 6: Hybrid: Continuous + Daily Batch Anchor

**Mechanism**:
Combine continuous small batches with one large daily anchor auction

**Structure**:
1. **Continuous mini-batches**: Every 1-2 hours for small volume
2. **Daily anchor auction**: One large batch at 12:00 UTC
3. **Differential pricing**: Anchor auction gets best prices (most liquidity)
4. **Routing logic**: Large orders → anchor; small orders → mini-batches

**Rationale**:
- Anchor auction concentrates liquidity (like Atomica's current design)
- Mini-batches provide flexibility for time-sensitive trades
- Price discovery happens primarily in anchor auction
- Mini-batches follow anchor pricing

**Example Schedule**:
```
00:00 - 12:00: Mini-batches every 2 hours (6 batches)
12:00: ANCHOR AUCTION (majority of volume)
12:00 - 24:00: Mini-batches every 2 hours (6 batches)

Volume distribution:
- Anchor: 70% of daily volume
- Mini-batches: 30% total (5% each)
```

**Characteristics**:
- **Best of both**: Liquidity concentration + flexibility
- **Complexity**: High (manage multiple auction types)
- **User choice**: Route based on size/urgency
- **Price discovery**: Focused on anchor auction

**Attack Surface**:
- **Arbitrage**: Between mini-batches and anchor
- **Strategic routing**: Game the routing logic
- **Complexity**: More mechanisms = more attack surface

**Mitigations**:
- **Clear routing rules**: Transparent which orders go where
- **Price references**: Mini-batches use anchor price as reference
- **Minimum sizes**: Large orders must use anchor

**Real-World Examples**:
- **Stock exchanges**: Opening/closing auctions + continuous trading
- **Electricity markets**: Day-ahead auction + intraday continuous

**Verdict**: **Viable for mature markets** - Complex but proven in TradFi

---

## Hybrid Mechanisms

### Format 7: Public Bids with Delayed Revelation

**Mechanism**:
Bids submitted publicly but with information obfuscation until close

**Structure**:
1. Bidders submit encrypted bids (not sealed, just obfuscated)
2. Encryption key shared among bidders (not block producers)
3. At close, all bidders share keys → bids revealed
4. No automatic decryption (requires participation)

**Example**:
```
Alice encrypts bid with key K_alice
Bob encrypts bid with key K_bob
Carol encrypts bid with key K_carol

At close:
- Alice reveals K_alice
- Bob reveals K_bob
- Carol reveals K_carol
→ All bids decrypt, clearing price computed
```

**Benefits**:
- Bids hidden from validators/searchers (MEV reduction)
- Bids hidden from competitors during auction
- Simpler than full timelock (standard encryption)

**Drawbacks**:
- **Griefing**: If any bidder refuses to reveal key → auction fails
- **Coordination**: Requires all bidders to reveal (liveness assumption)
- **Collusion**: Bidders could share keys early (defeats purpose)
- **Complexity**: Still requires cryptography, key management

**Mitigations**:
- **Penalties**: Slash deposit if fail to reveal key
- **Threshold encryption**: Need only M of N bidders to reveal
- **Timeout fallback**: If no reveal after X time, use public bids

**Verdict**: **Not recommended** - Griefing risk too high, complexity similar to timelock

---

### Format 8: Commit-Reveal with Public Fallback

**Mechanism**:
Try commit-reveal; if fails, fall back to public bids from commitments

**Structure**:
1. **Commit phase** (08:00-10:00): Bidders submit hash(bid, nonce)
2. **Reveal phase** (10:00-12:00): Bidders reveal actual bids
3. **Fallback** (12:00): If <X% reveal, use committed minimums as bids

**Fallback Logic**:
```
If reveal rate < 80%:
- Use commitment hashes as "minimum bids"
- Assume committed bids = minimum price
- Clear auction with partial information
- Penalize non-revealers (forfeit deposits)

If reveal rate >= 80%:
- Use revealed bids normally
- Uniform clearing price
- Non-revealers forfeit but don't block auction
```

**Benefits**:
- Attempts privacy (commit-reveal)
- Falls back gracefully if griefing attempted
- Auction always clears (never fails)

**Drawbacks**:
- Fallback prices may be inaccurate (using minimums)
- Complex logic (two mechanisms in one)
- Griefing still possible (force fallback mode)

**Verdict**: **Interesting but complex** - Graceful degradation nice, but added complexity

---

## Clinching Clock Auction (Ausubel Auction)

### Format 9: Ascending Clock with Clinching (Truthful Multi-Unit Auction)

**Mechanism**: Dynamic ascending-price auction where units are "clinched" (allocated) during the auction at the price when clinching occurs.

**Theoretical Foundation** (Ausubel 2004):
- Dynamic auction that achieves Vickrey outcome (truthful bidding)
- Items awarded when "clinched" (mathematically guaranteed to win)
- Price paid = clock price at time of clinching (not final price)
- **Key property**: Truthful bidding is dominant strategy equilibrium

---

### How Clinching Works

**Basic Concept**:

A bidder "clinches" units when their opponents' aggregate demand becomes less than available supply.

**Example**:
```
Auction: 100 ETH supply
Three bidders: Alice, Bob, Carol

Round 1 (Price = $1,800):
- Alice demands: 50 ETH
- Bob demands: 40 ETH
- Carol demands: 30 ETH
- Total demand: 120 ETH > 100 supply
- No clinching yet (over-subscribed)

Round 2 (Price = $1,900):
- Alice demands: 50 ETH (same)
- Bob demands: 30 ETH (reduced from 40)
- Carol demands: 20 ETH (reduced from 30)
- Total demand: 100 ETH = 100 supply
- Alice clinches 0 units (opponents demand 50, supply - 50 = 50 available)
- Bob clinches 0 units (opponents demand 70, supply - 70 = 30 available)
- Carol clinches 0 units (opponents demand 80, supply - 80 = 20 available)

Round 3 (Price = $2,000):
- Alice demands: 50 ETH (same)
- Bob demands: 25 ETH (reduced from 30)
- Carol demands: 15 ETH (reduced from 20)
- Total demand: 90 ETH < 100 supply
- Alice clinches 10 units at $2,000
  → Opponents demand 40 total
  → Supply 100 - 40 = 60 available for Alice
  → Alice previously clinched 0, now guaranteed 60
  → Clinch: min(50 demand, 60 guaranteed) - 0 previous = 10 units at $2,000
- Bob clinches 0 (no increase in guarantee)
- Carol clinches 0 (no increase in guarantee)

Round 4 (Price = $2,100):
- Alice demands: 45 ETH (reduced)
- Bob demands: 20 ETH (reduced)
- Carol demands: 10 ETH (reduced)
- Total demand: 75 ETH < 100 supply
- Alice clinches additional 5 units at $2,100
  → Opponents demand 30
  → Guaranteed: 100 - 30 = 70
  → Clinch: min(45, 70) - 10 previous = 35 new total, +25 clinched at $2,100
- Bob clinches 5 units at $2,100
  → Opponents demand 55
  → Guaranteed: 100 - 55 = 45
  → Clinch: min(20, 45) - 0 = 20 units at $2,100
- Etc...

Auction ends when total demand ≤ supply
Final allocation: Sum of clinched units + remaining at final price
Payment: Sum of (clinched units × clinching price) for each round
```

**Clinching Formula**:
```
Clinch_i(round) = max(0,
                      min(D_i(round), S - D_-i(round)) - Clinched_i(previous)
                     )

Where:
- D_i = Bidder i's current demand
- S = Total supply
- D_-i = Sum of all OTHER bidders' demands
- Clinched_i(previous) = Units already clinched by bidder i
```

---

### Key Properties

**1. Truthful Bidding (Dominant Strategy)**:
- Bidding true valuation is optimal regardless of others' strategies
- No incentive for demand reduction (unlike uniform price auction)
- Equivalent outcome to sealed-bid Vickrey auction

**2. Pay-As-You-Clinch (Not Uniform Price)**:
- Different bidders may pay different prices
- Each bidder pays based on when they clinched units
- **NOT uniform clearing price** - this is discriminatory pricing by timing

**3. Dynamic Price Discovery**:
- Price ascends in discrete rounds
- Bidders can reduce demand as price rises
- Auction ends when demand ≤ supply

**4. Privacy Preservation**:
- Bidders only reveal demand at current price (not full demand curve)
- More private than sealed-bid revelation of entire demand function
- But still reveals information dynamically (public bids each round)

---

### Blockchain Implementation Challenges

**Gas Costs (SEVERE)**:
```
Per round, per bidder:
- Submit new demand quantity: 1 transaction
- Contract computes clinching: Gas intensive (iterate all bidders)
- Emit clinching events: Log storage

Example:
- 10 bidders
- 5 rounds to clear
- Total: 50 bid transactions + 5 clearing computations
- Gas cost: ~10-50x simple batch auction
```

**Timing Coordination**:
```
Round structure:
- Round N opens: 10 minutes for bids
- Round N closes: Compute clinching
- Round N+1 opens: Next price level
- Repeat until convergence

Total duration: Unpredictable (depends on bidder behavior)
Minimum: 30-60 minutes (5-10 rounds × 5-10 min each)
Maximum: Hours to days if slow convergence
```

**State Complexity**:
```solidity
contract ClinchingClockAuction {
    struct BidderState {
        uint256 currentDemand;
        uint256 totalClinched;
        mapping(uint256 => uint256) clinchedPerRound; // round => quantity
        mapping(uint256 => uint256) pricePerRound;    // round => price paid
    }

    mapping(address => BidderState) bidders;
    uint256 currentPrice;
    uint256 currentRound;
    uint256 totalSupply;

    // Must track complex state across rounds
    // High storage costs
}
```

---

### Seller Protection Analysis

**Positive: Ascending Price Floor**:
- Price starts low and rises
- Sellers benefit from competitive bidding pushing price up
- Auction doesn't clear below market if bidders active

**Negative: No Explicit Reserve Prices**:
- Standard clinching auction has no seller reserves
- If under-subscribed at low price → clears at low price
- Sellers vulnerable if insufficient bidder participation

**Example (Undersubscription)**:
```
100 ETH supply, weak demand:

Round 1 ($1,500): Total demand 30 ETH < 100 supply
→ All 30 ETH clinches immediately at $1,500
→ Auction ends (demand met)
→ Sellers get $1,500 (vs $2,000 market)
→ 70 ETH unsold (sellers keep but wasted time)
```

**Adaptation: Add Seller Reserves**:
```
Enhanced clinching with seller reserves:

1. Sellers commit reserve prices (commit-reveal)
2. Clinching happens only if clock price ≥ seller reserve
3. Units below reserve don't participate until price exceeds reserve
4. Progressive entry of supply as price rises
```

**Example (With Reserves)**:
```
100 ETH total:
- Seller A: 40 ETH, reserve $1,800
- Seller B: 30 ETH, reserve $1,850
- Seller C: 30 ETH, reserve $1,900

Round 1 ($1,500): No supply available (all below reserve)
Round 2 ($1,800): 40 ETH available (Seller A)
Round 3 ($1,850): 70 ETH available (A + B)
Round 4 ($1,900): 100 ETH available (A + B + C)

Progressive supply entry protects sellers
Auction clears only if price reaches reserves
```

---

### Comparison to Other Formats

| Dimension | Clinching Clock | Uniform Price Batch | Sealed Bid Uniform |
|-----------|----------------|---------------------|-------------------|
| **Truthful Bidding** | ✓✓ Dominant strategy | ✗ Demand reduction | ✓✓ Dominant strategy (Vickrey) |
| **Price Uniformity** | ✗ Discriminatory (by timing) | ✓✓ Uniform | ✓✓ Uniform |
| **Simplicity** | ✗ Complex (multi-round) | ✓✓ Simple (one round) | ✓ Moderate |
| **Gas Efficiency** | ✗ Very poor (multiple rounds) | ✓✓ Excellent (one round) | ✓ Good |
| **Duration** | ✗ Long (30min - hours) | ✓✓ Fast (4 hours total) | ✓✓ Fast |
| **Privacy** | ✗ Public (bids each round) | ✗ Public | ✓✓ Sealed |
| **MEV Resistance** | ✗ Poor (public, multi-round) | ✗ Poor | ✓✓ Excellent |
| **Seller Protection** | ⚠ Needs reserves | ⚠ Needs reserves | ✓ Better (hidden demand) |
| **Implementation Complexity** | ✗ Very high | ✓ Low | ✓ Moderate |
| **Blockchain Precedent** | ✗ None | ✓ Gnosis Auction | ✗ None (drand novel) |

---

### Adaptations for Atomica: Enhanced Clinching with Seller Reserves

**Design: Two-Sided Clinching Clock Auction**

Combine clinching mechanism with seller reserve prices for protection.

**Mechanism**:

**Phase 1: Seller Commitment (Before Auction)**
```
Sellers commit:
- Quantity available
- Reserve price (hashed)
- Lock assets in escrow
```

**Phase 2: Ascending Clock Auction**
```
Round N:
1. Auctioneer announces price P_N
2. Determine available supply at P_N:
   S_available(P_N) = sum of quantities where reserve ≤ P_N
3. Bidders submit demand D_i at price P_N
4. Compute clinching:
   - For each bidder i:
     - Available after opponents: S_available - D_-i
     - Clinched this round: max(0, min(D_i, S_available - D_-i) - Previous_clinched_i)
   - Record: Clinch_i[round] = quantity, price P_N
5. If total demand ≤ S_available: END
6. Else: Increment price, continue to Round N+1
```

**Phase 3: Settlement**
```
For each bidder:
  Payment = sum over rounds (Clinched[round] × Price[round])

For each seller:
  If clearing price ≥ reserve:
    Execute sale at weighted average of clinching prices
  Else:
    Return assets (no penalty - price didn't reach reserve)
```

**Example**:
```
Sellers:
- Alice: 40 ETH @ $1,800 reserve
- Bob: 30 ETH @ $1,900 reserve
- Carol: 30 ETH @ $2,000 reserve

Round 1 ($1,700):
- Available supply: 0 (all below reserve)
- Bidders demand any amount: No clinching (no supply)

Round 2 ($1,800):
- Available supply: 40 ETH (Alice enters)
- Bidder X demands: 50 ETH
- Bidder Y demands: 20 ETH
- Total: 70 > 40 → No clinching (over-subscribed)

Round 3 ($1,900):
- Available supply: 70 ETH (Alice + Bob)
- Bidder X demands: 50 ETH
- Bidder Y demands: 15 ETH
- Total: 65 < 70 → Clinching happens
  - Bidder X clinches: min(50, 70-15) - 0 = 50 units at $1,900
  - Bidder Y clinches: min(15, 70-50) - 0 = 15 units at $1,900
- Auction ends (demand met)

Result:
- Alice sells 40 ETH at $1,900 (above $1,800 reserve ✓)
- Bob sells 25 ETH at $1,900 (above $1,900 reserve ✓)
- Carol doesn't sell (price never reached $2,000 reserve)
- Bidder X pays: 50 × $1,900 = $95,000
- Bidder Y pays: 15 × $1,900 = $28,500
```

---

### Advantages for Seller Protection

**1. Ascending Price Inherent Protection**:
- Price rises until demand met
- Competitive bidding naturally drives price up
- Sellers benefit from price discovery

**2. Truthful Bidding Reduces Exploitation**:
- Bidders have no incentive to shade bids
- Demand reduction eliminated
- Better price discovery than uniform price auction

**3. Progressive Supply Entry with Reserves**:
- Low-reserve sellers enter first (most eager)
- High-reserve sellers enter only if price justifies
- Natural filtering mechanism

**4. No Penalty Needed**:
- If price doesn't reach reserve → seller just doesn't sell
- No rejection penalty (unlike commit-reveal batch auction)
- Seller downside: Wasted time, but no financial penalty

**5. Dynamic Exit**:
- Sellers can increase reserves between rounds (if mechanism allows)
- Adaptive protection as auction progresses

---

### Disadvantages for Atomica

**1. Extreme Gas Costs**:
```
Conservative estimate:
- 10 bidders
- 5 rounds average
- 50 bid transactions (~200K gas each) = 10M gas
- 5 clinching computations (~500K gas each) = 2.5M gas
- Total: ~12.5M gas

At 50 gwei, $3,000 ETH: ~$1,900 in gas
vs. Simple batch: ~500K gas = ~$75 in gas

25x more expensive
```

**2. Long Duration**:
- 5-10 rounds × 10 min/round = 50-100 minutes minimum
- Unpredictable end time (depends on convergence)
- Much slower than 4-hour simple batch window

**3. Complexity**:
- Bidders must understand clinching mechanism
- Not intuitive (most users unfamiliar)
- Higher learning curve than "submit bid, see result"

**4. State Bloat**:
- Must track clinching history per bidder per round
- High storage costs on-chain
- More expensive to audit and verify

**5. No Blockchain Precedent**:
- No production clinching auction on Ethereum/any chain
- Untested in adversarial environment
- Higher risk than proven mechanisms

**6. Public Bids Still Visible**:
- Each round, bids are public (MEV vulnerable)
- Late round bids can be front-run
- Doesn't solve information asymmetry problem

**7. Multi-Round Griefing**:
- Malicious bidders can bid high early rounds → force prices up
- Then drop demand in later rounds → waste everyone's time
- Gas griefing attack vector

---

### Evaluation Against Requirements

| Requirement | Clinching Clock | Score vs Simple Batch | Score vs Sealed Bids |
|-------------|----------------|----------------------|---------------------|
| **R1: Truthful Bidding** | ✓✓ Dominant strategy | Better | Equal |
| **R2: Info Aggregation** | ✓✓ Excellent (iterative) | Better | Better |
| **R3: Manipulation Resistance** | ✓ Good (truthful) | Better | Worse (public) |
| **R4: MEV Resistance** | ✗ Poor (public multi-round) | Same | Much worse |
| **R5: Sybil Neutrality** | ✓✓ Excellent | Same | Same |
| **R6: Collusion Resistance** | ✓ Good (truthful) | Better | Worse (public) |
| **R7: No Bid Lowering** | ✓✓ Enforced (demand only decreases) | Same | Same |
| **R8: Capital Efficiency** | ✓✓ High | Same | Same |
| **R9: Allocative Efficiency** | ✓✓✓ Perfect (Vickrey) | Better | Equal |
| **R10: Liquidity Concentration** | ✓✓ Single auction | Same | Same |
| **R11: Fair Execution** | ✓✓ Excellent (truthful) | Better | Worse (public) |
| **R12: Sustainable Compensation** | ✓✓ Self-sustaining | Same | Same |
| **R13: Seller Protection** | ✓✓ With reserves | Better (ascending) | Worse (public demand) |
| **Gas Efficiency** | ✗✗ Terrible (25x cost) | Much worse | Worse |
| **Duration** | ✗ Long (50-100 min unpredictable) | Worse | Same |
| **Complexity** | ✗✗ Very high | Much worse | Worse |
| **Blockchain Precedent** | ✗✗ None | Worse | Same (none) |

**Overall Assessment**:
- **Theoretically superior**: Truthful bidding, perfect efficiency
- **Practically inferior**: Gas costs, complexity, duration prohibitive
- **Seller protection**: Better than simple batch (ascending price), worse than sealed bids (public demand)

---

### Verdict: Clinching Clock Auction for Atomica

**Not Recommended for Primary Mechanism**

**Reasons**:

**1. Gas Costs Prohibitive** (Disqualifying):
- 25x more expensive than simple batch
- ~$2,000 in gas per auction at current Ethereum prices
- Unsustainable for daily recurring auctions

**2. No Blockchain Precedent** (High Risk):
- Never implemented in production on any blockchain
- Untested in adversarial environment
- Likely hidden complexities or attacks

**3. User Complexity** (Adoption Barrier):
- Clinching mechanism non-intuitive
- Requires understanding dynamic auction
- Higher dropout rate than simple batch

**4. Duration Unpredictable** (UX Problem):
- Cannot guarantee auction end time
- Users don't know when to check results
- Worse than fixed 4-hour window

**5. Still Has Public Bid Problem** (Core Issue):
- Each round reveals bids publicly
- MEV vulnerable (worse than single-round)
- Doesn't solve information asymmetry

**Theoretical Advantages Don't Justify Practical Costs**:
- Truthful bidding nice, but not worth 25x gas
- Perfect efficiency nice, but simple batch "good enough"
- Ascending price protection nice, but reserves achieve same goal

---

### Possible Future Consideration

**When Clinching Clock Might Make Sense**:

**1. Layer 2 with Cheap Gas**:
- zkRollup or Optimistic Rollup
- Gas costs 1/100th of L1
- 25x penalty becomes negligible

**2. Very High-Value Auctions**:
- $100M+ auction size
- $2K gas cost irrelevant
- Perfect efficiency worth the cost

**3. Institutional Participants Only**:
- Sophisticated bidders understand mechanism
- Willing to pay gas for better execution
- Not retail-facing

**4. Hybrid: Clinching for Large, Batch for Small**:
- Route >$10M orders to clinching auction
- Route <$10M to simple batch
- Complexity justified for whale trades

**Not Recommended for Launch**: Too experimental, too expensive, too complex for bootstrapping phase.

---

# Part 3: Real-World Analysis

## Blockchain Implementations

### Gnosis Auction (EasyAuction)

**Format**: Single-round batch auction (Format 1)

**Mechanism**:
- Public bids throughout auction window
- Uniform clearing price
- Used for token launches (IDOs), liquidations
- Deployed on Ethereum, Gnosis Chain

**Timeline**:
- **Launch**: 2021
- **Status**: Active as of 2024
- **Volume**: Hundreds of auctions, varied sizes

**Observed Performance**:

**Successes**:
- ✓ Successfully cleared hundreds of token auctions
- ✓ No major exploits or manipulation incidents reported
- ✓ Simple UX: easy to participate
- ✓ Gas efficient: single-round settlement
- ✓ Transparent: all bids publicly verifiable

**Challenges**:
- ⚠ Limited to token launches (not general-purpose trading)
- ⚠ Low-volume auctions susceptible to thin participation
- ⚠ Some UX issues: "stalling when entering order, data not auto-updating"
- ⚠ Price discovery less reliable for tokens with existing liquidity

**Manipulation Incidents**: None widely reported (as of 2024 search)

**Why It Works**:
- Token launches = unique use case (price discovery needed)
- One-time events (not repeated high-frequency trading)
- Participants expect volatility (less sensitive to MEV)
- Increase-only rule prevents bid lowering

**Takeaways for Atomica**:
- ✓ Format 1 (simple batch) is production-proven
- ✓ Public bids manageable for periodic auctions
- ⚠ Need sufficient participation for price discovery
- ⚠ Less suitable for high-frequency or low-latency use cases

---

### CoW Swap

**Format**: Continuous batch with solver competition (similar to Format 5)

**Mechanism**:
- Continuous order submission
- Batches cleared every few minutes (~5min)
- Solvers compete off-chain to fill orders
- Winner settlement executed on-chain
- Coincidence-of-wants matching + DEX liquidity

**Timeline**:
- **Launch**: 2021 (CowSwap v1)
- **Status**: Active, high volume as of 2024
- **Volume**: Top-tier DeFi protocol

**Observed Performance**:

**Successes**:
- ✓ MEV protection through batch settlement
- ✓ High volume sustained over years
- ✓ Competitive solver ecosystem (10+ solvers)
- ✓ Better prices than direct DEX routing (often)
- ✓ No major exploits

**Challenges**:
- ⚠ Solver centralization risk (winner-take-all dynamics)
- ⚠ Off-chain solver mechanism (trusted components)
- ⚠ Complex UX (users don't directly see bids, rely on solvers)
- ⚠ Not pure uniform price (combinatorial matching)

**Why It Works**:
- Solver competition provides liquidity
- Off-chain compute enables complex matching
- Frequent batches (5min) reduce latency
- Built on existing DEX liquidity (Uniswap, Balancer, etc.)

**Takeaways for Atomica**:
- ✓ Batch clearing works at scale
- ✓ Frequent batches reduce UX friction
- ⚠ Solvers add complexity (different trust model)
- ⚠ Not directly applicable (we're cross-chain, not DEX aggregation)

---

### Gnosis Protocol v1 (Deprecated, Historical)

**Format**: Ring trade batch auction

**Mechanism**:
- Submit orders to ring
- Solver computes optimal batch clearing
- Multi-token ring trades
- Uniform prices per token pair

**Timeline**:
- **Launch**: 2019
- **Status**: Deprecated, replaced by CoW Protocol v2 (2021)

**Why Deprecated**:
- Limited adoption (complex mechanism)
- Solver centralization
- UX complexity (users didn't understand ring trades)
- Better alternatives emerged (CowSwap simplified model)

**Takeaways**:
- ⚠ Over-complexity can kill adoption
- ⚠ Multi-token coordination harder than expected
- ✓ Batch auction core concept sound (survived into v2)

---

### Metaplex Auction (NFTs, Deprecated Original)

**Format**: English auction with extensions

**Mechanism**:
- Ascending price auction for NFTs
- Bid extension mechanism (anti-sniping)
- Single-item auctions

**Timeline**:
- **Launch**: 2021
- **Status**: Original contracts deprecated (2022+)
- **Replacement**: Metaplex Auction House

**Issues**:
- Smart contract bugs (auctions ended but funds not transferred)
- NFTs stuck in limbo (can't cancel or end)
- Poor UX for auction management
- Not multi-unit (single NFT auctions only)

**Why Deprecated**:
- Technical debt in original implementation
- Simpler fixed-price sales preferred by users
- Complexity vs adoption trade-off

**Takeaways**:
- ⚠ Smart contract quality critical (bugs kill trust)
- ⚠ Users prefer simplicity (fixed-price over auctions)
- Not applicable to Atomica (NFTs ≠ fungible token swaps)

---

## Traditional Finance Precedents

### US Treasury Auctions

**Format**: Single-round uniform price (since 1992)

**Mechanism**:
- Competitive bids: Bidders specify price and quantity
- Noncompetitive bids: Small investors buy at clearing price
- Uniform clearing price: Lowest accepted competitive bid
- All winners pay same price

**Bid Visibility**: Public after auction closes (not during)

**Timeline**:
- **Pre-1992**: Discriminatory (pay-as-bid)
- **1992**: Switched to uniform price for bonds
- **1998**: Extended to all Treasury securities
- **Status**: Active, billions weekly

**Observed Performance**:

**Successes** (post-1992):
- ✓ More aggressive bidding (narrower spreads)
- ✓ Broader distribution of awards (less concentration)
- ✓ Better price discovery (bids closer to valuations)
- ✓ Lower borrowing costs for government
- ✓ No major manipulation incidents

**Challenges**:
- Demand reduction by large bidders (theoretical, limited in practice)
- Primary dealer concentration (but competitive)

**Why It Works**:
- Known participants (primary dealer network)
- Reputation at stake (repeated interactions)
- Regulatory oversight (SEC, Treasury rules)
- Large volumes (competitive bidding)

**Difference from Blockchain**:
- ✗ Bids submitted through closed network (not public mempool)
- ✗ Known identities (KYC, primary dealer status)
- ✗ Legal recourse (manipulation = securities fraud)
- ✓ But: Uniform price mechanism transferable

**Takeaways**:
- ✓ Uniform price empirically superior to discriminatory
- ✓ Single-round auctions scalable to huge volumes
- ⚠ Need sufficient competition (primary dealers = 20+)
- ⚠ Blockchain lacks identity/reputation layer

---

### FCC Spectrum Auctions

**Format**: Simultaneous Multiple Round Ascending (SMRA) - Format 3

**Mechanism**:
- Multiple rounds over days/weeks
- All licenses auctioned simultaneously
- Ascending prices (bids increase each round)
- Uniform prices for similar licenses
- Activity rules (must bid certain % each round)

**Bid Visibility**: Public after each round

**Timeline**:
- **Launch**: 1994
- **Status**: Active, evolved into incentive auctions
- **Volume**: $100+ billion total allocated

**Observed Performance**:

**Successes**:
- ✓ Efficient allocation (licenses to highest bidders)
- ✓ Price discovery excellent (competitive bidding)
- ✓ Billions in revenue for government
- ✓ International adoption (EU, Asia, South America)

**Challenges**:
- ⚠ Bid signaling (tacit collusion through bid patterns)
- ⚠ Retaliatory bidding (punish defectors)
- ⚠ Complexity (weeks-long auctions, >100 rounds)
- ⚠ High barriers to entry (need expertise, capital)

**Why It Works**:
- High-value assets (billions at stake)
- Sophisticated bidders (telecom companies)
- Regulatory oversight (FCC monitors for collusion)
- Time for deliberation (rounds spaced over days)

**Adaptations**:
- Clock auctions (simplified pricing)
- Combinatorial auctions (package bidding)
- Incentive auctions (two-sided buy/sell)

**Takeaways**:
- ✓ Multi-round superior for complex high-value auctions
- ⚠ Complexity limits applicability (need simple for DeFi)
- ⚠ Collusion via signaling hard to prevent entirely
- ⚠ Not suitable for fast blockchain auctions (too slow)

---

### Stock Exchange Opening Auctions

**Format**: Single-round batch auction (Format 1 variant)

**Mechanism**:
- Orders accumulate before market open (e.g., NYSE 09:30)
- Batch clearing at opening
- Uniform price (all trades at opening price)
- Continuous trading follows

**Bid Visibility**:
- **Pre-open**: Order book visible (aggregated, not individual)
- **Indicative price**: Displayed in real-time
- **Opening**: All trades execute at single price

**Timeline**:
- **NYSE**: Since 1792 (modern electronic since 1990s)
- **NASDAQ**: Electronic opening cross since 2004
- **Status**: Daily occurrence, universal practice

**Observed Performance**:

**Successes**:
- ✓ Handles massive volume (billions daily)
- ✓ Price discovery excellent (opening price = fair)
- ✓ Low spreads (competitive bidding)
- ✓ Resistant to manipulation (high volume, monitoring)

**Challenges**:
- ⚠ Indicative price gaming (orders submitted/cancelled to move price)
- ⚠ Information leakage (order book visible → HFT advantage)
- ⚠ Requires market maker participation (specialists, DMMs)

**Why It Works**:
- Deep liquidity (millions of traders)
- Regulatory oversight (SEC, exchanges)
- Professional participants (institutions, MMs)
- Continuous market follows (price discovery ongoing)

**Difference from Blockchain**:
- ✗ Centralized exchange infrastructure
- ✗ Known participants (broker-dealers)
- ✓ But: Batch auction format transferable

**Takeaways**:
- ✓ Single-round batch works at massive scale
- ✓ Indicative pricing helps (but can be gamed)
- ⚠ Need deep liquidity for stability
- ⚠ Information leakage manageable with sufficient volume

---

## Successes and Failures

### What Has Succeeded on Blockchain

**Format 1: Simple Batch Auction**
- **Examples**: Gnosis Auction
- **Status**: ✓ Active, successful
- **Volumes**: Hundreds of auctions
- **Key Success Factors**:
  - Simplicity (easy to audit, understand)
  - Gas efficiency (single round)
  - Increase-only rule (prevents manipulation)
  - Suitable use case (token launches)

**Format 5: Continuous Batch (Solver-Based)**
- **Examples**: CoW Swap, 1inch Fusion
- **Status**: ✓ Active, high volume
- **Volumes**: Top-tier DeFi protocols
- **Key Success Factors**:
  - Solver competition (market-driven liquidity)
  - Frequent batches (low latency)
  - MEV protection (batch settlement)
  - Built on existing DEX liquidity

**Common Success Patterns**:
- Simplicity wins (complex mechanisms fail adoption)
- Batch clearing works (MEV protection valuable)
- Need sufficient volume (thin markets struggle)
- Use case fit (right tool for right job)

---

### What Has Failed or Been Abandoned

**Gnosis Protocol v1 (Ring Trades)**
- **Status**: ✗ Deprecated 2021
- **Reason**: Complexity, poor UX, low adoption
- **Replaced by**: CowSwap (simpler model)

**Metaplex Original Auction Contracts**
- **Status**: ✗ Deprecated 2022
- **Reason**: Smart contract bugs, UX issues
- **Replaced by**: Auction House (simpler)

**Complex Multi-Token Ring Mechanisms**
- **Status**: ✗ Limited adoption
- **Reason**: Users don't understand, solvers centralized
- **Alternative**: Direct swaps preferred

**Common Failure Patterns**:
- Over-complexity kills adoption
- Smart contract bugs erode trust
- Insufficient volume → no liquidity → death spiral
- Wrong use case (auctions not always best)

---

### Lessons for Atomica

**What to Adopt**:
- ✓ Simple batch auction (Format 1) proven on blockchain
- ✓ Uniform price clearing (empirically superior in TradFi)
- ✓ Increase-only rule (prevents manipulation)
- ✓ Single round (gas efficient, easy to understand)

**What to Avoid**:
- ✗ Multi-round complexity (not suitable for blockchain speed)
- ✗ Over-engineering (complex mechanisms fail adoption)
- ✗ Solver dependencies (adds trust assumptions)
- ✗ Continuous micro-batches (fragments liquidity)

**What to Monitor**:
- Sufficient bidder participation (need critical mass)
- Manipulation patterns (collusion, sniping)
- Gas costs (batch clearing must be economic)
- User feedback (simplicity vs features)

---

# Part 4: Evaluation

## Requirement Scorecard

Evaluating public-bid formats against requirements from auction-requirements.md:

### Format Comparison Matrix

| Requirement | Format 1: Simple Batch | Format 3: Multi-Round | Format 4: Dutch | Format 5: Continuous | Format 6: Hybrid |
|-------------|----------------------|---------------------|----------------|---------------------|-----------------|
| **R1: Truthful Bidding** | ✓ Good (uniform price) | ✓✓ Better (multiple rounds) | ✓✓ Good (dominant strategy) | ✓ Good | ✓ Good |
| **R2: Info Aggregation** | ✓ Moderate (one-shot) | ✓✓ Excellent (iterative) | ✗ Poor (one-shot, fast) | ✓ Moderate | ✓✓ Good |
| **R3: Manipulation Resistance** | ✓ Moderate | ✓ Moderate | ✗ Poor (timing games) | ✓ Moderate | ✓ Moderate |
| **R4: MEV Resistance** | ✗ Poor (public mempool) | ✗ Poor | ✗ Very Poor (gas wars) | ✗ Poor | ✗ Poor |
| **R5: Sybil Neutrality** | ✓✓ Excellent (uniform) | ✓✓ Excellent | ✓✓ Excellent | ✓✓ Excellent | ✓✓ Excellent |
| **R6: Collusion Resistance** | ✓ Moderate (visible) | ✗ Poor (signaling) | ✓ Moderate | ✓ Moderate | ✓ Moderate |
| **R7: No Bid Lowering** | ✓✓ Enforced | ✓✓ Enforced | N/A (price descends) | ✓✓ Enforced | ✓✓ Enforced |
| **R8: Capital Efficiency** | ✓✓ High | ✓✓ High | ✓✓ High | ✓✓ High | ✓✓ High |
| **R9: Allocative Efficiency** | ✓ Good | ✓✓ Excellent | ✓ Good | ✓ Good | ✓✓ Good |
| **R10: Liquidity Concentration** | ✓✓ Excellent (single batch) | ✓ Moderate (spread over rounds) | ✓✓ Excellent | ✗ Poor (fragmented) | ✓ Moderate |
| **R11: Fair Execution** | ✓ Moderate (late bidder edge) | ✓ Moderate (round dynamics) | ✗ Poor (timing critical) | ✓ Moderate | ✓ Moderate |
| **R12: Sustainable Compensation** | ✓✓ Self-sustaining | ✓✓ Self-sustaining | ✓✓ Self-sustaining | ✓✓ Self-sustaining | ✓✓ Self-sustaining |
| **R13: Illiquidity Protection** | ✓ Reserve prices possible | ✓ Price floor each round | ✓ Price descent = protection | ✓ Reserve prices | ✓ Reserve prices |
| **Implementation Complexity** | ✓✓ Low | ✗ High | ✓ Low | ✗ High | ✗ Very High |
| **Blockchain Precedent** | ✓✓ Gnosis (proven) | ✗ None | ✓ NFT auctions | ✓✓ CoW Swap | ✗ None (TradFi only) |
| **Gas Efficiency** | ✓✓ Excellent | ✗ Poor (multi-tx) | ✓✓ Excellent | ✓ Moderate | ✗ Poor |

**Legend**: ✓✓ Excellent, ✓ Good/Acceptable, ⚠ Moderate/Concerning, ✗ Poor/Inadequate

---

### Detailed Scorecard Analysis

**Format 1: Simple Batch Auction (Gnosis Style)**

**Strengths**:
- ✓✓ Proven on blockchain (Gnosis Auction, active 3+ years)
- ✓✓ Simple to implement and audit
- ✓✓ Gas efficient (single round)
- ✓✓ Excellent liquidity concentration
- ✓✓ Self-sustaining economics
- ✓✓ Sybil neutral (uniform pricing)

**Weaknesses**:
- ✗ MEV vulnerable (public mempool)
- ✓ Late bidder information advantage (but mitigated by uniform price)
- ✗ Potential for timing games (last-minute bids)
- ✓ Moderate collusion resistance (bids visible)

**Overall Score**: **8/10** - Best balance of simplicity, proven track record, and requirement coverage

---

**Format 3: Multi-Round Ascending (FCC Style)**

**Strengths**:
- ✓✓ Best price discovery (iterative competitive bidding)
- ✓✓ Best information aggregation (see responses)
- ✓✓ Proven in TradFi (FCC, $100B+ allocated)

**Weaknesses**:
- ✗ Very complex (multi-day auctions, coordination)
- ✗ High gas costs (transaction per round per bidder)
- ✗ Slow (not suitable for blockchain speed expectations)
- ✗ Collusion signaling possible (bid patterns)
- ✗ No blockchain precedent (complexity barrier)

**Overall Score**: **5/10** - Theoretically sound but practically infeasible for blockchain

---

**Format 4: Dutch Auction (Descending Price)**

**Strengths**:
- ✓✓ Fast (can be minutes)
- ✓✓ Theoretically truthful (dominant strategy to bid at valuation)
- ✓ Simple concept
- ✓ Some blockchain precedent (NFTs)

**Weaknesses**:
- ✗ Severe MEV/timing issues (gas wars at critical price)
- ✗ Network latency creates unfairness
- ✗ Poor collusion resistance (coordinate to wait)
- ✗ Chaotic closing (rush to submit)
- ✓ Not suitable for multi-unit uniform price well

**Overall Score**: **4/10** - Too timing-sensitive for blockchain

---

**Format 5: Continuous Batch with Periodic Clearing**

**Strengths**:
- ✓✓ Proven at scale (CoW Swap)
- ✓✓ Flexible (continuous submission)
- ✓ Multiple daily opportunities

**Weaknesses**:
- ✗ Liquidity fragmentation (splits volume)
- ✗ Complex coordination (many batches)
- ⚠ Different model (solver-based, not pure auction)
- ✓ Works for CoW but different use case (DEX aggregation vs cross-chain)

**Overall Score**: **6/10** - Works but not ideal for Atomica's use case

---

**Format 6: Hybrid (Continuous + Daily Anchor)**

**Strengths**:
- ✓✓ Best of both worlds (liquidity concentration + flexibility)
- ✓✓ Proven in TradFi (stock exchange opens)

**Weaknesses**:
- ✗ Very high complexity (two mechanisms)
- ✗ No blockchain precedent
- ✗ Challenging to implement correctly
- ⚠ Premature optimization (start simpler first)

**Overall Score**: **5/10** - Interesting but too complex for v1

---

## Attack Surface Analysis

### MEV Vulnerability Comparison

**All public-bid formats share MEV vulnerability**. Let's analyze specific attack vectors:

#### Front-Running (Transaction Reordering)

**Attack**: Validator sees pending bid in mempool, submits own bid ahead

**Example**:
```
Block N:
- Pending: Alice bids 50 ETH @ $2,000
- Validator sees this, inserts own tx first: 50 ETH @ $1,999
- Block inclusion: [Validator bid, Alice bid]
- Result: Validator wins at $1,999, Alice marginal
```

**Format Vulnerability**:
- **Format 1 (Simple Batch)**: ✗ Vulnerable (but batch clearing reduces impact)
- **Format 3 (Multi-Round)**: ✗ Vulnerable in each round
- **Format 4 (Dutch)**: ✗ Severely vulnerable (timing critical)
- **Format 5 (Continuous)**: ✗ Vulnerable in each batch

**Mitigation**:
- Uniform price reduces profit (front-runner pays clearing price, not own bid)
- Batch clearing makes ordering within batch less relevant
- Increase-only rule prevents lowering after being front-run
- **Accept**: MEV leakage unavoidable in public-bid designs

**Economic Impact**:
```
Without front-running:
- Alice: 50 ETH @ $2,000
- Bob: 50 ETH @ $1,990
- Clearing: $1,990 (both pay same)

With front-running:
- Validator: 50 ETH @ $1,999
- Alice: 50 ETH @ $2,000
- Bob: 50 ETH @ $1,990
- Clearing: $1,990 (uniform price unchanged!)
- Validator profit: $0 (pays same as everyone else)

→ Front-running less profitable in uniform price auctions
```

**Key Insight**: Uniform pricing dramatically reduces MEV profitability compared to continuous trading or discriminatory auctions.

---

#### Bid Sniping (Last-Minute Timing)

**Attack**: Submit bid at last possible moment, see all prior bids

**Example**:
```
Auction window: 08:00-12:00
- 08:30: Alice bids 40 ETH @ $2,000
- 09:15: Bob bids 30 ETH @ $1,980
- 11:59:50: Carol sees Alice and Bob, bids 40 ETH @ $1,951
- 12:00:00: Auction closes
- Clearing: $1,951 (Carol's snipe lowers price)
```

**Format Vulnerability**:
- **Format 1**: ✗ Vulnerable (late bidders see all early bids)
- **Format 3**: ✓ Less vulnerable (multiple rounds, can respond)
- **Format 4**: ✗ Severely vulnerable (entire mechanism timing-based)
- **Format 5**: ✗ Vulnerable per batch

**Mitigation**:
- Increase-only rule (cannot lower if observed bidding up)
- Uniform price (sniper doesn't benefit if others bid high)
- Reserve prices (set floor on acceptable price)
- **Partial**: Can reduce but not eliminate

**Example with Increase-Only**:
```
- 08:30: Alice bids 40 ETH @ $2,000
- 11:59: Carol wants to snipe at $1,951
- BUT: Alice can INCREASE to $2,050 in response
- Carol's snipe failed (Alice out-bid her)
- Increase-only prevents Carol from lowering in response
```

---

#### Collusion Signaling

**Attack**: Visible bids enable tacit collusion through bid patterns

**Example**:
```
Public bids allow cartel verification:
- Alice bids $1,900 (cartel agreement)
- Bob bids $1,900 (compliance verified)
- Carol bids $1,950 (defection detected!)
- Next auction: Alice and Bob punish Carol

With sealed bids:
- Cannot verify compliance
- Cannot detect defectors
- Collusion harder to maintain
```

**Format Vulnerability**:
- **Format 1**: ⚠ Moderate (single round limits signaling)
- **Format 3**: ✗ High (multi-round enables signaling across rounds)
- **Format 4**: ✓ Low (fast, less coordination time)
- **Format 5**: ⚠ Moderate (multiple batches = repeated game)

**Mitigation**:
- Open entry (cannot exclude new bidders who defect)
- Anonymity/pseudonymity (harder to identify defectors)
- One-shot auctions (no repeated punishment)
- **Partial**: Defection still dominant strategy but observable

**Sealed Bids Comparison**:
- Sealed bids: Cannot verify cartel compliance → collusion unstable
- Public bids: Can verify compliance → collusion easier to maintain
- **Degradation accepted**: Open entry + defection incentives still work

---

### Timing Game Vulnerabilities

**Network Latency Inequality**:

**Issue**: Some bidders have better network connections, lower latency

**Impact**:
```
High-latency bidder (Alice): 500ms to validator
Low-latency bidder (Bob): 50ms to validator

Auction closes at block N:
- Alice submits at t=11:59:00, arrives 11:59:00.5
- Bob submits at t=11:59:00.4, arrives 11:59:00.45
- Bob's bid included in block N
- Alice's bid arrives too late, not included
→ Bob wins through infrastructure advantage
```

**Format Vulnerability**:
- **Format 1**: ⚠ Moderate (last-second submissions matter)
- **Format 3**: ✓ Low (hours per round, latency irrelevant)
- **Format 4**: ✗ Severe (microseconds matter)
- **Format 5**: ⚠ Moderate (per batch)

**Mitigation**:
- Long auction windows (hours, not seconds)
- Grace period (e.g., accept bids for 1 minute after nominal close)
- Deterministic close time (block number, not wall-clock time)
- **Partial**: Reduces but doesn't eliminate

---

### Gas Price Wars

**Issue**: Critical moments trigger gas bidding wars

**Example**:
```
Dutch auction at critical price ($2,000 → $1,999):
- 100 bidders watching
- Price hits $1,999
- All 100 submit bids simultaneously
- Gas prices spike (users pay 1000 gwei to be first)
- Validators extract gas price MEV
- Only richest bidders can afford inclusion
```

**Format Vulnerability**:
- **Format 1**: ✓ Low (spread over hours)
- **Format 3**: ✓ Low (spread over days)
- **Format 4**: ✗ Severe (concentrated at price point)
- **Format 5**: ⚠ Moderate (per batch close)

**Mitigation**:
- Slow price changes (if Dutch: gradual descent)
- Long windows (spread bids over time)
- EIP-1559 base fee (makes gas predictable)
- **Format 1 wins**: Hours-long window = no gas wars

---

## Seller Protection: The Undersubscription Problem

### Critical Risk: Public Bids Create Adverse Selection for Sellers

**The Problem**: In public-bid auctions, sellers commit assets before knowing demand, but bidders can observe weak demand and withdraw/lower interest. This creates catastrophic seller risk.

**Scenario**:
```
Multi-seller auction: 100 ETH total supply from 10 sellers
Each seller deposited 10 ETH (locked until auction end)

08:00: Auction opens
08:00-10:00: Only 20 ETH in bids submitted (severely undersubscribed)
10:30: Late bidders see weak demand, realize they have market power
10:45: Bidders submit low-ball bids (e.g., $1,500 when external market = $2,000)
12:00: Auction clears at $1,500

Result:
- Sellers forced to sell at 25% below market
- Sellers lose $500 per ETH × 100 ETH = $50,000
- Sellers exit platform, never return
- Death spiral: No sellers → no auctions → platform fails
```

**Why This Is Worse Than Sealed Bids**:
- **Sealed bids**: Bidders cannot see demand; must bid competitively or risk losing
- **Public bids**: Bidders see undersubscription, can collude to exploit sellers

### Impact on Multi-Seller Participation

**Seller Decision Model**:

Sellers must evaluate risk before depositing assets:
```
Expected value of selling in auction:
E[V] = P(full subscription) × E[Price | full] +
       P(undersubscription) × E[Price | under] -
       Opportunity_cost

If E[V] < External_market_price:
  → Don't participate
  → Auction fails due to no supply
```

**Death Spiral Dynamics**:
```
Round 1: 100 sellers participate
→ Some auctions undersubscribed
→ Sellers get exploited (low clearing prices)

Round 2: 50 sellers participate (others left)
→ Higher probability of undersubscription
→ Even worse prices for sellers

Round 3: 10 sellers participate
→ Almost always undersubscribed
→ Platform dead
```

**Bootstrapping Problem**:
- New platform → no bidder liquidity yet
- Sellers take risk depositing
- First auctions likely undersubscribed
- Bad prices → sellers never return
- Platform never achieves critical mass

### Comparison: Public Bids vs Sealed Bids

| Dimension | Sealed Bids | Public Bids |
|-----------|-------------|-------------|
| **Bidder Information** | No visibility into demand | Full visibility (mempool + confirmed bids) |
| **Bidder Strategy** | Must bid competitively (risk losing) | Can wait, observe, exploit weak demand |
| **Seller Risk** | Low (competitive bidding enforced) | **SEVERE** (exploit via undersubscription) |
| **Collusion** | Hard (can't verify demand) | Easy (see demand, coordinate low bids) |
| **Bootstrap Viability** | Possible (bidders can't see thinness) | **Near impossible** (visible thinness scares sellers) |
| **Required Reserve Price** | Optional (for large orders) | **MANDATORY** (or sellers get destroyed) |

**Verdict**: Public bids create **unacceptable seller risk** without strong protection mechanisms.

---

### Seller Protection Mechanisms

We need **mandatory** seller protection for public-bid auctions. Evaluate options:

---

#### Option 1: Mandatory Reserve Prices (Commit-Reveal)

**Mechanism**:
- Sellers commit to reserve price before auction
- Reserve encrypted/hashed (not public)
- Auction clears only if clearing price ≥ reserve
- If clearing price < reserve → auction fails, sellers keep assets

**Implementation**:
```
Pre-auction:
- Seller commits: hash(reserve_price, nonce)
- Locks assets in escrow

During auction:
- Bidders submit public bids (see demand)
- Bidders do NOT see reserve prices

At clearing:
- Seller reveals reserve_price, nonce
- Verify hash(reserve_price, nonce) matches commitment
- If clearing_price >= reserve → execute
- If clearing_price < reserve → cancel, return assets
```

**Example**:
```
Seller commits reserve: hash($1,900, salt)
External market: $2,000

Scenario A (Healthy demand):
- Bids: 40@$2,000, 30@$1,980, 40@$1,950
- Clearing: $1,950
- $1,950 > $1,900 reserve → EXECUTE

Scenario B (Undersubscribed):
- Bids: 20@$1,600, 10@$1,500
- Clearing: $1,500
- $1,500 < $1,900 reserve → CANCEL
- Seller keeps assets (protected from exploitation)
```

**Strengths**:
- ✓ Sellers protected from below-cost sales
- ✓ Reserve private (bidders can't game it)
- ✓ Simple mechanism (commit-reveal standard)
- ✓ Proven in TradFi (Treasury auctions accept reserves)

**Weaknesses**:
- ⚠ Auction failure risk (if reserves too high)
- ⚠ Griefing potential (commit high reserve, waste bidder time)
- ⚠ Need penalty for unrealistic reserves

---

#### Option 2: Reserve Price with Rejection Penalty

**Enhancement to Option 1**: Add penalty if seller sets reserve above clearing and rejects auction.

**Mechanism**:
```
If seller sets reserve > clearing price:
  → Auction cancelled
  → Seller pays penalty: 5% of reserve × quantity
  → Penalty compensates bidders for wasted time/gas

Example:
- Seller commits reserve: $1,900
- Clearing price: $1,850
- Seller rejects auction
- Penalty: 0.05 × $1,900 × 100 ETH = $9,500
- Penalty paid to bidders (proportional to bid size)
```

**Rationale**:
- Discourages unrealistic reserves (seller pays if too high)
- Compensates bidders for wasted effort
- Seller still protected (can set reserve at true cost + small margin)

**Calibration**:
```
Seller true cost: $1,800/ETH
External market: $2,000/ETH
Seller sets reserve: $1,850 (cost + small margin)

If undersubscribed to $1,800:
  → Reject auction, pay 5% × $1,850 = $92.50/ETH penalty
  → Better than selling at loss ($200/ETH loss)

If competitive bidding: $1,950:
  → Accept auction, profit $150/ETH
  → Reserve didn't trigger
```

**Strengths**:
- ✓ Balances seller protection with auction reliability
- ✓ Prevents strategic reserve inflation
- ✓ Bidders compensated for failed auctions

**Weaknesses**:
- ⚠ Penalty rate must be calibrated (too high → no protection; too low → griefing)
- ⚠ Complexity (need penalty distribution logic)

---

#### Option 3: Minimum Subscription Threshold

**Mechanism**:
Auction only executes if total bid volume ≥ X% of supply

**Implementation**:
```
Auction: 100 ETH supply
Minimum subscription: 80% (80 ETH bid)

Scenario A:
- Total bids: 90 ETH → 90% subscribed → EXECUTE

Scenario B:
- Total bids: 50 ETH → 50% subscribed → CANCEL
- All sellers get assets back
- No penalty (market just thin)
```

**Strengths**:
- ✓ Simple rule (transparent threshold)
- ✓ Protects all sellers equally
- ✓ No individual reserve price needed

**Weaknesses**:
- ✗ All-or-nothing (small undersubscription cancels entire auction)
- ✗ Coordination failure (81 ETH bid but 100 ETH supply → 19 ETH wasted)
- ✗ Bidders uncertain if auction will execute
- ✗ No protection if 80% subscribed but at terrible price

**Verdict**: Too blunt; doesn't solve price exploitation, only volume

---

#### Option 4: Dynamic Reserve Floor (Oracle-Based)

**Mechanism**:
Smart contract enforces minimum clearing price based on external oracle (e.g., Chainlink)

**Implementation**:
```
Oracle price: $2,000/ETH
Minimum clearing price: 90% of oracle = $1,800

Auction clears only if clearing_price >= $1,800
Else: cancelled, sellers protected
```

**Strengths**:
- ✓ Objective price floor (not seller-set)
- ✓ Prevents catastrophic below-market sales
- ✓ No griefing (can't inflate reserve)

**Weaknesses**:
- ✗ Requires trusted oracle (centralization risk)
- ✗ Oracle manipulation attacks
- ✗ What if oracle fails or stale?
- ✗ Cross-chain: which oracle for which asset?
- ✗ **Violates trustless design principle**

**Verdict**: Not acceptable for Atomica (trustless requirement)

---

#### Option 5: Hybrid: Seller Reserves + Protocol Floor

**Mechanism**:
- Each seller sets individual reserve (commit-reveal)
- Protocol also enforces global floor (e.g., 80% of median recent auction prices)
- Auction executes only if clearing price ≥ max(seller reserves, protocol floor)

**Implementation**:
```
Seller A reserve: $1,900
Seller B reserve: $1,850
Protocol floor: $1,800 (based on last 10 auction avg)

Clearing price: $1,820
→ $1,820 < $1,900 (Seller A reserve)
→ Seller A's units don't sell (kept)
→ $1,820 > $1,850? No
→ Seller B's units don't sell (kept)
→ Auction fails (no sellers cleared)

Clearing price: $1,950
→ Both sellers clear
→ Both protected
```

**Strengths**:
- ✓ Double protection (individual + protocol)
- ✓ Protocol floor prevents cascading collapse
- ✓ Sellers still have individual control

**Weaknesses**:
- ⚠ How to set protocol floor without oracle?
- ⚠ Bootstrapping problem (no history initially)
- ⚠ Could use internal price history (but subject to manipulation)

**Partial Solution**:
```
Protocol floor based on internal auction history:
- Median clearing price of last 10 auctions
- Floor = 80% of median
- Prevents sudden price collapse
- Uses own data (no external oracle)

Bootstrapping:
- First 10 auctions: No protocol floor (only seller reserves)
- After 10 auctions: Protocol floor activates
- Requires manual seller reserves to bootstrap
```

---

### Reserve Price Challenges in Public-Bid Auctions

**The Fundamental Problem**: Commit-reveal reserves have **griefing vulnerability** in public-bid environment.

#### Griefing Attack: Strategic Reserve Rejection

**Attack**:
```
Malicious seller:
1. Commits reserve: hash($10,000, nonce)
   (Way above market of $2,000)
2. Locks 100 ETH in auction
3. Bidders spend time/gas bidding
4. Auction clears at $1,950
5. Seller reveals reserve: $10,000
6. Auction cancelled (clearing < reserve)
7. Seller pays 5% penalty: $50,000
8. But seller wasted bidders' time and gas

If attacker shorts ETH:
- Could profit from disrupting price discovery
- Or competitor trying to kill platform
```

**Mitigation via Penalty**:
```
5% penalty on $10,000 reserve × 100 ETH = $50,000
→ Expensive to grief

But if attacker motivated (competitor, shorter):
→ May accept $50K cost to damage platform
→ Especially if penalty distributed (each bidder gets small amount)
```

**Penalty Calibration Dilemma**:
```
If penalty too low (1%):
- Cheap to grief ($10K)
- Sellers set inflated reserves risk-free
- Auctions fail frequently

If penalty too high (20%):
- Seller risk too high
- Can't set protective reserves
- Defeats purpose (sellers unprotected)

Sweet spot (5-10%):
- High enough to deter casual griefing
- Low enough sellers can protect themselves
- But still vulnerable to determined attackers
```

---

#### Public-Bid Specific Problem: Visible Undersubscription

**Issue**: Bidders can see low demand → condition their bids on exploitation

**Attack**:
```
08:00: Auction opens
08:00-11:00: Only 30 ETH bid (out of 100 ETH supply)
11:30: Sophisticated bidder sees undersubscription
11:45: Bidder thinks: "Sellers probably have ~$1,800 reserves"
11:50: Bidder bids $1,790 × 30 ETH (just under likely reserve)
12:00: Clearing at $1,790

If seller reserves at $1,800:
  → Auction fails, seller pays penalty
  → Bidder wasted effort

If seller reserves at $1,750:
  → Auction clears at $1,790
  → Seller gets terrible price (vs $2,000 market)
  → Bidder profits from exploitation
```

**The Trap**:
- Set reserve too high → auction fails, pay penalty
- Set reserve too low → get exploited by low-ballers
- No good outcome when undersubscribed with public bids

**Sealed Bids Comparison**:
```
With sealed bids (same scenario):
- Bidders cannot see undersubscription
- Must bid competitively (risk losing to hidden competitors)
- Bidder at 11:50 doesn't know demand is weak
- Bids closer to true value ($1,950+)
- Sellers protected by information asymmetry
```

---

### Evaluation: Public Bids Fundamentally Incompatible with Good Seller Protection

**The Core Conflict**:

| Requirement | Public Bids Reality | Implication |
|-------------|---------------------|-------------|
| **Sellers need protection** | ✓ Can use reserves | But: |
| **Reserves must be private** | ✗ Commit-reveal griejustfable | Bidders can waste sellers' time |
| **Reserves must be enforceable** | ✓ Smart contract can enforce | But: |
| **Penalties needed to prevent griefing** | ⚠ Partial (calibration hard) | Still vulnerable to determined attackers |
| **Bidders need demand visibility for efficiency** | ✓ Public bids provide | Creates exploitation opportunity |
| **Platform needs reliable execution** | ✗ Failed auctions harm UX | Reserve rejections = failed auctions |

**Sealed Bids Superiority for Seller Protection**:

| Requirement | Sealed Bids | Public Bids |
|-------------|-------------|-------------|
| **Information Asymmetry** | ✓✓ Bidders blind to demand | ✗ Bidders see everything |
| **Competitive Bidding** | ✓✓ Must bid high or lose | ✗ Can low-ball if thin |
| **Reserve Privacy** | ✓✓ Fully hidden until reveal | ⚠ Commit-reveal only |
| **Griefing Resistance** | ✓✓ No incentive to fake | ⚠ Penalties only partial deterrent |
| **Bootstrap Viability** | ✓✓ Thin markets hidden | ✗ Visible thinness scares sellers |
| **Seller Confidence** | ✓✓ High (protected by privacy) | ✗ Low (visible exploitation risk) |

---

### Real-World Evidence

#### Gnosis Auction (Public Bids)

**Observation**: Primarily used for **token launches**, not recurring markets

**Why**:
- Token launches = one-time events (issuers don't need repeat participation)
- Price discovery main goal (not protecting repeat sellers)
- Issuers often accept risk (raised capital via token sale)
- **Not suitable for recurring cross-chain swaps** (sellers need repeat viability)

**Undersubscription Handling**:
- Token launches often oversubscribed (hype-driven)
- When undersubscribed, issuers accept poor prices (sunk cost)
- No repeat seller problem (one-time issuance)

**Takeaway**: Gnosis Auction works **despite** weak seller protection because use case doesn't require it. Atomica **does** require strong seller protection (recurring swaps).

---

#### Stock Exchange Opening Auctions (Public Order Books)

**Observation**: Public order books show demand, but liquidity providers protected differently

**Protections**:
- **Designated Market Makers**: Obligated to provide liquidity (compensated by exchange)
- **Continuous trading follows**: Opening auction just sets starting price; bad execution can be corrected immediately in continuous market
- **Deep liquidity**: Thousands of participants (undersubscription rare)
- **Regulatory oversight**: Manipulation illegal, prosecutable

**Not Applicable to Atomica**:
- No designated market makers (permissionless)
- No continuous trading following auction (daily batch only)
- Thin markets likely during bootstrap (not deep liquidity)
- Limited regulatory recourse (decentralized, pseudonymous)

**Takeaway**: Public order books work in TradFi due to institutional support structures absent in DeFi.

---

#### Treasury Auctions (Public Bids, Sort Of)

**Nuance**: Treasury auctions have public bids **only after auction closes**

**Process**:
```
Pre-auction: Bidders register intent (non-binding)
Auction window: Bids submitted via closed network (not public mempool)
Auction close: All bids revealed simultaneously
Clearing: Uniform price computed
Post-auction: All bids made public (transparency)
```

**Key Difference**:
- **NOT** public mempool visibility during auction
- Bids revealed simultaneously (no sequential advantage)
- More similar to **sealed bids** than blockchain public bids

**Takeaway**: "Public bid" TradFi auctions are actually sealed during critical window. True blockchain public bids (mempool) are worse.

---

### Conclusion: Public Bids Require Mandatory Strong Reserves

**Assessment**: Public-bid auctions are **only viable for Atomica if**:

**1. Mandatory Seller Reserves (Commit-Reveal)**
- Every seller must set reserve price
- Reserves private until reveal
- Auction fails if clearing < reserve

**2. Rejection Penalty (5-10%)**
- Seller pays penalty if reserve above clearing
- Deters unrealistic reserves
- Compensates bidders for failed auctions

**3. Accept Higher Auction Failure Rate**
- More auctions will fail (vs sealed bids)
- Sellers will set conservative reserves
- Platform must tolerate failed auctions during bootstrap

**4. Bootstrapping Strategy**
- Initial liquidity mining for bidders (ensure participation)
- Seller education (how to set reserves)
- Conservative early sellers (willing to accept failures)
- Gradual buildout of liquidity

**Alternative Conclusion**: **Sealed bids are mandatory** for seller protection unless willing to accept:
- High auction failure rates
- Slower bootstrap (sellers scared off)
- Griefing vulnerability
- Seller attrition from exploitation

---

## Recommendation

### Primary Recommendation: Format 1 - Simple Batch Auction

**Mechanism**: Single-round, public-bid, uniform price batch auction (Gnosis Auction style)

**Rationale**:

**1. Proven on Blockchain (Critical)**:
- Gnosis Auction: 3+ years production, hundreds of auctions
- No major exploits or manipulation incidents
- Simple enough to audit and verify
- Community familiarity (seen in token launches)

**2. Best Requirement Coverage**:
- ✓✓ R7 (No bid lowering): Enforced via smart contract
- ✓✓ R8 (Capital efficiency): Active bidder deployment
- ✓✓ R12 (Sustainable): Self-compensating through spreads
- ✓✓ R5 (Sybil neutral): Uniform pricing makes Sybil attacks pointless
- ✓✓ R10 (Liquidity concentration): Single batch per day
- ✓ R1, R2, R3, R9, R13: Good coverage

**3. Acceptable Tradeoffs**:
- ✗ R4 (MEV resistance): Poor, but uniform price reduces extraction
- ✗ R6 (Collusion resistance): Degraded, but open entry + defection incentives remain
- ✗ R11 (Fairness): Late bidder advantage, but uniform price mitigates

**4. Implementation Simplicity**:
- Single smart contract (batch clearing logic)
- No complex multi-round coordination
- Gas efficient (one settlement transaction)
- Easy to audit and verify

**5. Atomica-Specific Fit**:
- Daily batch matches futures delivery model
- Cross-chain coordination easier with predictable schedule
- Sufficient for launch phase (add complexity later if needed)

**6. CRITICAL CAVEAT: Seller Protection MANDATORY**:
- ✗ **SEVERE seller risk** from visible undersubscription
- ✗ **MANDATORY reserve prices** with commit-reveal required
- ✗ **Higher auction failure rate** expected during bootstrap
- ✗ **Griefing vulnerability** from reserve rejection penalties
- **Verdict**: Public bids only viable with strong seller protection, but fundamentally inferior to sealed bids

---

### MANDATORY: Seller Reserve Price Implementation

**CRITICAL REQUIREMENT**: Public-bid auctions **MUST** include seller reserve prices or risk catastrophic seller attrition.

**Mechanism: Commit-Reveal Reserve with Penalty**:

```solidity
contract PublicBidAuctionWithReserves {
    struct SellerCommitment {
        bytes32 reserveHash;  // hash(reservePrice, nonce)
        uint256 quantity;
        address seller;
        uint256 depositTimestamp;
    }

    struct SellerReserve {
        uint256 reservePrice;
        bytes32 nonce;
        bool revealed;
    }

    mapping(address => SellerCommitment) public sellerCommitments;
    mapping(address => SellerReserve) public sellerReserves;

    uint256 constant PENALTY_RATE = 5; // 5% penalty for rejection

    // Phase 1: Seller commits reserve (BEFORE auction)
    function commitReserve(
        bytes32 reserveHash,
        uint256 quantity
    ) external {
        require(block.timestamp < auctionStart, "Auction started");

        // Lock seller's assets
        lockAssets(msg.sender, quantity);

        sellerCommitments[msg.sender] = SellerCommitment({
            reserveHash: reserveHash,
            quantity: quantity,
            seller: msg.sender,
            depositTimestamp: block.timestamp
        });

        emit ReserveCommitted(msg.sender, quantity);
    }

    // Phase 2: Bidders submit bids (PUBLIC, visible)
    function submitBid(uint256 quantity, uint256 price) external {
        // ... (same as before)
    }

    // Phase 3: Clearing + Reserve Reveal
    function clearAuction() external {
        require(block.timestamp >= auctionEnd, "Not ended");

        // Compute clearing price from bids
        uint256 clearingPrice = computeClearingPrice();

        emit ClearingPriceComputed(clearingPrice);

        // Now sellers must reveal reserves
        // (Separate reveal phase or simultaneous)
    }

    // Seller reveals reserve price
    function revealReserve(
        uint256 reservePrice,
        bytes32 nonce
    ) external {
        SellerCommitment memory commitment = sellerCommitments[msg.sender];
        require(commitment.seller == msg.sender, "No commitment");

        // Verify hash
        bytes32 expectedHash = keccak256(abi.encodePacked(reservePrice, nonce));
        require(expectedHash == commitment.reserveHash, "Invalid reveal");

        sellerReserves[msg.sender] = SellerReserve({
            reservePrice: reservePrice,
            nonce: nonce,
            revealed: true
        });

        emit ReserveRevealed(msg.sender, reservePrice);
    }

    // Final settlement (after all reveals)
    function finalizeAuction() external {
        uint256 clearingPrice = computedClearingPrice;

        for (address seller in sellers) {
            SellerReserve memory reserve = sellerReserves[seller];
            require(reserve.revealed, "Seller did not reveal");

            if (clearingPrice >= reserve.reservePrice) {
                // EXECUTE: Clearing price meets reserve
                executeSale(seller, commitment.quantity, clearingPrice);
                emit SellerExecuted(seller, commitment.quantity, clearingPrice);
            } else {
                // REJECT: Clearing price below reserve
                // Seller pays penalty
                uint256 penalty = (reserve.reservePrice * commitment.quantity * PENALTY_RATE) / 100;
                chargePenalty(seller, penalty);

                // Distribute penalty to bidders (proportional to bid size)
                distributePenaltyToBidders(penalty);

                // Return assets to seller
                returnAssets(seller, commitment.quantity);

                emit SellerRejected(seller, clearingPrice, reserve.reservePrice, penalty);
            }
        }
    }
}
```

**Flow**:
```
t=0-4 hours before auction: Sellers commit reserves (hash only)
t=auction start: Bidders submit bids (public, visible)
t=auction end: Clearing price computed
t=reveal phase: Sellers reveal reserve prices
t=finalization: Check reserves vs clearing, execute or penalize
```

**Penalty Distribution**:
```
If seller rejects (reserve > clearing):
  Penalty = 5% × reserve × quantity

Example:
  Reserve: $1,900
  Clearing: $1,850
  Quantity: 100 ETH
  Penalty: 0.05 × $1,900 × 100 = $9,500

  Distributed to bidders:
    Bidder A (40 ETH bid): $3,800 (40%)
    Bidder B (30 ETH bid): $2,850 (30%)
    Bidder C (40 ETH bid): $2,850 (30%)
```

---

### Implementation Specification

**Auction Schedule**:
```
Daily auction: 12:00 UTC
Bid window: 08:00-12:00 UTC (4 hours)
Settlement: 12:00 UTC (atomic)
Delivery: +24 hours (futures model)
```

**Smart Contract Logic**:
```solidity
contract SimpleBatchAuction {
    struct Bid {
        address bidder;
        uint256 quantity;
        uint256 pricePerUnit;
        uint256 timestamp;
    }

    Bid[] public bids;
    uint256 public auctionStart;
    uint256 public auctionEnd;
    uint256 public totalSupply;

    // Bid submission (public, anytime during window)
    function submitBid(uint256 quantity, uint256 price) external {
        require(block.timestamp >= auctionStart, "Not started");
        require(block.timestamp < auctionEnd, "Ended");

        // Increase-only rule
        Bid memory existingBid = getBid(msg.sender);
        require(price >= existingBid.pricePerUnit, "Cannot lower price");
        require(quantity >= existingBid.quantity, "Cannot lower quantity");

        bids.push(Bid({
            bidder: msg.sender,
            quantity: quantity,
            pricePerUnit: price,
            timestamp: block.timestamp
        }));

        emit BidSubmitted(msg.sender, quantity, price);
    }

    // Clearing at auction end (anyone can call)
    function clearAuction() external {
        require(block.timestamp >= auctionEnd, "Not ended");
        require(!cleared, "Already cleared");

        // Sort bids by price (descending)
        Bid[] memory sortedBids = sortByPrice(bids);

        // Find clearing price
        uint256 clearingPrice = 0;
        uint256 totalAllocated = 0;

        for (uint i = 0; i < sortedBids.length; i++) {
            if (totalAllocated + sortedBids[i].quantity <= totalSupply) {
                totalAllocated += sortedBids[i].quantity;
            } else {
                clearingPrice = sortedBids[i].pricePerUnit;
                break;
            }
        }

        // Settle winning bids
        for (uint i = 0; i < sortedBids.length; i++) {
            if (sortedBids[i].pricePerUnit >= clearingPrice) {
                settleBid(sortedBids[i].bidder,
                         sortedBids[i].quantity,
                         clearingPrice);
            }
        }

        cleared = true;
        emit AuctionCleared(clearingPrice, totalAllocated);
    }
}
```

**Key Features**:
- Public bid submission (visible on-chain)
- Increase-only enforcement (smart contract check)
- Uniform clearing price (all pay same)
- Single-round settlement (gas efficient)

---

### Mitigations for Public-Bid Weaknesses

**MEV Mitigation (Partial)**:
1. **Uniform price reduces profit**: Front-runners pay clearing price (not their bid)
2. **Batch clearing**: Transaction ordering within block less relevant
3. **Long window**: 4-hour window reduces timing pressure
4. **Monitor and respond**: Track MEV extraction, adjust if needed

**Late Bidder Advantage Mitigation**:
1. **Increase-only rule**: Early bidders can increase bids in response
2. **Uniform price**: Late bidders don't pay less (everyone pays marginal)
3. **Multiple daily auctions (future)**: Reduce opportunity cost of waiting

**Collusion Mitigation**:
1. **Open entry**: Cannot exclude new bidders
2. **Pseudonymity**: Harder to identify and punish defectors
3. **Defection incentives**: Uniform price makes defection profitable
4. **Monitoring**: Track bid patterns, flag suspicious coordination

---

### Fallback: Format 3 (Multi-Round) for High-Value Assets

**When to Consider**:
- Asset value >$10M per auction (justify complexity)
- Sophisticated bidders (institutional, can handle multi-day)
- Time-insensitive (e.g., periodic large rebalancing)

**Implementation**:
- Rounds spaced 24 hours apart (not minutes/hours)
- Activity rules (must bid each round)
- Withdrawal penalties (cannot retract prior bids)
- Publicly visible round results

**Use Case**: Not initial launch; potential future feature for very large orders

---

## Conclusion

### Summary

**If Sealed Bids Not Viable**, the best alternative is:

**Format 1: Simple Batch Auction with MANDATORY Seller Reserves**

**CRITICAL FINDING: Seller Protection Analysis Changes Recommendation**

After analyzing undersubscription risks, **public bids create severe seller protection problems**:

**Seller Risk Assessment**:
- ✗ **SEVERE**: Bidders exploit visible undersubscription
- ✗ **SEVERE**: Death spiral from seller attrition likely during bootstrap
- ✗ **HIGH**: Griefing attacks via reserve rejection
- ✗ **HIGH**: Auction failure rate will be elevated
- ✗ **MANDATORY**: Reserve prices absolutely required (not optional)

**Comparison to Sealed Bids**:

| Dimension | Sealed Bids | Public Bids + Reserves |
|-----------|-------------|----------------------|
| **Seller Protection** | ✓✓ Excellent | ✗ Poor (visible exploitation) |
| **Bootstrap Viability** | ✓✓ High | ✗ Very Low (sellers scared off) |
| **Auction Success Rate** | ✓✓ High (>95%) | ⚠ Moderate (70-80% est.) |
| **Griefing Resistance** | ✓✓ Strong | ✗ Weak (penalty only partial) |
| **Seller Confidence** | ✓✓ High | ✗ Low |
| **Implementation Complexity** | ⚠ High (crypto) | ⚠ High (reserves + penalties) |

**Reasoning for Public Bids (if forced)**:
1. ✓ Proven on blockchain (Gnosis Auction, 3+ years)
2. ✓ Meets critical requirements (R7, R8, R12, R5, R10)
3. ✓ Simple bid mechanism
4. ✓ Gas efficient (but reserves add complexity)
5. ✓ Fits Atomica's daily futures model
6. ✗ **SEVERE seller risk** requires mandatory reserves

**Mandatory Requirements for Public Bids**:
1. **Seller reserve prices (commit-reveal)** - Not optional, mandatory
2. **Rejection penalty (5-10%)** - Balance protection vs griefing
3. **Accept 20-30% auction failure rate** - Higher than sealed bids
4. **Aggressive bidder liquidity mining** - Bootstrap critical mass
5. **Seller education program** - How to set reserves
6. **Monitoring and intervention** - Track seller attrition closely

**Tradeoffs Accepted (Much Worse Than Initial Assessment)**:
- ✗ MEV vulnerability (mitigated by uniform price, batch clearing)
- ✗ Late bidder information advantage (mitigated by increase-only, uniform price)
- ✗ Visible bids enable coordination (mitigated by open entry, defection incentives)
- ✗✗ **SEVERE seller exploitation risk** (partially mitigated by reserves + penalties, BUT STILL RISKY)
- ✗✗ **High auction failure rate** (20-30% vs 5% for sealed bids)
- ✗✗ **Bootstrap nearly impossible** (visible thinness scares sellers)
- ✗ **Griefing vulnerability** (penalty only partial deterrent)

**Not Recommended**:
- ✗ Format 3 (Multi-round): Too complex for blockchain
- ✗ Format 4 (Dutch): Too timing-sensitive
- ✗ Format 5 (Continuous): Fragments liquidity
- ✗ Format 6 (Hybrid): Premature complexity
- ✗✗ **Public bids without reserves**: CATASTROPHIC seller risk

### Decision Framework

**Launch Strategy (REVISED AFTER SELLER PROTECTION ANALYSIS)**:

**Phase 1 (Months 0-6): Sealed Bids (STRONGLY PREFERRED - NEARLY MANDATORY)**
- Attempt drand timelock encryption
- Best requirement coverage
- Superior MEV protection and fairness
- **CRITICAL: Superior seller protection** (hidden demand prevents exploitation)
- **CRITICAL: Bootstrap viability** (sellers can't see thinness)
- **CRITICAL: High auction success rate** (>95% vs 70-80% for public)

**Phase 1 Fallback (If Timelock Not Ready): Public Batch WITH MANDATORY RESERVES**
- ✗ **WARNING**: High risk of seller attrition
- ✗ **WARNING**: Bootstrap will be extremely difficult
- ✗ **WARNING**: 20-30% auction failure rate expected
- **Required components**:
  - Mandatory seller reserves (commit-reveal)
  - 5-10% rejection penalty
  - Aggressive bidder liquidity mining program
  - Seller education and support
  - Active monitoring of seller health metrics
- **Contingency plan**: If seller attrition >20% in first month, MUST pivot to sealed bids immediately

**Phase 2 (Months 6-12): Evaluate Performance**
- **If public bids**: Monitor seller attrition rate (CRITICAL)
- Track auction failure rates
- Measure clearing price deviations from external markets
- Monitor reserve rejection patterns (griefing detection)
- **Decision point at Month 3**: If seller attrition >15%, emergency pivot to sealed bids

**Phase 3 (Months 12+): Optimize**
- **If public bids viable**: Seller retention >85%, failure rate <15% → Continue
- **If public bids struggling**: Seller retention <85%, failure rate >15% → Pivot to sealed bids
- **If sealed bids from start**: Optimize, add features

### Final Recommendation (UPDATED)

**PRIMARY (Strength Upgraded from "Preferred" to "Near-Mandatory")**: Sealed-bid implementation

**Rationale**:
1. ✓✓ **Seller protection** - CRITICAL for multi-seller recurring markets
2. ✓✓ **Bootstrap viability** - Hidden thinness enables early growth
3. ✓✓ **Auction success rate** - High execution certainty
4. ✓✓ **No griefing** - No reserve rejection penalty games
5. ✓ Superior MEV protection
6. ✓ Better fairness (information symmetry)

**Development Investment Justified**: Seller protection alone justifies cryptographic complexity

---

**FALLBACK (With Strong Warnings)**: Format 1 public batch WITH mandatory reserves

**Use ONLY if**:
- Timelock encryption truly impossible (drand failure, unsolvable crypto issues)
- Willing to accept 20-30% auction failure rate
- Have aggressive bidder liquidity mining budget
- Have seller education and support resources
- Have contingency plan to pivot to sealed bids within 3 months if seller metrics bad

**Success Criteria** (Must meet ALL or pivot to sealed bids):
- Seller retention >85% month-over-month
- Auction success rate >70%
- Clearing prices within 10% of external markets
- <5% griefing incidents (unrealistic reserve rejections)

**Failure Triggers** (Any ONE triggers emergency pivot):
- Seller retention <80% in any month
- Auction success rate <60%
- Clearing prices >15% below external markets (exploitation)
- Sustained seller attrition (3 consecutive months declining)

---

**DO NOT (Unchanged)**:
- ✗ Over-engineer complex multi-round or hybrid mechanisms
- ✗ Launch public bids without reserves (CATASTROPHIC)
- ✗ Ignore seller attrition metrics (death spiral risk)
- ✗ Assume "it will work out" for public bids (evidence suggests otherwise)

---

## References

### Blockchain Auction Implementations

**Gnosis Auction (EasyAuction)**:
- Platform: https://gnosis-auction.eth.link/
- Documentation: https://github.com/Gnosis-Auction/auction-contracts
- Medium articles: Gnosis PM blog

**CoW Swap**:
- Documentation: https://docs.cow.fi/
- Batch auction mechanism: https://docs.cow.fi/cow-protocol/concepts/introduction/batch-auctions

**Metaplex (Deprecated)**:
- GitHub: https://github.com/metaplex-foundation/metaplex
- Issue tracker: Known bugs and deprecation notices

### Traditional Finance Auctions

**US Treasury Auctions**:
- Malvey & Archibald (1998): "Uniform-Price Auctions: Update of the Treasury Experience"
- Treasury Direct: https://www.treasurydirect.gov/

**FCC Spectrum Auctions**:
- Cramton, P.: "Spectrum Auctions" (2002)
- FCC Auction Information: https://www.fcc.gov/auction-formats

**Stock Exchange Opening Auctions**:
- NYSE opening auction documentation
- NASDAQ opening cross mechanism

### Academic Research

**Auction Theory**:
- Vickrey (1961): Revenue equivalence
- Milgrom & Wilson (2020): Nobel Prize auction work
- Ausubel & Cramton (2002): Demand reduction

**Blockchain MEV**:
- Flashbots Research: MEV-Explore data
- Budish et al (2015): Frequent batch auctions

### Atomica Documentation

- docs/game-theory/auction-requirements.md: Full requirement specification
- docs/game-theory/uniform-price-auctions.md: Sealed-bid mechanism (preferred)
- docs/technical/timelock-bids.md: Drand timelock encryption
- docs/game-theory/shill-bidding-analysis.md: Attack analysis
- docs/game-theory/cpmm-vs-auction-comparison.md: Alternatives comparison

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Status**: Complete - Decision Framework for Public-Bid Fallback
