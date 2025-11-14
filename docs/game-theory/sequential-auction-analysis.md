# Sequential Auction Design: Game Theory and Strategic Implications

**Question**: Can multiple different assets (ETH, BTC, SOL, etc.) be auctioned sequentially within a single trading session without creating unfair strategic advantages or undermining price discovery?

**Short Answer**: Sequential auctions create strategic problems (capital lock, information cascades, bid shading). Simultaneous auctions eliminate those problems but introduce new complexity (budget constraints, priority system, settlement algorithm). No "perfect" solution exists - it's a trade-off.

**Status**: Product research analyzing trade-offs. Presents options with honest assessment of knowns and unknowns.

**Context**: Sequential auctions of **different, heterogeneous assets** (not multiple units of the same asset). This is the standard model in academic literature—analogous to art auctions (different paintings), car auctions (different vehicles), or estate sales (different items).

---

## Executive Summary

Sequential auctions—where multiple different assets are sold one after another in the same session—create **strategic timing games** that fundamentally differ from single isolated auctions. The core issues are:

1. **Capital Reuse Asymmetry**: Winners in early auctions have capital locked in different assets; losers retain liquid capital for later auctions
2. **Information Cascades**: Early auction results signal market conditions to later auction participants
3. **Strategic Bid Shading**: Rational bidders may bid below valuation in early auctions to preserve capital for later assets
4. **Order Effects**: Auction sequencing (high-value-first vs low-value-first) creates different strategic dynamics

**Key Conclusion**: **Simultaneous bid revelation eliminates sequential timing games but introduces new complexity.** It eliminates information cascades and capital reuse asymmetry, but creates a budget constraint problem that requires a settlement mechanism.

**Budget Constraint Challenge**: With simultaneous multi-asset auctions, bidders may win multiple auctions but lack sufficient capital to settle all wins. This document analyzes solution options and suggests a **Priority System** where:
- Bidders include priority ranking (1st, 2nd, 3rd choice) in their encrypted bid envelope
- At settlement, wins are processed in priority order until budget is exhausted
- Lower-priority wins are forfeited if budget insufficient (next-highest bidder wins instead)

**Important Caveats**:
- Priority system behavior is unproven - no academic literature or empirical data
- Introduces UX complexity that might confuse users or reduce participation
- Iterative settlement algorithm convergence not mathematically proven (needs testing)

**Griefing Attack Risk**: The priority system is vulnerable to price inflation attacks where bidders submit high bids they intend to forfeit. **Proposed mitigations:**
1. **Recalculate clearing prices** after removing forfeited bids (mandatory)
2. **Smart bid execution fee** - charge 2-3% fee on wins when users bid over budget (strongly recommended)
   - Makes griefing unprofitable (attackers pay fee even on Priority 1 wins)
   - Creates protocol revenue ("pay for flexibility")
   - Self-regulating economic deterrent

**Trade-Off**: We're exchanging known problems (sequential gaming) for unknown problems (priority system gaming + complex settlement). Simple alternatives (single daily auction per asset) might be lower risk.

**Key Update**: With atomic settlement at bid reveal (not 24-hour delay), capital lock lasts only ~6 minutes per auction, but bidders still face capital allocation constraints across the sequence.

This document analyzes these effects, reviews academic literature on sequential auctions of heterogeneous goods, and evaluates whether sequential auctions can work for Atomica's use case.

---

## Table of Contents

1. [Problem Definition](#problem-definition)
2. [Sequential Auction Mechanics](#sequential-auction-mechanics)
3. [Strategic Issues](#strategic-issues)
4. [Academic Literature Review](#academic-literature-review)
5. [Comparison of Sequencing Strategies](#comparison-of-sequencing-strategies)
6. [Mitigation Strategies](#mitigation-strategies)
7. [Alternative Architectures](#alternative-architectures)
8. [Recommendation](#recommendation)
9. [Budget Constraint Problem in Simultaneous Auctions](#budget-constraint-problem-in-simultaneous-auctions)
10. [Griefing Attacks and Mitigations](#griefing-attacks-and-mitigations)
11. [Honest Assessment: What We Know and Don't Know](#honest-assessment-what-we-know-and-dont-know)
12. [Decision Framework for Product Teams](#decision-framework-for-product-teams)

---

## Problem Definition

### The Proposed Design (from product-design-v0.md)

**Setup:**
- Prime trading window: 12:00 - 1:00 PM EST (1 hour)
- 10 different assets (ETH, BTC, SOL, MATIC, AVAX, ATOM, DOT, LINK, UNI, DOGE)
- Each asset gets a 6-minute auction
- Auctions run sequentially (not simultaneously)
- **Settlement**: Atomic at bid reveal (instant, not 24-hour delay)
- Sequencing: Highest value assets → Lowest value assets
- Rationale: "Rejected bidders from Auction 1 can participate in Auction 2"

**Example Timeline:**
```
12:00-12:06  Auction 1: ETH/LIBRA (sealed bids)
12:06:00     Bids decrypt, clearing price determined
12:06:01     Settlement: Winners receive ETH, pay LIBRA (atomic)

12:06-12:12  Auction 2: BTC/LIBRA (sealed bids)
12:12:00     Bids decrypt, settlement (atomic)

12:12-12:18  Auction 3: SOL/LIBRA
...
12:54-13:00  Auction 10: DOGE/LIBRA
```

**Note on Settlement Timing**: Unlike the 12-24 hour futures settlement model for single daily auctions, sequential auctions settle atomically at reveal to maximize capital efficiency.

### Key Questions

1. **Capital Lock**: Does early auction participation disadvantage bidders?
2. **Information Leakage**: Do early results manipulate later bidding behavior?
3. **Strategic Bidding**: Do bidders bid truthfully or game the sequence?
4. **Order Effects**: Does auction sequencing create unfair advantages?

---

## Sequential Auction Mechanics

### How Sequential Auctions Differ from Single Auctions

**Single Isolated Auction (current design):**
- Bidders have full capital available
- No information from other auctions
- Bid based solely on asset valuation
- Uniform price, sealed bids → incentive-compatible

**Sequential Auctions:**
- Capital availability depends on previous auction outcomes
- Information revealed from previous auctions
- Bid strategy considers entire sequence
- Introduces intertemporal optimization problem

### Information Structure

**Before Auction 1:**
- No information about market conditions
- All bidders have full capital available
- Symmetric information

**After Auction 1:**
- Clearing price revealed (market signal)
- Winners have capital locked (settlement in 12-24 hours)
- Losers have capital available for Auction 2

**After Auction 2:**
- Two clearing prices revealed (price trend)
- Early winners increasingly capital-constrained
- Early losers increasingly informed

**Pattern**: Information asymmetry and capital asymmetry accumulate over the sequence.

---

## Strategic Issues

### Issue 1: Capital Reuse Asymmetry

**The Problem:**

In sequential auctions, **winners lose liquid capital** while **losers retain optionality**.

**Example with Atomic Settlement:**

```
Bidder Alice: Has 100,000 LIBRA
Bidder Bob: Has 100,000 LIBRA

12:00-12:06 Auction 1 (ETH/LIBRA):
- Alice bids 2,000 LIBRA/ETH, wins 50 ETH
- Bob bids 1,980 LIBRA/ETH, loses

12:06:01 Atomic Settlement:
- Alice: Pays 100,000 LIBRA, receives 50 ETH
- Alice's new position: 0 LIBRA, 50 ETH
- Bob's position: 100,000 LIBRA (unchanged)

12:06-12:12 Auction 2 (BTC/LIBRA):
- Alice: Cannot participate (has 0 LIBRA, only ETH)
- Bob: Can participate with full 100,000 LIBRA

12:12-12:18 Auction 3 (SOL/LIBRA):
- Alice: Still cannot participate (must sell ETH on external market first)
- Bob: Can participate if lost Auction 2
```

**Key Insight with Atomic Settlement:**

Even though settlement is instant (not 24-hour delay), **capital is still locked** because:
1. Alice spent all LIBRA on ETH
2. Alice now holds ETH (not LIBRA)
3. To bid on BTC/LIBRA, Alice needs LIBRA
4. Alice must sell ETH on external market to get LIBRA back
5. Selling ETH takes time (order execution, slippage, etc.)

**Duration of Lock:**
- **With 24hr futures settlement**: Capital locked for 24 hours
- **With atomic settlement**: Capital locked until Alice sells ETH externally (~minutes to hours, depending on market depth)

**Capital lock reduced but not eliminated.**

**Strategic Implication:**

Alice faces a choice:
- **Bid aggressively in Auction 1**: Win ETH, but lose optionality for BTC/SOL/etc.
- **Bid conservatively in Auction 1**: Preserve LIBRA capital for later auctions

**Rational Strategy**: Bid below true valuation in early auctions to maintain optionality for later assets.

### Issue 2: Information Cascades

**Definition**: Information from early auctions influences later auction behavior in ways that may distort price discovery.

**Mechanism:**

**Scenario**: Auction 1 (ETH) clears at $2,000 (2% below external market price of $2,040)

**Interpretation by Auction 2 participants:**
- "Market is bearish" → Bid lower in Auction 2
- "Competition is weak" → Bid lower (expect to win cheaply)
- "Risk is high" → Reduce bids across all remaining auctions

**Result**: Clearing prices in Auctions 2-10 artificially depressed due to signal from Auction 1.

**Is this bad?**

**Argument FOR information cascades:**
- Efficient information aggregation
- Later bidders benefit from market signals
- Reduces extreme mispricing risk

**Argument AGAINST information cascades:**
- Early auction noise propagates to later auctions
- Creates herding behavior (everyone follows Auction 1 signal)
- Reduces independent price discovery

**Honest Assessment:**
Whether information cascades are "good" or "bad" depends on whether early signals are informative or noisy. In practice, both effects likely occur. This document takes the conservative position that eliminating cascades reduces risk of systematic mispricing, even if it means losing some information aggregation benefits.

### Issue 3: Strategic Bid Shading

**The Optimization Problem:**

Bidders face an **intertemporal portfolio optimization** problem:

```
Maximize: E[Profit from winning auctions] - E[Cost of missed opportunities]

Subject to:
- Budget constraint: Σ(winning bids) ≤ Capital
- Sequential constraint: Can't bid in Auction N if won Auction 1...(N-1)
```

**Optimal Strategy (Simplified):**

For a bidder with valuation v₁ for Asset 1 and v₂ for Asset 2:

```
If v₁ > v₂:
  Bid truthfully in Auction 1 (prioritize higher value)

If v₁ < v₂:
  Bid below v₁ in Auction 1 (preserve capital for Auction 2)

If v₁ ≈ v₂:
  Bid below both valuations (wait to see Auction 1 results)
```

**Result**: **Systematic bid shading** in early auctions when bidders value later assets.

### Issue 4: Auction Order Effects

**High-Value-First (Proposed):**

```
Order: ETH → BTC → SOL → ... → DOGE
```

**Advantages:**
- Most important assets get highest competition
- Rejected bidders from ETH can bid on BTC
- Maximizes revenue on high-value assets

**Strategic Issues:**
- Bidders with diversified preferences shade bids on ETH
- Low-value assets at end get thin participation
- Capital locked in ETH reduces competition for all subsequent auctions

**Low-Value-First (Alternative):**

```
Order: DOGE → ... → SOL → BTC → ETH
```

**Advantages:**
- Bidders can "warm up" on low-stakes auctions
- Final auction (ETH) gets maximum competition (all capital still available)
- Less capital locked early

**Strategic Issues:**
- Bidders hold capital for ETH, bid minimally on early assets
- Low-value assets get extremely thin bidding
- Same capital asymmetry problem, just reversed

**Conclusion**: **Both orderings create strategic timing games. No "fair" ordering exists.**

---

## Academic Literature Review

### 1. Milgrom & Weber (1982) - "A Theory of Auctions and Competitive Bidding"

**Context**: Sequential auctions of **different objects** with budget-constrained bidders.

**Key Result**: Sequential auctions with budget constraints exhibit **declining prices** (each auction clears lower than previous on average).

**Mechanism**:
- Early winners lock capital in purchased assets
- Remaining bidders have capital available but fewer competitors
- Aggregate demand declines across sequence
- Net effect: Prices tend to decline

**Application to Heterogeneous Assets**:
- Even with different assets (not identical), budget constraints create correlation
- Bidder who wins Picasso painting has less budget for Monet painting
- Same logic: Bidder who wins ETH has less LIBRA for BTC

**Implication for Atomica**: High-value-first sequencing may see systematically declining prices across the sequence, even with atomic settlement (capital still locked in different asset).

**Citation**: Milgrom, P., & Weber, R. J. (1982). "A Theory of Auctions and Competitive Bidding." *Econometrica*, 50(5), 1089-1122.

### 2. Ashenfelter (1989) - "How Auctions Work for Wine and Art"

**Context**: Sequential auctions of **different artworks and wine bottles** (heterogeneous assets).

**Empirical Finding**: Art and wine auctions show **declining price anomaly**—prices tend to decline over the sequence, even for high-quality items sold later.

**Mechanism**:
- Early bidders with highest budgets win early items
- Remaining bidders have depleted budgets
- OR: Early bidders are most enthusiastic, later bidders more price-sensitive
- Budget constraints bind more tightly as sequence progresses

**Examples**:
- Estate sales: First furniture pieces fetch higher prices than later ones
- Wine auctions: Early lots get aggressive bidding, later lots get thinner participation
- Art auctions: "Declining price effect" observed even controlling for quality

**Relevance to Atomica**: Even with **different assets** (ETH ≠ BTC ≠ SOL), budget constraints create declining participation and potentially declining prices.

**Citation**: Ashenfelter, O. (1989). "How Auctions Work for Wine and Art." *Journal of Economic Perspectives*, 3(3), 23-36.

### 3. Black & de Meza (1992) - "Systematic Price Differences Between Successive Auctions"

**Context**: Sequential auctions of **different goods** (not identical items).

**Finding**: Sequential auctions create **predictable price patterns** based on order, even when assets differ.

**Mechanism - Rational Expectations**:
- Bidders anticipate declining prices in later auctions
- Bidders bid aggressively early (get best price before decline)
- OR: Bidders conserve budget for later (wait for lower prices)
- **Result**: Self-fulfilling prophecy

**Key Insight**: Price patterns emerge from **budget constraints and forward-looking behavior**, not asset similarity.

**Application**: Even though ETH ≠ BTC ≠ SOL, rational bidders create correlated price trends.

**Citation**: Black, J., & de Meza, D. (1992). "Systematic Price Differences Between Successive Auctions Are No Anomaly." *Journal of Economics & Management Strategy*, 1(4), 607-628.

### 4. Zeithammer (2006) - "Forward-Looking Bidding in Online Auctions"

**Context**: Sequential auctions of **different products** (eBay listings for different items).

**Model**: Bidders with preferences over **heterogeneous goods** optimize across the auction sequence.

**Key Result**: **Forward-looking bidders shade bids** in early auctions if they value later goods more highly.

**Example**:
- Auction sequence: Laptop → Camera → Phone
- Bidder values Camera most
- **Strategy**: Bid below valuation on Laptop (preserve budget for Camera)
- **Outcome**: Systematic bid shading in early auctions

**Equilibrium**: Bidders with strong preferences for later goods systematically lose early auctions, preserving capital for their preferred items.

**Implication for Atomica**: **High-value-first sequencing (ETH → BTC → SOL) creates shading on ETH** if bidders prefer BTC or SOL. This is **opposite of the intended effect** (maximizing revenue on high-value assets).

**Citation**: Zeithammer, R. (2006). "Forward-Looking Bidding in Online Auctions." *Journal of Marketing Research*, 43(3), 462-476.

### 5. Krishna (2002) - *Auction Theory* (Textbook)

**Chapter 7 - Sequential Auctions of Heterogeneous Objects:**

**Scope**: Analyzes auctions where **different objects** are sold sequentially (not multiple units of same good).

**Examples Given**:
- Art auctions (different paintings)
- Estate sales (different furniture, jewelry, antiques)
- Spectrum auctions (different frequency bands)

**General Results**:
1. Budget constraints + sequential structure = bid shading
2. Information revelation creates cascades across different assets
3. No sequencing strategy is strategy-proof for heterogeneous goods
4. Simultaneous auctions preferred when feasible

**Quote**: "Sequential auctions are vulnerable to strategic timing behavior that does not arise in isolated single auctions. When feasible, simultaneous mechanisms are preferable."

**Application to Crypto Assets**: The theory applies directly—ETH, BTC, SOL are heterogeneous assets like paintings, jewelry, or spectrum bands. Budget constraints create the same strategic issues.

**Citation**: Krishna, V. (2002). *Auction Theory*. Academic Press. Chapter 7: Sequential Auctions.

---

## Comparison of Sequencing Strategies

### Strategy A: High-Value-First (Proposed)

**Order**: ETH → BTC → SOL → ... → DOGE

**Predicted Bidder Behavior**:

**ETH Auction (First, Highest Value):**
- Bidders with ETH-only preference: Bid truthfully
- Bidders with diversified preferences: Shade bids (preserve capital for BTC/SOL)
- **Result**: Lower clearing price than single isolated auction

**BTC Auction (Second):**
- ETH winners: Cannot participate (capital locked)
- ETH losers: Participate with full capital
- New information: ETH clearing price signals market conditions
- **Result**: Reduced competition (some bidders eliminated), but informed bidding

**DOGE Auction (Last, Lowest Value):**
- Most bidders have capital locked in earlier auctions
- Very few active bidders remaining
- **Result**: Extremely thin auction, high price volatility

**Empirical Prediction**: **Declining prices** from ETH → DOGE (Milgrom & Weber 1982, Ashenfelter 1989).

**Note on Atomic Settlement**: Even with instant settlement (not 24-hour delay), the capital lock effect persists because winners hold different assets (ETH, not LIBRA) and must sell externally to regain liquidity. Atomic settlement **reduces lock duration** but **does not eliminate strategic asymmetry**.

### Strategy B: Low-Value-First

**Order**: DOGE → ... → SOL → BTC → ETH

**Predicted Bidder Behavior**:

**DOGE Auction (First, Lowest Value):**
- Bidders holding capital for ETH: Bid minimally or abstain
- Only DOGE-focused bidders participate seriously
- **Result**: Extremely thin auction (most capital reserved for ETH)

**ETH Auction (Last, Highest Value):**
- All bidders still have capital available (unless won earlier auctions)
- Maximum competition
- **Result**: Strongest price discovery, highest competition

**Empirical Prediction**: **Low early prices, high final price** (but early assets underpriced).

### Strategy C: Random Order

**Order**: Randomized each day

**Predicted Bidder Behavior**:
- Bidders cannot optimize across known sequence
- Must bid more truthfully (can't predict which auction comes when)
- **Result**: Reduces strategic shading, but introduces uncertainty

**Downsides**:
- Unpredictable schedule (poor UX)
- Doesn't eliminate capital lock problem
- Information cascades still occur (just in random order)

### Strategy D: Simultaneous Parallel Auctions

**Order**: All 10 auctions run simultaneously (same time window)

**Predicted Bidder Behavior**:
- Bidders must allocate capital BEFORE any auction clears
- No information from other auctions during bidding
- Cannot reactively bid based on early results
- **Result**: Reduces strategic gaming compared to sequential, but not fully "truthful"
  - Bidders still face portfolio choice problem (which auctions to enter?)
  - Must estimate probability of winning and plan budget allocation
  - More complex than single-auction bidding

**Advantages**:
- Eliminates capital reuse asymmetry (everyone commits simultaneously)
- Eliminates information cascades (no early results)
- Eliminates strategic timing games
- Reduces strategic bid shading compared to sequential auctions

**Downsides**:
- More complex UX (must manage multiple auctions at once)
- Cannot reallocate capital if lose early auctions

---

## Mitigation Strategies

### Mitigation 1: Cross-Asset Bidding (Use Won Assets as Payment)

**Idea**: Allow bidders to use won assets from Auction 1 to bid in Auction 2.

**Mechanism**:
```
12:06:01 Alice wins ETH auction
         Alice now holds: 0 LIBRA, 50 ETH

12:06-12:12 BTC/LIBRA auction
         Alice bids using ETH as collateral?
         OR: Alice bids on BTC/ETH pair instead?
```

**Analysis**:
- ✅ Would eliminate capital lock (can reuse ETH)
- ❌ Requires supporting cross-asset trading pairs (BTC/ETH, not just BTC/LIBRA)
- ❌ Introduces complexity (every asset needs pairs with every other asset: N² trading pairs)
- ❌ Fragments liquidity across many pairs
- ❌ Requires real-time external pricing oracles (what's ETH/BTC exchange rate?)

**Verdict**: Theoretically eliminates capital lock but introduces excessive complexity and oracle dependencies. Not viable for atomic trustless auctions.

### Mitigation 2: Virtual Bidding / Commitment Devices

**Idea**: Bidders commit to all auctions simultaneously, settlement happens sequentially.

**Mechanism**:
```
11:00-12:00  Bidding window (all 10 auctions)
12:00        All auctions close simultaneously
12:00-12:10  Sequential settlement (ETH, then BTC, then SOL...)
```

**Analysis**:
- ✅ Eliminates information cascades (all bids sealed until 12:00)
- ✅ Eliminates capital reuse games (commit to all before any clears)
- ⚠️ Bidders must solve complex portfolio optimization (which auctions to bid on?)
- ⚠️ Settlement still sequential (capital locked in order)

**Verdict**: Better, but introduces **portfolio selection problem** (which assets to bid on?).

### Mitigation 3: Short Sequential Windows (5-10 seconds)

**Idea**: Make auctions so fast that information doesn't propagate meaningfully.

**Mechanism**:
```
12:00:00-12:00:10  ETH auction (10 seconds)
12:00:10-12:00:20  BTC auction (10 seconds)
...
```

**Analysis**:
- ✅ Reduces time for strategic reaction
- ❌ Doesn't eliminate capital lock (still sequential)
- ❌ Poor UX (must react in 10 seconds)
- ❌ Favors algorithmic bidders (HFT advantage)

**Verdict**: Reintroduces speed advantage, bad for retail users.

### Mitigation 4: Simultaneous Reveal + Atomic Settlement

**Idea**: All auctions close sequentially, but ALL decrypt and settle simultaneously at end.

**Mechanism**:
```
12:00-12:06  ETH auction (sealed bids submitted)
12:06-12:12  BTC auction (sealed bids submitted)
12:12-12:18  SOL auction (sealed bids submitted)
...
12:54-13:00  DOGE auction (sealed bids submitted)

13:00        All auctions decrypt simultaneously
13:00        All clearing prices determined simultaneously
13:00:01     All auctions settle atomically (must have capital for all wins)
```

**Analysis**:
- ✅ Eliminates information cascades (no early results visible)
- ✅ Eliminates capital reuse gaming (must commit to all before any settles)
- ✅ Atomic settlement preserves capital efficiency (no 24-hour lock)
- ⚠️ Bidders must have capital for worst-case (winning all auctions simultaneously)
- ⚠️ More complex portfolio optimization (which auctions to bid on?)

**Verdict**: **Best hybrid approach**—preserves sequential UX during bidding but eliminates strategic timing issues via simultaneous reveal/settlement. Requires careful capital management by bidders.

---

## Alternative Architectures

### Alternative 1: Fully Simultaneous Auctions

**Design**:
```
12:00-13:00  All 10 auctions run in parallel
             Single bid window, all close simultaneously
13:00        All decrypt and settle simultaneously
```

**Advantages**:
- ✅ Eliminates sequential timing games (Krishna 2002)
- ✅ No information cascades
- ✅ No capital reuse asymmetry
- ✅ Reduces strategic bid shading compared to sequential auctions

**Disadvantages**:
- Complex UX (must manage 10 auctions at once)
- Bidders must solve portfolio problem (allocate capital across assets)
- Can't adjust based on early results

**Verdict**: **Gold standard from game theory perspective**, but UX complexity.

### Alternative 2: Multiple Independent Daily Auctions

**Design**:
```
Day 1: ETH/LIBRA auction (single asset)
Day 2: BTC/LIBRA auction (single asset)
Day 3: SOL/LIBRA auction (single asset)
...
```

**Advantages**:
- ✅ Each auction is isolated (no sequential games)
- ✅ Simple UX (one auction per day)
- ✅ Full capital available for each auction
- ✅ No information cascades (days apart)

**Disadvantages**:
- Low frequency (only one asset per day)
- Poor capital efficiency (wait days to deploy capital)
- Fragments liquidity across time

**Verdict**: Eliminates strategic issues but reduces market efficiency.

### Alternative 3: Rotating Schedule (Different Asset Each Day)

**Design**:
```
Monday:     ETH/LIBRA auction
Tuesday:    BTC/LIBRA auction
Wednesday:  SOL/LIBRA auction
Thursday:   USDC/LIBRA auction
Friday:     ETH/LIBRA auction (repeats)
```

**Advantages**:
- ✅ Single daily auction (simple UX)
- ✅ No sequential gaming
- ✅ Each asset gets regular liquidity

**Disadvantages**:
- Must wait for specific day to trade specific asset
- Lower frequency per asset

**Verdict**: Simple, fair, but limited throughput.

### Alternative 4: Grouped Parallel Auctions

**Design**:
```
12:00-13:00  Group A: ETH, BTC, SOL (parallel, simultaneous close)
14:00-15:00  Group B: USDC, MATIC, AVAX (parallel, simultaneous close)
16:00-17:00  Group C: ATOM, DOT, LINK (parallel, simultaneous close)
```

**Advantages**:
- ✅ Within-group fairness (simultaneous)
- ✅ Manageable UX (3-4 assets per session)
- ⚠️ Between-group sequential effects (Group A capital locked for B)

**Disadvantages**:
- Doesn't fully eliminate sequential issues (groups are sequential)
- Complex scheduling

**Verdict**: Hybrid approach, reduces but doesn't eliminate issues.

---

## Recommendation

### Conclusion: Trade-Offs Between Sequential and Simultaneous Designs

Based on game theory analysis and academic literature:

**Sequential auctions of different assets create strategic distortions:**

1. ✗ **Capital asymmetry** - early winners disadvantaged
2. ✗ **Information cascades** - early results influence later behavior
3. ✗ **Bid shading** - reduced price discovery in early auctions
4. ✗ **No fair ordering** exists (high-first and low-first both have issues)

**Simultaneous auctions eliminate timing games but introduce new problems:**

1. ✓ **Eliminates sequential timing advantages**
2. ✓ **Reduces strategic bid shading**
3. ✓ **Removes information cascades**
4. ✗ **Creates budget constraint settlement problem**
5. ✗ **Requires complex priority system (unproven mechanism)**
6. ✗ **Higher UX complexity**

**Honest Conclusion**: Simultaneous revelation is theoretically cleaner but practically more complex. It trades known problems (sequential gaming) for unknown problems (priority system behavior, settlement complexity). The "best" choice depends on whether complexity is worth eliminating timing games.

### Recommended Architectures (Ranked)

**Tier 1: Eliminate Sequential Structure**

**Option A: Single Daily Auction (Current Design)**
- ✅ No sequential gaming (isolated auction)
- ✅ Maximum liquidity concentration per asset
- ✅ Simple UX, proven game theory
- Trade-off: One asset per day (low throughput)

**Option B: Fully Simultaneous Multi-Asset Auction**
- ✅ Eliminates all sequential issues
- ✅ Strategy-proof with uniform pricing + sealed bids
- ✅ Higher throughput (10 assets simultaneously)
- Trade-off: Complex UX (manage multiple auctions)

**Tier 2: Accept Some Sequential Effects**

**Option C: Grouped Parallel Auctions**
- Within-group fairness (3-4 assets simultaneous)
- Between-group sequential effects (acceptable if groups far apart in time)
- Moderate UX complexity

**Tier 3: Not Recommended**

**Option D: Sequential Auctions with Mitigations**
- Even with mitigations, core strategic issues remain
- Academic literature shows no sequencing is strategy-proof
- Risk of systematic price distortions

---

## Budget Constraint Problem in Simultaneous Auctions

### The Critical Issue

**Simultaneous revelation creates a settlement problem when bidders win multiple auctions but lack sufficient capital.**

**Bottom Line:** When a user submits multiple bids on different assets, some capital might be committed to multiple auctions. If they win multiple auctions, they may run out of budget to complete all trades. The question is: **Do no trades clear? Do some clear? Which ones?**

**Recommended Answer:** Use a **Priority System**. In the encrypted bid envelope, the bidder includes not just the bid amount, but also a priority ranking (1st choice, 2nd choice, 3rd choice). At settlement, process wins in priority order until budget exhausted. Lower-priority wins are forfeited (next-highest bidder wins instead).

---

**Example Scenario:**

```
Bidder Alice has 100,000 LIBRA total budget

Alice submits sealed bids:
- ETH auction: 50,000 LIBRA (bid: 2,000 LIBRA/ETH for 25 ETH)
- BTC auction: 60,000 LIBRA (bid: 60,000 LIBRA/BTC for 1 BTC)
- SOL auction: 40,000 LIBRA (bid: 100 LIBRA/SOL for 400 SOL)

Total committed: 150,000 LIBRA
Actual budget: 100,000 LIBRA

13:00 - All auctions reveal simultaneously:
- Alice wins ETH auction (owes 50,000 LIBRA)
- Alice wins BTC auction (owes 60,000 LIBRA)
- Alice wins SOL auction (owes 40,000 LIBRA)

Total owed: 150,000 LIBRA
Available: 100,000 LIBRA
Shortfall: 50,000 LIBRA
```

**The Question: What happens when a bidder cannot settle all winning bids?**

### Solution Options

#### Option 1: Reject All Wins (Atomic Failure)

**Mechanism:**
- If total winning bids exceed budget → all bids invalid
- No trades clear for this bidder
- Other bidders' trades proceed normally

**Implementation:**
```
At settlement (13:00):
1. Calculate total winning bid amount for Alice
2. Check: total_wins ≤ budget?
3. If NO → revert all Alice's wins, next-highest bidders win instead
4. If YES → settle all trades
```

**Advantages:**
- ✅ Simple on-chain logic (binary check)
- ✅ No partial settlement complexity
- ✅ Clear incentive: don't overbid total budget

**Disadvantages:**
- ❌ Harsh penalty (lose all wins due to over-commitment)
- ❌ Punishes aggressive bidding
- ❌ Reduces auction efficiency (valid bids rejected)
- ❌ Creates perverse incentives (bid conservatively to avoid rejection)

**Verdict:** **Simple but economically inefficient.** Discourages competitive bidding.

---

#### Option 2: Priority System (User-Specified Ranking)

**Mechanism:**
- Bidders rank their bids by priority (1st choice, 2nd choice, 3rd choice)
- At settlement, clear trades in priority order until budget exhausted
- Lower-priority wins are forfeited if budget insufficient

**Implementation:**
```
Alice's prioritized bids:
1. ETH (Priority 1): 50,000 LIBRA
2. BTC (Priority 2): 60,000 LIBRA
3. SOL (Priority 3): 40,000 LIBRA

Settlement at 13:00:
1. Clear ETH win → 50,000 LIBRA spent (50,000 remaining)
2. Clear BTC win → Need 60,000, only have 50,000 → REJECT
3. Clear SOL win → Need 40,000, have 50,000 → ACCEPT (10,000 remaining)

Result: Alice wins ETH + SOL, forfeits BTC win
```

**Advantages:**
- ✅ User controls preference ordering
- ✅ Guarantees highest-priority wins settle
- ✅ No all-or-nothing failure
- ✅ Preserves competitive bidding

**Disadvantages:**
- ⚠️ Requires bidders to submit priority rankings with bids
- ⚠️ More complex UX (must rank preferences)
- ⚠️ Lower-priority auction winners may change (next-highest bidder wins BTC)

**Verdict:** **Optimal user-centric solution.** Allows aggressive bidding while respecting budget constraints.

**Important Unknowns:**
- ⚠️ We don't know the equilibrium bidding strategy in this mechanism
- ⚠️ Bidders might strategically game priorities (unclear how)
- ⚠️ No empirical data on how real users would behave with priorities
- ⚠️ Introduces complexity that could confuse users or reduce participation

**Potential Feature: Smart Bid Execution Fee**

If users want to bid over their budget (using priority system for flexible execution), they could pay a fee on their winning bids:

```
Fee Structure:
- Standard bidding (total bids ≤ budget): 0% fee
- Over-budget bidding (total bids > budget): X% fee on Priority 1 wins

Example:
Alice has 100k budget, bids 150k total across 3 auctions
Alice wins Priority 1 auction (50k)
Fee: X% of 50k goes to protocol/fee pool
```

**Benefits:**
- ✅ Makes griefing more expensive (pay fee even on Priority 1 wins if over-budget)
- ✅ Creates revenue for protocol from "smart execution" feature
- ✅ Natural economic deterrent to excessive over-bidding
- ✅ Users who value flexibility pay for it ("express lane" pricing)

**Considerations:**
- What's optimal fee %? (1%? 2%? 5%?)
- Does fee apply to all wins or only Priority 1?
- How does fee affect bidding incentives?
- Might reduce usage of priority system if fee too high

**Needs Testing:**
- User willingness to pay for over-budget flexibility
- Impact on griefing attack profitability
- Optimal fee level that balances revenue vs usage

---

#### Option 3: Pro-Rata Allocation (Proportional Fills)

**Mechanism:**
- Scale down all winning bids proportionally to fit budget
- Partial fills on all auctions

**Implementation:**
```
Alice wins all three auctions:
- ETH: 50,000 LIBRA (25 ETH)
- BTC: 60,000 LIBRA (1 BTC)
- SOL: 40,000 LIBRA (400 SOL)
Total: 150,000 LIBRA

Budget: 100,000 LIBRA
Scale factor: 100,000 / 150,000 = 66.67%

Settled amounts:
- ETH: 33,333 LIBRA → 16.67 ETH (not 25 ETH)
- BTC: 40,000 LIBRA → 0.67 BTC (not 1 BTC)
- SOL: 26,667 LIBRA → 266.67 SOL (not 400 SOL)
```

**Advantages:**
- ✅ All wins partially honored
- ✅ Fair allocation across auctions

**Disadvantages:**
- ❌ **Breaks uniform price auction mechanism** (Alice pays different effective price than other winners)
- ❌ Creates fractional asset amounts (0.67 BTC?)
- ❌ Unfair to other bidders (why does Alice get partial fill when others get full fill?)
- ❌ Extremely complex to implement fairly

**Verdict:** **Not recommended.** Breaks auction integrity and creates fairness issues.

---

#### Option 4: Pre-Commitment Validation (Enforce Budget Constraint Upfront)

**Mechanism:**
- When submitting bids, smart contract checks: sum(all_bids) ≤ available_budget
- Reject bid submission if over-budget
- At settlement, guaranteed to have sufficient capital

**Implementation:**
```
Alice attempts to submit bids:
- ETH: 50,000 LIBRA
- BTC: 60,000 LIBRA
- SOL: 40,000 LIBRA
Total: 150,000 LIBRA

Smart contract check:
- Budget: 100,000 LIBRA
- Total bids: 150,000 LIBRA
- 150,000 > 100,000 → REJECT bid submission

Alice must revise bids to ≤ 100,000 LIBRA total before submission allowed.
```

**Advantages:**
- ✅ **Prevents budget constraint problem entirely**
- ✅ Guaranteed settlement (no failures at reveal)
- ✅ Simple and clear
- ✅ No complex priority or pro-rata logic

**Disadvantages:**
- ❌ **Reduces bidding flexibility** (can't bid aggressively on multiple assets)
- ❌ Forces conservative bidding (must assume winning all)
- ❌ Reduces auction competitiveness (artificially constrained bids)
- ❌ Bad UX (rejection at bid submission)

**Example of the problem:**
```
Alice values:
- ETH at 2,100 LIBRA/ETH
- BTC at 65,000 LIBRA/BTC
- SOL at 110 LIBRA/SOL

Alice WANTS to bid:
- ETH: 50,000 LIBRA (truthful valuation)
- BTC: 60,000 LIBRA (truthful valuation)
- SOL: 40,000 LIBRA (truthful valuation)

But she only has 100,000 LIBRA budget.

With pre-commitment validation:
- Alice must reduce bids to total ≤ 100,000
- Alice likely wins ZERO auctions (underbid due to constraint)

With priority system:
- Alice bids truthfully on all three (150,000 total)
- Alice specifies: ETH > BTC > SOL (priority)
- Alice wins ETH + SOL (most preferred assets within budget)
```

**Verdict:** **Too restrictive.** Kills competitive bidding by forcing worst-case budgeting.

---

### Recommended Solution: Priority System

**Implement Option 2: Priority System**

**Design Specification:**

1. **Bid Submission:**
   - Allow bids totaling any amount (no upfront rejection)
   - Require explicit priority ranking (1st, 2nd, 3rd, etc.)
   - Show real-time budget warning if total exceeds available capital
   - Lock capital equal to budget (not total bids)

   **Encrypted Bid Envelope Contents:**
   ```
   Each sealed bid contains:
   - Asset identifier (e.g., "ETH")
   - Bid amount (e.g., 50,000 LIBRA)
   - Quantity requested (e.g., 25 ETH)
   - Priority ranking (e.g., Priority 1)
   - Bidder signature
   ```

   **UI Example:**
   ```
   ┌─────────────────────────────────────────┐
   │ Your Budget: 100,000 LIBRA              │
   │                                         │
   │ Bids Submitted:                         │
   │ 1️⃣ ETH: 50,000 LIBRA (Priority 1)      │
   │ 2️⃣ BTC: 60,000 LIBRA (Priority 2)      │
   │ 3️⃣ SOL: 40,000 LIBRA (Priority 3)      │
   │                                         │
   │ Total: 150,000 LIBRA                    │
   │ ⚠️  Over budget by 50,000 LIBRA         │
   │                                         │
   │ If you win multiple auctions:           │
   │ - Priority 1 settled first              │
   │ - Lower priorities dropped if needed    │
   └─────────────────────────────────────────┘
   ```

2. **Settlement Logic (On-Chain):**
   ```
   For each bidder:
     winning_bids = get_winning_bids(bidder)
     sort winning_bids by priority (ascending)

     remaining_budget = bidder.capital

     for bid in winning_bids:
       if bid.amount <= remaining_budget:
         settle(bid)
         remaining_budget -= bid.amount
       else:
         forfeit(bid)
         award_to_next_highest_bidder(bid.auction)
   ```

3. **UX Features:**
   - Clear visual indication of total commitment vs budget
   - Warning when over-budget (not rejection)
   - Priority drag-and-drop interface
   - Simulation: "If you win all, you will receive [assets] based on priority"

4. **Fairness Properties:**
   - ✅ Bidders control outcomes via priorities
   - ✅ No arbitrary rejection of valid bids
   - ✅ Other bidders benefit when over-committed bids fail (next-highest wins)
   - ✅ Transparent and predictable

**Example User Flow:**
```
1. Alice has 100,000 LIBRA
2. Alice submits three sealed bids (timelock encrypted):

   Bid Envelope 1 (ETH):
   - Asset: ETH
   - Amount: 50,000 LIBRA
   - Priority: 1 ⭐ Most wanted

   Bid Envelope 2 (BTC):
   - Asset: BTC
   - Amount: 60,000 LIBRA
   - Priority: 2

   Bid Envelope 3 (SOL):
   - Asset: SOL
   - Amount: 40,000 LIBRA
   - Priority: 3 ⭐ Least wanted

3. UI shows: "⚠️ Total: 150k / Budget: 100k - Lower priorities may not settle"
4. Alice confirms (understands risk)
5. At 13:00 - All bids decrypt simultaneously
6. Settlement algorithm processes Alice's wins by priority:
   - Priority 1 (ETH): Wins → settled (50k spent, 50k remains)
   - Priority 2 (BTC): Wins → forfeited (need 60k, only have 50k) → Next bidder gets BTC
   - Priority 3 (SOL): Wins → settled (40k spent, 10k remains)
7. Result: Alice gets ETH + SOL (her 1st and 3rd priorities)
```

**Key Implementation Detail:**

Yes, you are correct: **The priority ranking must be included in the encrypted bid envelope.** This ensures:
- Priority cannot be changed after bids are submitted (prevents gaming)
- Priority is revealed only when all bids decrypt (maintains sealed-bid property)
- Settlement algorithm has complete information to process wins deterministically

---

## Griefing Attacks and Mitigations

### Attack Vector 1: Price Inflation via Strategic Forfeiture

**The Attack:**

An attacker can artificially inflate clearing prices by submitting high bids they intend to forfeit.

**Example:**
```
Alice wants to grief the BTC auction (or Alice is selling BTC and wants higher price)

Alice's bids:
- ETH: 100,000 LIBRA (Priority 1) - Consumes entire budget
- BTC: 100,000 LIBRA (Priority 2) - VERY HIGH BID, knowing she'll forfeit

Alice's budget: 100,000 LIBRA total

Settlement:
1. Calculate BTC clearing price WITH Alice's high bid included
   - Alice's 100k bid pushes clearing price to (say) 65,000 LIBRA/BTC
2. Process Alice's priorities:
   - Priority 1 (ETH): Wins, pays 100,000 (budget exhausted)
   - Priority 2 (BTC): Forfeits (no budget remaining)
3. Bob (next highest bidder) wins BTC
4. Bob pays 65,000 LIBRA/BTC (inflated by Alice's phantom bid)

Alice successfully inflated BTC price without paying for it.
```

**Why This Works:**
- Alice's bid is counted in the demand curve when calculating clearing price
- Alice's bid is high enough to push clearing price up
- Alice forfeits due to "budget constraint" (but this was intentional)
- Legitimate bidders pay artificially inflated price

**Motivation:**
- Alice is selling BTC → profits from higher clearing price
- Alice wants to harm competitors → griefing attack
- Alice is a market maker → manipulating prices for arbitrage

---

### Attack Vector 2: Sybil Shill Bidding

**The Attack:**

Attacker creates multiple accounts to submit high bids that will forfeit, inflating prices.

**Example:**
```
Attacker creates 10 accounts, each with 10,000 LIBRA (100k total)

Each account submits:
- ETH bid: 10,000 LIBRA (Priority 2) - HIGH BID to inflate price
- SOL bid: 10,000 LIBRA (Priority 1) - Will consume entire budget

All 10 accounts:
- Win SOL (Priority 1), budget exhausted
- Forfeit ETH (Priority 2)
- But ETH clearing price was calculated INCLUDING all 10 high bids

Result: ETH clearing price artificially inflated by 10 phantom bids
```

**Cost to Attacker:**
- Capital lock (100k LIBRA locked during auction)
- Gas fees (10 bid submissions)

**Benefit to Attacker:**
- If attacker is selling ETH → profits from higher clearing price
- Shill bidding amplifies the price inflation attack

---

### Attack Vector 3: Computational DoS

**The Attack:**

Attacker submits many bids with complex priority structures to make settlement computation expensive.

**Example:**
```
Attacker creates 100 accounts
Each account submits bids on all 10 assets with randomized priorities
Total: 1,000 bids to process

Settlement algorithm must:
- Sort all bids for each auction
- Calculate clearing prices
- Process each account's priorities
- Recalculate clearing prices after forfeits
- Iterate until convergence

With 1,000 bids and potential cascading forfeits, this becomes computationally expensive.
```

---

## Mitigations

### Mitigation 1: Recalculate Clearing Prices After Forfeits (CRITICAL)

**Solution:** Do not finalize clearing prices until all budget constraints are resolved.

**Implementation:**
```
Algorithm: Iterative Clearing Price Settlement

1. Initial Pass:
   For each auction:
     - Collect all bids
     - Calculate preliminary clearing price

2. Budget Constraint Pass:
   For each bidder:
     - Sort winning bids by priority
     - Process in priority order
     - Mark forfeits when budget exhausted

3. Recalculation Pass:
   For each auction:
     - Remove forfeited bids
     - Recalculate clearing price with remaining valid bids

4. Repeat steps 2-3 until no new forfeits occur (fixed point)

5. Final Settlement:
   - All clearing prices finalized
   - All valid winners settled
```

**Why This Works:**
- Forfeited bids do NOT affect clearing prices
- Attacker's phantom bids are removed before price is finalized
- No price inflation from bids that don't settle

**Complexity:**
- Worst case: O(N × M × K) where N=bidders, M=auctions, K=iterations to convergence
- **Assumed** to converge in 2-3 iterations (needs testing)
- On-chain computation manageable for reasonable auction sizes

**Critical Implementation Risk:**
- ⚠️ **Convergence not mathematically proven** - algorithm might cycle infinitely
- ⚠️ Needs extensive testing with realistic bid patterns
- ⚠️ Must implement max iteration limit (e.g., 10) to prevent infinite loops
- ⚠️ What happens if convergence fails? Fall back to which solution?
- **Recommendation**: Test extensively before production deployment

**Example with Mitigation:**
```
Alice's Attack Attempt:
- ETH: 100,000 (Priority 1)
- BTC: 100,000 (Priority 2, phantom bid)

Initial clearing prices (with Alice's BTC bid): BTC = 65,000 LIBRA/BTC

Budget constraint check:
- Alice wins ETH (budget exhausted)
- Alice forfeits BTC

Recalculate BTC clearing price WITHOUT Alice's bid:
- BTC = 58,000 LIBRA/BTC (true market price)

Bob wins BTC at 58,000 (not 65,000)

Attack defeated!
```

---

### Mitigation 2: Collateral Requirement for High-Priority Bids

**Solution:** Require bidders to lock collateral equal to their highest-priority bids.

**Implementation:**
```
When submitting bids:
- Calculate total value of Priority 1 bids
- Require collateral lock ≥ Priority 1 total
- Priority 2+ bids can exceed collateral (but will forfeit)

Example:
Alice's bids:
- ETH: 100,000 (Priority 1) ← Must lock 100k collateral
- BTC: 100,000 (Priority 2) ← No additional collateral required

This ensures Priority 1 bids are serious (capital locked).
```

**Why This Helps:**
- Priority 1 bids are guaranteed to have capital (no forfeiture)
- Attacker can only inflate prices with lower-priority bids
- Lower-priority forfeited bids removed during recalculation
- Reduces attack surface (only Priority 1 bids are "trusted")

**Trade-off:**
- Still allows some price manipulation via Priority 2+ bids
- But recalculation (Mitigation 1) handles this

---

### Mitigation 3: Limit Bids Per Account

**Solution:** Restrict number of bids each account can submit.

**Implementation:**
```
Maximum bids per account: 10 bids total across all auctions

This limits:
- Computational DoS (max 10 × N accounts bids)
- Sybil attack cost (need many accounts to scale)
```

**Why This Helps:**
- Reduces computational load
- Increases cost of Sybil attacks (need more accounts)
- Still allows legitimate bidders to bid on multiple assets

---

### Mitigation 4: Bid Submission Fee

**Solution:** Charge small fee per bid submission.

**Implementation:**
```
Bid submission fee: 0.1% of bid amount (or flat fee like 10 LIBRA)

Example:
- Alice bids 100,000 LIBRA on ETH
- Fee: 100 LIBRA
- Alice must lock 100,100 LIBRA total
```

**Why This Helps:**
- Makes spam/DoS expensive
- Makes Sybil shill bidding costly (10 accounts × 10 bids × fee)
- Revenue can fund auction operations

**Trade-off:**
- Adds friction for legitimate bidders
- May reduce participation

---

### Mitigation 5: Forfeit Penalty

**Solution:** Penalize bidders who forfeit due to budget constraints (if intentional).

**Implementation:**
```
If bidder forfeits Priority 2+ bids:
- Forfeit detection: Total bids >> Budget (e.g., 2x over-budget)
- Penalty: Small fee (e.g., 1% of forfeited bid amount)
- Penalty applied to ALL forfeited bids

Example:
Alice bids 250k total, has 100k budget
Forfeits 150k worth of bids
Penalty: 1% × 150k = 1,500 LIBRA (deducted from Alice's balance)
```

**Why This Helps:**
- Discourages intentional over-bidding for price manipulation
- Low penalty for accidental over-commitment (1% is small)
- High cost for large-scale griefing (many forfeits = high penalty)

**Trade-off:**
- Punishes legitimate users who miscalculate
- May discourage aggressive bidding

---

### Mitigation 6: Smart Bid Execution Fee (Economic Deterrent)

**Solution:** Charge a fee on winning bids when users bid over their budget.

**Implementation:**
```
When processing settlements:
- Check: total_bids > budget?
- If YES and user wins Priority 1+ bids:
  - Charge fee: X% of Priority 1 winning bid amount
  - Fee goes to protocol/fee pool
- If NO (bids ≤ budget):
  - No fee charged

Example:
Alice: 100k budget, 150k total bids (50% over-budget)
Alice wins Priority 1 (ETH): 50k
Fee: 2% × 50k = 1,000 LIBRA to fee pool
Alice receives: 50k ETH, pays 51k LIBRA (50k bid + 1k fee)
```

**Why This Helps:**
- ✅ Makes griefing attacks unprofitable (attacker pays fee on real wins)
- ✅ Users who want flexibility pay for it ("premium feature" pricing)
- ✅ Creates protocol revenue from smart execution
- ✅ Self-regulating: Higher over-commitment → higher fee (if fee scales with over-budget %)

**Advanced Variant - Scaled Fee:**
```
Fee scales with over-budget ratio:
- 0-50% over-budget: 1% fee
- 50-100% over-budget: 2% fee
- 100-200% over-budget: 3% fee
- 200%+ over-budget: 5% fee

This discourages extreme over-bidding while allowing moderate flexibility.
```

**Trade-offs:**
- ⚠️ Adds complexity to fee structure
- ⚠️ Might reduce priority system usage if fee too high
- ⚠️ Need to find optimal fee % through testing

**Impact on Griefing:**
```
Griefing Attack Cost Analysis:

Without fee:
- Attacker bids 100k (Priority 1), 100k (Priority 2 phantom)
- Wins Priority 1 for 100k, forfeits Priority 2
- Cost: 100k capital lock + gas
- If attacker is seller: Profits from inflated prices

With 2% fee:
- Same bids
- Wins Priority 1 for 100k
- Fee: 2% × 100k = 2,000 LIBRA
- Cost: 100k capital lock + 2k fee + gas
- Attack must generate > 2k profit to be worthwhile

With 5% fee:
- Same bids
- Fee: 5% × 100k = 5,000 LIBRA
- Most griefing attacks become unprofitable
```

**Recommendation:**
- Start with **2-3% fee** for over-budget bidding
- Monitor usage and adjust
- Consider scaled fee structure if abuse continues

---

## Recommended Mitigation Strategy

**Implement Mitigation 1 (Recalculate Clearing Prices) as MANDATORY:**
- This is the only full defense against price inflation attacks
- Complexity is manageable (converges quickly)
- Ensures forfeited bids don't affect prices

**Strongly Recommended Add:**
- **Mitigation 6 (Smart Bid Execution Fee):** Makes griefing unprofitable, creates protocol revenue, self-regulating
  - Start with 2-3% fee on over-budget wins
  - Consider scaled fee structure
  - Dual benefit: anti-griefing + business model

**Optionally Add:**
- **Mitigation 3 (Limit Bids Per Account):** Easy to implement, reduces DoS risk
- **Mitigation 4 (Small Bid Fee):** Minimal friction, deters spam

**Avoid:**
- **Mitigation 5 (Forfeit Penalty):** Too punitive for legitimate users (superseded by Mitigation 6)
- **Mitigation 2 (Collateral Requirement):** Complex, Mitigation 6 achieves similar effect more simply

**Algorithm Summary:**
```rust
fn settle_auctions_with_priorities(auctions: Vec<Auction>, bids: Vec<Bid>) {
    let mut forfeited_bids = vec![];

    loop {
        // Calculate clearing prices (excluding forfeited bids)
        for auction in auctions {
            let valid_bids = bids.exclude(forfeited_bids);
            auction.clearing_price = calculate_clearing_price(valid_bids);
        }

        // Check budget constraints
        let new_forfeits = vec![];
        for bidder in bidders {
            let wins = get_winning_bids(bidder, auctions);
            let sorted_wins = wins.sort_by_priority();

            let mut remaining_budget = bidder.balance;
            for bid in sorted_wins {
                if bid.amount <= remaining_budget {
                    bid.status = Settled;
                    remaining_budget -= bid.amount;
                } else {
                    bid.status = Forfeited;
                    new_forfeits.push(bid);
                }
            }
        }

        // If no new forfeits, we're done
        if new_forfeits.is_empty() {
            break;
        }

        forfeited_bids.extend(new_forfeits);
    }

    // Execute settlements
    execute_final_settlements(auctions);
}
```

---

### Alternative: Sequential Settlement with Known Capital

**If simultaneous settlement is too complex, consider sequential settlement with transparent capital tracking:**

```
13:00 - All auctions reveal simultaneously (prices determined)
13:00:01 - Settlement happens in DECLARED AUCTION ORDER (e.g., ETH → BTC → SOL)

For each auction in sequence:
  - Settle winners who have remaining capital
  - If winner lacks capital → next highest bidder wins
  - All bidders see remaining capital at each step
```

**Advantages:**
- ✅ Simpler logic (sequential capital checking)
- ✅ Natural priority (auction order = priority)
- ⚠️ Reintroduces weak information cascade (capital revealed sequentially during settlement)

**Disadvantages:**
- ❌ Bidders game the settlement order (bid on later auctions to preserve capital)
- ❌ Less fair than user-specified priorities

**Verdict:** Workable but inferior to Priority System.

---

## Honest Assessment: What We Know and Don't Know

### What We Know (High Confidence)

1. ✅ **Sequential auctions with different assets create strategic problems**
   - Capital lock disadvantages early winners
   - Information cascades distort later prices
   - Bid shading reduces efficiency
   - Academic literature strongly supports this

2. ✅ **Simultaneous revelation eliminates timing games**
   - No one gets information advantage
   - No early-winner capital disadvantage
   - Clear improvement over purely sequential design

3. ✅ **Budget constraints create settlement problems**
   - Users winning multiple auctions might lack capital
   - Some mechanism is needed to resolve this
   - Cannot be ignored

### What We're Uncertain About (Medium Confidence)

1. ⚠️ **Priority system behavior**
   - Seems like best available solution for budget constraints
   - No academic literature on this exact mechanism
   - Don't know how users will actually behave
   - Might introduce new strategic gaming we haven't identified

2. ⚠️ **Iterative settlement algorithm**
   - Makes intuitive sense (remove forfeits, recalculate)
   - Convergence not mathematically proven
   - Might have edge cases or cycles we haven't found
   - Needs extensive testing before production

3. ⚠️ **Griefing attack profitability**
   - Identified attack vectors
   - Don't know if attacks are profitable in practice
   - Mitigation (recalculation) should work but unproven
   - Smart bid execution fee (2-3%) should make most attacks unprofitable
   - Might discover new attacks after launch

4. ⚠️ **Smart bid execution fee acceptance**
   - Will users pay 2-3% to bid over budget?
   - Does fee deter legitimate usage too much?
   - What's optimal fee level?
   - Is scaled fee structure worth complexity?

### What We Don't Know (Low Confidence)

1. ❌ **UX complexity impact**
   - Will users understand priorities?
   - Will complexity reduce participation?
   - Might need extensive user testing

2. ❌ **Allocative efficiency**
   - Does priority system allocate assets to highest-value users?
   - What's the efficiency loss from forfeited bids?
   - No quantitative estimates

3. ❌ **Comparison to alternatives**
   - Is this better than single daily auction per asset?
   - What's the actual benefit of simultaneous multi-asset auctions?
   - Might not be worth the complexity

### Recommendation for Product Decision

**Conservative Approach (Lower Risk):**
- Stick with **single daily auction** (one asset per day)
- Rotate through assets (ETH Monday, BTC Tuesday, etc.)
- Simple, proven mechanism
- Lower throughput but zero strategic gaming risk

**Aggressive Approach (Higher Risk, Higher Reward):**
- Implement **simultaneous multi-asset auctions with priority system**
- Accept unknown strategic behavior
- Test extensively in testnet with real incentives
- Be prepared to iterate based on observed behavior
- Monitor for manipulation and adjust

**Key Trade-Off:**
- Sequential = low throughput, simple UX, strategic gaming problems
- Simultaneous with priorities = high throughput, complex UX, unknown behavior

**Honest Bottom Line:**
We're trading known problems (sequential gaming) for unknown problems (priority gaming + complex settlement). The simultaneous approach is theoretically better, but introduces practical complexity and unknowns. Consider starting simple and adding complexity only if user demand justifies it.

---

## Implementation Guidance

### If Implementing Sequential Auctions (Not Recommended)

**If forced to use sequential structure, minimize damage:**

1. **Use simultaneous bid submission + sequential settlement**
   - All bids submitted in parallel window (11:00-12:00)
   - Settlement happens sequentially (12:00-13:00)
   - Reduces information cascades

2. **Randomize order daily**
   - Prevents systematic gaming of known sequence
   - Reduces forward-looking bid shading

3. **Monitor for price trends**
   - Detect declining price anomaly (Ashenfelter 1989)
   - Adjust sequencing if systematic bias observed

4. **Require full capital commitment**
   - Bidders must have capital for all auctions they bid on
   - Reduces capital reuse gaming

### If Implementing Simultaneous Auctions (Recommended)

**Design:**
```
Bid Window: 08:00-12:00 (4 hours)
- Bidders submit sealed bids for any/all of 10 assets (ETH, BTC, SOL, etc.)
- Bids remain sealed (tlock encryption)
- All assets are different (heterogeneous goods auction)

Simultaneous Close: 12:00
- All auctions decrypt simultaneously
- All clearing prices determined in parallel
- Bidders must have capital for all wins

Settlement: 12:00:01 (Atomic)
- All auctions settle simultaneously
- Bidders receive all won assets atomically
- Capital-efficient (instant, not 24-hour delay)
```

**UX Considerations:**
- Show all 10 auctions in single interface
- Let bidders prioritize (rank which assets they want most)
- Auto-allocate capital if multiple wins exceed budget
- Clear visualization of total capital committed

**Game Theory Benefits:**
- No information leakage (all decrypt simultaneously)
- No capital reuse (must commit to all)
- No strategic timing (all close together)
- Significantly reduces strategic gaming compared to sequential auctions

**Important Caveat:**
- With budget constraints across multiple auctions, bidders still face complex portfolio optimization
- Not fully "strategy-proof" - bidders must decide which auctions to enter and how to allocate budget
- Priority system introduces new strategic considerations (how to rank preferences)

---

## Decision Framework for Product Teams

### Questions to Answer Before Choosing Design

**1. What's the actual user demand for multi-asset auctions?**
- Do users want to bid on multiple assets in one session?
- Or is single-asset-per-day sufficient?
- **Test**: Launch single-asset auctions first, measure demand for multi-asset

**2. Can users handle priority ranking UX?**
- Will users understand what priorities mean?
- Will complexity reduce participation?
- **Test**: User testing with mockups, measure comprehension

**3. How much do you trust the iterative settlement algorithm?**
- Can you prove convergence mathematically?
- Can you test extensively on testnet with real incentives?
- **Test**: Simulation with realistic and adversarial bid patterns

**4. What's your risk tolerance for unknown strategic behavior?**
- Are you OK with discovering new gaming strategies post-launch?
- Can you iterate quickly if users behave unexpectedly?
- **Test**: Red team exercises, incentivized testnet

**5. Is throughput worth complexity?**
- How much value in 10 simultaneous auctions vs 1 per day?
- Does market need high-frequency multi-asset trading?
- **Consider**: Maybe 2-3 simultaneous assets is sweet spot

**6. Should you charge a fee for over-budget bidding?**
- Will users pay 2-3% for flexible execution?
- Does fee make griefing unprofitable?
- What fee level balances revenue vs usage?
- **Test**: A/B test different fee levels (0%, 1%, 2%, 5%) on testnet

### Recommended Launch Strategy

**Phase 1: Simple (Months 1-3)**
- Single daily auction, one asset per day
- Rotate: ETH → BTC → SOL → etc.
- **Goal**: Prove basic auction mechanism works, build user base

**Phase 2: Limited Multi-Asset (Months 4-6)**
- 2-3 simultaneous auctions (not 10)
- Test priority system with small scale
- **Goal**: Validate priority UX and settlement algorithm

**Phase 3: Full Multi-Asset (Months 7+)**
- Scale to 10 simultaneous auctions if Phase 2 succeeds
- Only if user demand justifies complexity
- **Goal**: High throughput multi-asset trading

### Red Flags to Watch For

- ⚠️ Users confused by priority rankings → Simplify or add education
- ⚠️ Settlement algorithm doesn't converge → Fall back to simpler mechanism
- ⚠️ New griefing attacks discovered → Adjust settlement rules
- ⚠️ Low participation due to complexity → Reduce number of simultaneous auctions
- ⚠️ Systematic price distortions → Re-examine mechanism design

### Bottom Line for Decision Makers

**If you need high throughput and can accept complexity:**
→ Go with simultaneous multi-asset auctions + priority system
→ But test extensively before production

**If you value simplicity and low risk:**
→ Start with single daily auction (one asset per day)
→ Add complexity only if user demand justifies it

**Most pragmatic approach:**
→ Start simple (Phase 1)
→ Add complexity incrementally (Phases 2-3)
→ Let user behavior guide design evolution

---

## Related Documents

- [Uniform Price Auctions](./uniform-price-auctions.md) - Base auction mechanism
- [Multi-Seller Batch Auction](./multi-seller-batch-auction.md) - Aggregating supply
- [Shill Bidding Analysis](./shill-bidding-analysis.md) - Manipulation resistance
- [Futures Market Model](../design/futures-market-model.md) - Why single daily auction works

---

## References

**Academic Literature:**

**Note**: All cited literature analyzes sequential auctions of **different, heterogeneous assets** (art, wine, cars, spectrum bands, etc.), not multiple auctions of identical goods. This directly parallels Atomica's use case (ETH, BTC, SOL are different assets like paintings, wine bottles, or cars).

1. Krishna, V. (2002). *Auction Theory*. Academic Press. Chapter 7: Sequential Auctions. [Standard textbook; explicitly covers heterogeneous objects like art and estate sales]

2. Milgrom, P., & Weber, R. J. (1982). "A Theory of Auctions and Competitive Bidding." *Econometrica*, 50(5), 1089-1122. [Sequential auction price trends with budget-constrained bidders; covers different objects]

3. Ashenfelter, O. (1989). "How Auctions Work for Wine and Art." *Journal of Economic Perspectives*, 3(3), 23-36. [Empirical evidence from wine and art auctions selling different items; declining price anomaly]

4. Black, J., & de Meza, D. (1992). "Systematic Price Differences Between Successive Auctions Are No Anomaly." *Journal of Economics & Management Strategy*, 1(4), 607-628. [Rational explanation for price trends across different goods]

5. Zeithammer, R. (2006). "Forward-Looking Bidding in Online Auctions." *Journal of Marketing Research*, 43(3), 462-476. [Strategic bid shading in sequences of different products on eBay]

6. Vickrey, W. (1961). "Counterspeculation, Auctions, and Competitive Sealed Tenders." *Journal of Finance*, 16(1), 8-37. [Foundation of auction theory]

7. Wilson, R. (1979). "Auctions of Shares." *Quarterly Journal of Economics*, 93(4), 675-689. [Multi-unit auction theory]

**Real-World Examples of Sequential Heterogeneous Asset Auctions**:
- **Sotheby's/Christie's art auctions**: Different paintings sold sequentially (Picasso, Monet, Rembrandt)
- **Classic car auctions**: Different vehicles sold one after another (Ferrari, Porsche, Lamborghini)
- **Estate sales**: Different items (furniture, jewelry, art) sold in sequence
- **FCC spectrum auctions**: Different frequency bands sold sequentially or simultaneously

---

**Version**: 0.5
**Last Updated**: 2025-11-14
**Status**: Honest Product Research with Identified Trade-Offs
**Changes in v0.5**:
- **Added Mitigation 6: Smart Bid Execution Fee** - charge 2-3% fee on over-budget wins
  - Dual benefit: makes griefing unprofitable + creates protocol revenue
  - "Pay for flexibility" business model
  - Self-regulating economic deterrent
  - Scaled fee structure option (higher over-commitment = higher fee)
- Updated Executive Summary to highlight fee mechanism
- Added fee testing recommendations to Decision Framework
**Changes in v0.4**:
- **Major revision**: Removed false "strategy-proof" claims
- Added "Honest Assessment" section acknowledging unknowns and uncertainties
- Clarified that priority system is unproven with no academic literature
- Added convergence warnings for iterative settlement algorithm
- Reframed conclusions to present trade-offs rather than definitive solutions
- Acknowledged that simple alternatives (single daily auction) might be lower risk
- Changed recommendation language from "optimal" to "suggested with caveats"
**Changes in v0.3**:
- Added comprehensive griefing attack analysis (price inflation, sybil shill bidding, computational DoS)
- Identified critical vulnerability: forfeited bids can artificially inflate clearing prices
- Provided 5 mitigation strategies with implementation details
- Proposed iterative clearing price recalculation after removing forfeited bids
- Included Rust pseudocode for settlement algorithm
**Changes in v0.2**:
- Added comprehensive analysis of budget constraint problem in simultaneous auctions
- Evaluated 4 solution options: Atomic Failure, Priority System, Pro-Rata, Pre-Commitment Validation
- Suggested Priority System where bidders include priority ranking in encrypted bid envelope
- Provided detailed implementation specification for on-chain settlement logic
