# Ausubel (Clinching Clock) vs Dutch Auction: Key Differences

**Related Documents**:
- [ausubel-summary.md](./ausubel-summary.md) - Beginner's introduction to Ausubel auctions
- [ausubel-clinching-clock.md](./ausubel-clinching-clock.md) - Technical implementation and analysis for Atomica
- [sealed-bid-alternatives.md](./sealed-bid-alternatives.md) - Comparison of all public-bid auction formats

---

## Quick Answer

**Opposite Price Movements**:
- **Dutch Auction**: Price **descends** from high to low until demand meets supply
- **Ausubel (Clinching Clock)**: Price **ascends** from low to high until demand meets supply

**This single difference creates radically different properties for multi-unit auctions.**

---

## Detailed Comparison

### Price Direction

**Dutch Auction**:
```
Start: Price = $3,000 (very high)
→ No bids (too expensive)

t=1min: Price = $2,800
→ Still no bids

t=2min: Price = $2,500
→ Some bids appear

t=3min: Price = $2,200
→ More bids

t=4min: Price = $2,000
→ Total demand = 100 ETH (meets supply)
→ AUCTION STOPS
→ All winners pay $2,000
```

**Ausubel (Clinching Clock)**:
```
Start: Price = $1,500 (low)
Round 1: 30 ETH demanded at $1,500
→ 30 ETH clinches at $1,500
→ Auction continues (supply not met)

Round 2: Price = $1,600
→ 40 ETH total demand
→ 10 more ETH clinches at $1,600

Round 3: Price = $1,800
→ 60 ETH total demand

Round 5: Price = $2,000
→ 100 ETH total demand (meets supply)
→ AUCTION STOPS
→ Winners pay DIFFERENT prices (clinching prices)
```

**Key Difference**: Clinching happens **progressively** as price rises; Dutch is **all-at-once** when price hits demand.

---

## Single-Unit vs Multi-Unit Behavior

### Single-Unit Auctions: Equivalent

**Dutch Auction (Single Item)**:
```
Price descends from $1,000 → $900 → $800...
First bidder to press "Buy" wins at current price
Equivalent to sealed first-price auction
```

**Ascending Clock (Single Item)**:
```
Price rises from $100 → $200 → $300...
Last bidder remaining wins at current price
Equivalent to English auction (second-price)
```

**For single items**: Dutch ≈ First-price; Ascending ≈ Second-price

---

### Multi-Unit Auctions: Radically Different

**Dutch Auction (Multi-Unit)**:
```
100 units available
Price descends to $2,000
At $2,000, demand = 150 units (over-subscribed)

Allocation problem:
- Who gets the 100 units?
- Pro-rata? First-come-first-served? Random?
- All pay $2,000 (uniform price)

Strategic bidding:
- Wait for lowest price
- Rush to submit when "good enough"
- Timing games dominate
```

**Ausubel (Multi-Unit)**:
```
100 units available
Price ascends from $1,500

Round 1 ($1,500): 20 units clinched
Round 2 ($1,600): 15 more clinched
Round 3 ($1,800): 30 more clinched
Round 4 ($2,000): 35 more clinched
Total: 100 units allocated

Payments:
- 20 units @ $1,500 = $30,000
- 15 units @ $1,600 = $24,000
- 30 units @ $1,800 = $54,000
- 35 units @ $2,000 = $70,000
Total: $178,000

Strategic bidding:
- Truthful bidding optimal
- No timing games (clinch when guaranteed)
- No rush (can't lose by revealing demand)
```

---

## Pricing: Uniform vs Discriminatory

**Dutch Auction**:
- **Uniform pricing**: All winners pay the **same price** (the price when auction stopped)
- Example: All pay $2,000

**Ausubel (Clinching Clock)**:
- **Discriminatory pricing by round**: Winners pay **different prices** based on when they clinched
- Example: Early clinchers pay $1,500, late clinchers pay $2,000
- **But**: This is NOT discriminatory by bid amount (all who clinch in Round 1 pay $1,500)

**Fairness Perception**:
- Dutch: "Fair" (everyone pays same)
- Ausubel: "Fair" (pay based on market competitiveness at time of clinch)

---

## Strategic Bidding Incentives

### Dutch Auction (Multi-Unit)

**Strategy**:
```
Bidder's true value: $2,100/unit
Wants: 50 units

Strategic question: "When should I press 'Buy'?"
- Wait too long → price drops more → save money
- Wait too long → others buy first → miss out
- Optimal: Press at price < true value, but not too early

Result: Bid shading (wait for lower price)
```

**Problems**:
- Timing games (network latency matters)
- Sniping (wait until last second)
- Gas wars (everyone submits at same moment)
- Coordination issues (who gets what if over-subscribed?)

### Ausubel (Clinching Clock)

**Strategy**:
```
Bidder's true value: $2,100/unit
Wants: 50 units

Strategic question: "What demand should I report at each price?"
- Round 1 ($1,500): Report 50 (above value? Report max)
- Round 2 ($1,600): Report 50
- Round 3 ($2,000): Report 50
- Round 4 ($2,100): Report 50
- Round 5 ($2,150): Report 0 (above value)

Optimal strategy: Report true demand at each price level
No benefit to lying about quantity
```

**Truthful Bidding is Dominant Strategy**:
- Reporting less → risk losing units to competitors
- Reporting more → no benefit (pay clinching price anyway)
- Reporting truthfully → optimal

---

## Timing and Speed

**Dutch Auction**:
```
Duration: Very fast (minutes or seconds)
- Price drops continuously or in rapid steps
- Auction ends as soon as demand meets supply
- Can be over in 30 seconds to 5 minutes

Speed advantage: Bidders act quickly
Risk: Timing precision critical
```

**Ausubel (Clinching Clock)**:
```
Duration: Slower (30-90 minutes typical)
- Discrete rounds (5-10 min each)
- 5-10 rounds to convergence
- Predictable structure

Speed disadvantage: Takes longer
Benefit: Time to think, no rush decisions
```

---

## Seller Protection

### Dutch Auction

**Undersubscription Risk**:
```
Price descends from $3,000 to $1,000
At $1,000, only 30 units demanded (out of 100)

Options:
1. Stop auction, sell 30 at $1,000 (terrible for seller)
2. Continue descending → $900, $800... (even worse)
3. Set reserve price (minimum $1,800) → auction fails if not reached

Seller must set reserve price or risk exploitation
```

**Reserve Price Challenges**:
- Must guess right level upfront
- Too high → auction fails
- Too low → exploitation
- Single decision point (binary: accept or reject)

### Ausubel (Clinching Clock)

**Undersubscription Handling**:
```
Price ascends from $1,500
Round 1: 30 units demanded, 30 clinch at $1,500
Round 2 ($1,600): 35 demanded, 5 more clinch
Round 3 ($1,800): 50 demanded, 15 more clinch
...
Round 6 ($2,000): 100 demanded, auction completes

Even if undersubscribed early, price RISES
Competitive pressure builds naturally
Sellers benefit from ascending price
```

**Seller Reserves (Optional)**:
```
Seller A: Reserve $1,800
→ Supply enters market at Round 3 ($1,800)
→ If price never reaches $1,800, doesn't sell (no penalty)

Seller B: Reserve $2,000
→ Supply enters at Round 6
→ Progressive entry based on competitiveness

Natural filtering without binary decision
```

---

## Multi-Unit Allocation Mechanism

**Dutch Auction Allocation Problem**:
```
Price hits $2,000
150 units demanded, 100 available

How to allocate?
Option A: Pro-rata (everyone gets 66.67%)
  → Fractional units problem
  → Unfair to small bidders (rounding issues)

Option B: First-come-first-served
  → Network latency determines winners
  → Extremely unfair (whoever has fastest connection wins)
  → Gas wars

Option C: Random lottery among bidders
  → Fair but introduces luck
  → Bidders may not get what they bid for

No good solution! This is fundamental problem with descending multi-unit.
```

**Ausubel Allocation (No Problem)**:
```
Clinching happens progressively:
- Round 1: Alice clinches 20, Bob clinches 10 (30 total)
- Round 2: Carol clinches 15 (45 total)
- Round 3: Alice clinches 10 more, Dave clinches 20 (75 total)
- Round 4: Bob clinches 25 more (100 total, done)

Allocation determined mathematically:
Clinch_i = max(0, min(Demand_i, Supply - Demand_others) - Previous_clinched)

No over-subscription problem
No allocation lottery needed
Deterministic and fair
```

---

## Example: 100 ETH Auction

### Dutch Auction Scenario

```
Starting price: $3,000
Price drops $100 every 10 seconds

t=0s:   $3,000 - No bids
t=10s:  $2,900 - No bids
t=20s:  $2,800 - No bids
...
t=60s:  $2,400 - Alice thinks "getting close to my value"
t=70s:  $2,300 - Bob thinks "should I buy now?"
t=80s:  $2,200 - Carol prepares transaction
t=85s:  $2,150 - Alice submits: 50 ETH
t=85.5s: $2,150 - Bob submits: 40 ETH
t=86s:  $2,150 - Carol submits: 60 ETH
t=86s:  $2,150 - Dave submits: 30 ETH

Total demand: 180 ETH @ $2,150
Supply: 100 ETH

PROBLEM: How to allocate?
- Pro-rata: Alice gets 27.8 ETH, Bob gets 22.2, Carol gets 33.3, Dave gets 16.7
- FCFS: Alice gets 50, Bob gets 40, Carol gets 10, Dave gets 0 (Carol/Dave unlucky)
- Random: Lottery among all bidders

All options have serious fairness issues
```

### Ausubel (Clinching Clock) Scenario

```
Starting price: $1,500
Increment: $100 per round
Round duration: 10 minutes

Round 1 ($1,500):
- Alice demands: 50 ETH
- Bob demands: 40 ETH
- Carol demands: 60 ETH
- Dave demands: 30 ETH
Total: 180 ETH > 100 supply → No clinching yet

Round 2 ($1,600):
- Alice demands: 50 ETH (same)
- Bob demands: 35 ETH (reduced)
- Carol demands: 55 ETH (reduced)
- Dave demands: 25 ETH (reduced)
Total: 165 ETH > 100 supply → Still no clinching

Round 3 ($1,700):
- Alice demands: 50 ETH
- Bob demands: 30 ETH
- Carol demands: 50 ETH
- Dave demands: 20 ETH
Total: 150 ETH > 100 supply

Clinching calculation:
- Alice: Opponents demand 100, so Alice guaranteed 0 (no clinch)
- Others: Same (no clinch yet)

Round 4 ($1,800):
- Alice demands: 45 ETH
- Bob demands: 25 ETH
- Carol demands: 40 ETH
- Dave demands: 15 ETH
Total: 125 ETH > 100 supply → Close!

Round 5 ($1,900):
- Alice demands: 40 ETH
- Bob demands: 25 ETH
- Carol demands: 35 ETH
- Dave demands: 10 ETH
Total: 110 ETH > 100 supply

Clinching:
- Alice: Opponents demand 70, Alice guaranteed 30, clinches 30 @ $1,900
- Bob: Opponents demand 85, Bob guaranteed 15, clinches 15 @ $1,900
- Carol: Opponents demand 75, Carol guaranteed 25, clinches 25 @ $1,900
- Dave: Opponents demand 100, Dave guaranteed 0, clinches 0

Round 6 ($2,000):
- Alice demands: 35 ETH (wants 35 more, has 30)
- Bob demands: 20 ETH (wants 20 more, has 15)
- Carol demands: 30 ETH (wants 30 more, has 25)
- Dave demands: 10 ETH
Total: 95 ETH < 100 supply → AUCTION ENDS

Final allocation:
- Alice: 30 clinched @ $1,900 + 5 final @ $2,000 = 35 total
  Payment: (30 × $1,900) + (5 × $2,000) = $67,000
- Bob: 15 @ $1,900 + 5 @ $2,000 = 20 total
  Payment: (15 × $1,900) + (5 × $2,000) = $38,500
- Carol: 25 @ $1,900 + 5 @ $2,000 = 30 total
  Payment: (25 × $1,900) + (5 × $2,000) = $57,500
- Dave: 0 @ $1,900 + 10 @ $2,000 = 10 total
  Payment: 10 × $2,000 = $20,000

Total: 95 ETH allocated
No over-subscription problem
Deterministic, fair allocation
```

---

## Summary Table

| Dimension | Dutch Auction | Ausubel (Clinching Clock) |
|-----------|---------------|---------------------------|
| **Price Movement** | Descending (high → low) | Ascending (low → high) |
| **Speed** | Very fast (seconds-minutes) | Slower (30-90 minutes) |
| **Pricing** | Uniform (all pay same) | Discriminatory by round |
| **Allocation** | Problematic (over-subscription) | Clean (progressive clinching) |
| **Strategic Bidding** | Timing games, sniping | Truthful bidding optimal |
| **Seller Protection** | Weak (descending price) | Strong (ascending price) |
| **Multi-Unit Suitability** | Poor (allocation issues) | Excellent (designed for it) |
| **Complexity** | Simple concept | Complex mechanism |
| **Fairness** | Timing-dependent (unfair) | Strategy-independent (fair) |
| **Blockchain Suitability** | Poor (gas wars, latency) | Good (discrete rounds) |
| **Precedent** | NFTs (CryptoKitties, etc.) | None on blockchain |

---

## Why Dutch Works for NFTs but Not Multi-Unit Fungibles

**NFTs (Single Unique Items)**:
- Dutch auction perfect: Price drops until one buyer accepts
- No allocation problem (only one item)
- Fast, simple, proven (CryptoKitties, Foundation, etc.)

**Multi-Unit Fungibles (ETH, tokens)**:
- Dutch auction problematic: Over-subscription creates allocation nightmare
- Ausubel solves this: Progressive clinching eliminates over-subscription
- Complexity justified by superior allocation mechanism

---

## Bottom Line: Fundamentally Different Mechanisms

**Dutch Auction**:
- Descending price
- All-at-once allocation when price hits demand
- Fast but timing-dependent
- Works for single items, struggles with multi-unit
- Uniform pricing
- **Seller risk**: Price falls until demand met (can be exploitative)

**Ausubel (Clinching Clock)**:
- Ascending price
- Progressive allocation as price rises
- Slow but strategy-independent
- Designed specifically for multi-unit
- Discriminatory pricing by round (but fair)
- **Seller protection**: Price rises, competitive pressure builds

**For Atomica (multi-unit, multi-seller, seller protection critical)**:
→ Ausubel vastly superior to Dutch
→ Dutch auction not even a viable option (allocation problem unsolvable)

**The price direction (ascending vs descending) completely changes the game-theoretic properties and makes them suitable for different use cases.**
