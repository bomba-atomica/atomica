# Ausubel Auction (Clinching Clock Auction) - Beginner's Guide

## What Is It?

The Ausubel auction (also called "Clinching Clock Auction") is a **multi-unit auction format** where:
- Price **ascends** from low to high (like eBay, opposite of Dutch auctions)
- Bidders progressively **"clinch"** (lock in) guaranteed units at each price level
- Each bidder pays the price at which they clinched (not a uniform price)
- **Truthful bidding is the optimal strategy** - no gaming, no timing tricks

**Best for**: Selling multiple units of the same asset (fungible goods like ETH, tokens, commodities)

**Key Innovation**: Solves the "over-subscription problem" that breaks other multi-unit auction formats.

---

## How It Works: Simple Example

### Setup
```
Selling: 100 ETH
Starting price: $1,500
Price increases: $300 per round

Bidders:
- Alice
- Bob
- Carol
```

---

### Round 1: Price = $1,500

**Everyone submits how much they want at $1,500:**
```
Alice: "I want 60 ETH at $1,500"
Bob: "I want 50 ETH at $1,500"
Carol: "I want 40 ETH at $1,500"

Total demand: 150 ETH
Available supply: 100 ETH
→ Over-subscribed! (demand > supply)
```

**Who gets what? Calculate "guarantees":**

The key question for each bidder: *"How much am I GUARANTEED to get, even if the auction favors everyone else?"*

**Alice's guarantee:**
```
If Bob and Carol get everything they want: 50 + 40 = 90 ETH
Remaining for Alice: 100 - 90 = 10 ETH

Alice is GUARANTEED 10 ETH (there's no way she gets less)
→ Alice clinches 10 ETH at $1,500
```

**Bob's guarantee:**
```
If Alice and Carol get everything: 60 + 40 = 100 ETH
Remaining for Bob: 100 - 100 = 0 ETH

Bob is guaranteed NOTHING yet
→ Bob clinches 0 ETH
```

**Carol's guarantee:**
```
If Alice and Bob get everything: 60 + 50 = 110 ETH
Remaining for Carol: 100 - 110 = -10 → 0 ETH

Carol is guaranteed NOTHING yet
→ Carol clinches 0 ETH
```

**Round 1 Result:**
```
✓ Alice clinched: 10 ETH @ $1,500 (LOCKED IN - cannot be taken away)
✗ Bob clinched: 0 ETH
✗ Carol clinched: 0 ETH

Total allocated: 10 ETH
Remaining: 90 ETH

→ Auction continues, price increases to $1,800
```

---

### Round 2: Price = $1,800

**Bidders submit demand at new price (some reduce because it's more expensive):**
```
Alice: "I want 50 ETH total" (reduced from 60)
Bob: "I want 45 ETH" (reduced from 50)
Carol: "I want 30 ETH" (reduced from 40)

Total NEW demand: 125 ETH
Remaining supply: 90 ETH
→ Still over-subscribed
```

**Calculate guarantees (only for REMAINING supply):**

**Alice's guarantee:**
```
Alice already has: 10 ETH clinched
Alice still wants: 50 - 10 = 40 more ETH

Opponents want: 45 + 30 = 75 ETH
Remaining supply: 90 ETH
Guaranteed for Alice: 90 - 75 = 15 ETH

Alice already clinched 10, now guaranteed 15 total
→ Alice clinches 5 MORE ETH at $1,800
```

**Bob's guarantee:**
```
Bob already has: 0 ETH
Bob wants: 45 ETH

Opponents want: 50 + 30 = 80 ETH
Remaining supply: 90 ETH
Guaranteed for Bob: 90 - 80 = 10 ETH

→ Bob clinches 10 ETH at $1,800
```

**Carol's guarantee:**
```
Carol already has: 0 ETH
Carol wants: 30 ETH

Opponents want: 50 + 45 = 95 ETH
Remaining supply: 90 ETH
Guaranteed for Carol: 90 - 95 = -5 → 0 ETH

Carol is UNLUCKY - opponents' demand exceeds supply
→ Carol clinches 0 ETH (nothing yet!)
```

**Round 2 Result:**
```
✓ Alice clinched: 5 more ETH @ $1,800 (total: 15 ETH)
✓ Bob clinched: 10 ETH @ $1,800 (total: 10 ETH)
✗ Carol clinched: 0 ETH (UNLUCKY - shut out by aggressive bidding)

Total allocated: 25 ETH
Remaining: 75 ETH

→ Auction continues, price increases to $2,000
```

---

### Round 3: Price = $2,000 (Final Round)

**Bidders submit demand at $2,000 (even more reduce):**
```
Alice: "I want 35 ETH total" (reduced)
Bob: "I want 25 ETH total" (reduced)
Carol: "I want 15 ETH" (reduced)

Total demand: 75 ETH
Remaining supply: 75 ETH
→ Demand EQUALS supply! Auction can end.
```

**Calculate final guarantees:**

**Alice's guarantee:**
```
Alice already has: 15 ETH
Alice wants: 35 - 15 = 20 more ETH

Opponents want: 25 + 15 = 40 ETH
Remaining supply: 75 ETH
Guaranteed: 75 - 40 = 35 ETH total

Alice already has 15, now guaranteed 35
→ Alice clinches 20 MORE ETH at $2,000
```

**Bob's guarantee:**
```
Bob already has: 10 ETH
Bob wants: 25 - 10 = 15 more ETH

Opponents want: 35 + 15 = 50 ETH
Guaranteed: 75 - 50 = 25 ETH total

→ Bob clinches 15 MORE ETH at $2,000
```

**Carol's guarantee:**
```
Carol already has: 0 ETH
Carol wants: 15 ETH

Opponents want: 35 + 25 = 60 ETH
Guaranteed: 75 - 60 = 15 ETH

→ Carol FINALLY clinches 15 ETH at $2,000!
```

**Round 3 Result:**
```
Total demand (75) = Remaining supply (75)
→ AUCTION ENDS

Final allocation:
✓ Alice: 35 ETH total
✓ Bob: 25 ETH total
✓ Carol: 15 ETH total
Total: 75 ETH allocated (25 ETH unsold)
```

---

## Final Payment Calculation

**Alice pays:**
```
Round 1: 10 ETH @ $1,500 = $15,000
Round 2: 5 ETH @ $1,800 = $9,000
Round 3: 20 ETH @ $2,000 = $40,000
────────────────────────────────────
Total: 35 ETH for $64,000
Average price: $1,829/ETH
```

**Bob pays:**
```
Round 2: 10 ETH @ $1,800 = $18,000
Round 3: 15 ETH @ $2,000 = $30,000
────────────────────────────────────
Total: 25 ETH for $48,000
Average price: $1,920/ETH
```

**Carol pays:**
```
Round 3: 15 ETH @ $2,000 = $30,000
────────────────────────────────────
Total: 15 ETH for $30,000
Average price: $2,000/ETH
```

**Notice:** Alice paid less per ETH ($1,829) because she clinched early. Carol paid more ($2,000) because she clinched late.

---

## Key Concepts Explained

### 1. What Does "Clinching" Mean?

**Clinching = Locking in a guaranteed allocation that cannot be taken away**

Think of it like reserving a seat:
```
Concert venue: 100 seats available
Round 1: You're guaranteed 10 seats → You CLINCH 10 seats
→ Those 10 seats are YOURS, no matter what happens next
→ Price locked at Round 1 price

Round 2: You're now guaranteed 25 seats total → You CLINCH 15 MORE
→ Now you have 25 seats total, locked in
```

Once clinched, it's permanent. Other bidders cannot take those units from you.

### 2. What Is a "Guarantee"?

**Your guarantee = The minimum you'll receive, even if the auction favors everyone else**

Mathematical formula:
```
Your Guarantee = Total Supply - (Sum of all opponents' demands)
```

Example:
```
100 ETH available
Your opponents want: 70 ETH total
Your guarantee: 100 - 70 = 30 ETH

Even if your opponents get 100% of what they want,
there's still 30 ETH left over → it MUST be yours
```

If the guarantee is negative or zero, you don't clinch yet (not enough supply to guarantee anything).

### 3. Why Different Prices?

**You pay the price at which you clinched, not a uniform "clearing price"**

This is called **"pay-as-you-clinch"** or **discriminatory pricing**:

```
Alice clinched early (Round 1) when supply was abundant
→ Lower competitive pressure
→ Pays $1,500 for those units

Carol clinched late (Round 3) when supply was scarce
→ Higher competitive pressure
→ Pays $2,000 for those units
```

**Think of it like airline tickets:**
- Book 3 months early → $200
- Book 1 week before → $800
- Same seat, different prices based on when you committed

### 4. When Does the Auction End?

**The auction ends when total demand ≤ remaining supply**

```
Round N:
Total demand: 75 ETH
Remaining supply: 75 ETH
→ Demand equals supply → Everyone gets what they want → STOP

OR

Total demand: 60 ETH
Remaining supply: 75 ETH
→ Demand LESS than supply → Everyone gets what they want → STOP
```

At this point, there's no more competitive pressure, so the auction terminates.

---

## Why Is Ausubel Special?

### Problem: Other Auction Formats Break for Multi-Unit

**Example: Dutch Auction (descending price)**
```
Price drops from $3,000 → $2,000 → $1,500...

At $1,800:
- 150 ETH demanded
- 100 ETH available
→ PROBLEM: Who gets what?

Options:
1. Pro-rata: Everyone gets 66.67% (fractional units problem)
2. First-come-first-served: Network speed determines winners (unfair!)
3. Random lottery: Introduces luck (unfair!)

NO GOOD SOLUTION
```

**Ausubel Solution:**
```
At each price level, only GUARANTEED units are allocated
The "contested" portion (where demand > supply) carries to next round
→ No over-subscription problem ever occurs!
```

### Advantage 1: No Over-Subscription

```
Round 2 example:
Total demand: 125 ETH
Available: 90 ETH
Over-subscribed by 35 ETH

Other auctions: Must figure out how to divide 90 ETH among 125 ETH demand
Ausubel: Only allocate guaranteed portions (25 ETH)
→ Remaining 65 ETH carries forward (no allocation problem!)
```

### Advantage 2: Truthful Bidding

**In uniform-price auctions, bidders can "game" the system:**
```
Simple Batch Auction (uniform price):
Alice's true value: $2,000/ETH for 50 ETH

Strategy: Bid for only 30 ETH (lie about quantity)
→ Lower demand → Lower clearing price
→ Alice pays $1,800 instead of $2,000 (wins!)

Problem: Sellers lose revenue (demand reduction attack)
```

**In Ausubel, lying doesn't help:**
```
Alice's true value: $2,000/ETH for 50 ETH

If Alice lies and bids 30 ETH:
→ Might lose units to other bidders (less clinching)
→ Doesn't change the price she pays (pays clinching price anyway)

If Alice tells truth and bids 50 ETH:
→ Clinches more units when guaranteed
→ Still pays fair price (based on others' bids)

Truthful bidding is BEST strategy (dominant strategy)
```

**Why this matters:** Sellers get 5-15% more revenue because bidders can't manipulate prices downward.

### Advantage 3: Progressive Price Discovery

**Other auctions discover ONE price:**
```
Simple Batch: Clearing price = $1,850
→ Single data point
```

**Ausubel discovers MULTIPLE prices:**
```
Round 1: $1,500 → 10 ETH clinched (low competition)
Round 2: $1,800 → 15 ETH clinched (moderate competition)
Round 3: $2,000 → 50 ETH clinched (high competition)

→ Reveals entire demand curve
→ Better market information
```

---

## Common Questions

### Q1: Why would anyone bid in early rounds if prices are lower?

**A:** Because if you wait, you might get NOTHING!

```
Carol's mistake:
Round 1: Bid conservatively (40 ETH)
Round 2: Bid conservatively (30 ETH)
→ Got shut out both rounds (opponents too aggressive)
→ Forced to pay $2,000 in Round 3

Better strategy: Bid truthfully (your actual demand at each price)
→ Clinch when you can
→ Secure allocation at better prices
```

### Q2: Is it unfair that Alice pays $1,829 and Carol pays $2,000?

**Two perspectives:**

**"Unfair" perspective:**
```
Carol was willing to pay $1,500 just like Alice!
She shouldn't be punished for when she happened to clinch.
Everyone should pay the same price for the same asset.
```

**"Fair" perspective:**
```
Alice committed early when supply was abundant (low competition)
Carol clinched late when supply was scarce (high competition)
Prices reflect market conditions at time of commitment.

This is like:
- Early bird concert tickets ($50) vs. day-of tickets ($150)
- Booking flights 3 months early ($200) vs. last minute ($800)
```

**For Atomica (seller-focused platform):** The 5-15% extra revenue from truthful bidding (sellers benefit) likely outweighs fairness perception issues (buyers unhappy about price differences).

### Q3: What happens if demand never drops below supply?

**A:** The auction continues until either:

1. **Demand drops** (bidders reduce quantities as price rises)
2. **Maximum rounds reached** (timeout rule)
3. **Price exceeds all reserves** (sellers set maximum prices)

```
Example:
Rounds 1-5: Demand > Supply (auction continues)
Round 6: Demand = Supply (auction ends)

If this never happens:
Round 10 (max rounds): Auction terminates
→ Allocate remaining supply to highest bidders
```

### Q4: Can bidders increase their demand between rounds?

**No - increase-only rule prevents manipulation:**

```
Round 1: Alice bids 50 ETH
Round 2: Alice tries to bid 60 ETH → REJECTED

Why? To prevent:
- Demand manipulation (artificially inflate/deflate demand)
- Gaming the clinching algorithm
- Price manipulation attacks

Allowed:
Round 1: Alice bids 50 ETH
Round 2: Alice bids 50 ETH (same) ✓
Round 3: Alice bids 40 ETH (reduce) ✓
```

### Q5: How is this different from a reverse Dutch auction?

**Common misconception: "Ausubel = reverse Dutch"**

**Dutch auction (descending price):**
- Price: $3,000 → $2,000 → $1,500 (descends)
- Allocation: All-at-once when price hits demand
- Pricing: Uniform (everyone pays same price)
- Problem: Over-subscription → allocation nightmare

**"Reverse Dutch" would be:**
- Price: $1,500 → $2,000 → $3,000 (ascends) ✓
- Allocation: All-at-once when price hits demand ✓
- Pricing: Uniform (everyone pays final price) ✓
- Problem: Still has demand reduction issue

**Ausubel (NOT reverse Dutch):**
- Price: $1,500 → $2,000 → $3,000 (ascends) ✓
- Allocation: **Progressive clinching** (not all-at-once) ✗
- Pricing: **Discriminatory** (pay-as-you-clinch) ✗
- Problem: **No over-subscription** (solved!) ✓

**Key difference:** Progressive clinching vs. all-at-once allocation.

---

## Comparison: Ausubel vs. Other Auction Formats

| Feature | Ausubel (Clinching) | Simple Batch | Dutch Auction |
|---------|---------------------|--------------|---------------|
| **Price Movement** | Ascending (low → high) | Single sealed round | Descending (high → low) |
| **Pricing** | Discriminatory (pay-as-clinch) | Uniform (one price) | Uniform (one price) |
| **Allocation** | Progressive (no over-subscription) | Pro-rata if over-subscribed | BROKEN (timing/lottery) |
| **Strategic Bidding** | Truthful optimal | Demand reduction | Timing games |
| **Seller Revenue** | High (5-15% more) | Moderate | Low |
| **Fairness Perception** | "Unfair" (different prices) | "Fair" (same price) | "Fair" (same price) |
| **Complexity** | High (multi-round, clinching) | Low (one round) | Low (price descends) |
| **Multi-Unit Suitability** | ✓✓✓ Excellent (designed for it) | ✓✓ Good | ✗ Poor (broken) |
| **Blockchain Suitability** | ✓✓ Good (L2 only, discrete rounds) | ✓✓✓ Excellent | ✗ Poor (gas wars) |

---

## When to Use Ausubel

### ✓ Good For:
- **Multi-unit fungible assets** (ETH, tokens, commodities)
- **Seller protection critical** (want maximum revenue, prevent below-cost sales)
- **Layer 2 deployment** (gas costs negligible)
- **Truthful bidding desired** (no gaming, manipulation)
- **Thin markets** (ascending price builds confidence for sellers)

### ✗ Not Good For:
- **Single unique items** (NFTs) - use Dutch or English auction instead
- **Layer 1 Ethereum** (25x more gas than simple batch)
- **Simplicity critical** (Ausubel is complex, requires education)
- **Uniform pricing required** (if price discrimination unacceptable)

---

## Implementation Considerations for Atomica

### Gas Costs (Layer 2)
```
Estimated per auction (10 bidders, 5 rounds):
- Simple batch: ~$3-5
- Ausubel clinching: ~$15-25

On L2, this is negligible difference (acceptable)
On L1, this would be $75 vs $1,900 (unacceptable)
```

### User Education Required
```
Challenge: Users unfamiliar with clinching concept
Solution:
- Clear UI showing clinched amounts in real-time
- Tooltips explaining "guarantee" calculation
- Example walkthroughs
- Show running total of locked-in allocation
```

### Automated Bidding Agents
```
Challenge: Users don't want to manually submit bids every round
Solution:
- Allow users to configure bidding agents:
  "I want 50 ETH, willing to pay up to $2,100"
  → Agent automatically bids in each round
  → User approves final allocation before payment
```

### Fairness Communication
```
Challenge: Price discrimination seems unfair to late clinchers
Solution:
- Frame as "early commitment discount" (positive framing)
- Show market education: "This ensures honest bidding"
- Display average price paid vs. external market price
- Emphasize seller protection benefits (healthy ecosystem)
```

---

## Summary: Key Takeaways

1. **Ausubel = Ascending price + Progressive clinching + Pay-as-you-clinch**
   - NOT just "reverse Dutch" (fundamentally different mechanism)

2. **Clinching = Locking in guaranteed allocation**
   - Your guarantee = Supply - Opponents' demand
   - Once clinched, cannot be taken away

3. **No over-subscription problem**
   - Only guaranteed amounts allocated each round
   - Contested portions carry forward

4. **Truthful bidding is optimal**
   - Can't manipulate prices by lying about demand
   - Sellers get 5-15% more revenue

5. **Different prices = different clinching rounds**
   - Early clinchers pay less (less competition)
   - Late clinchers pay more (more competition)
   - Like early bird pricing

6. **Trade-off: Complexity vs. Revenue**
   - More complex than simple batch
   - But significantly better seller protection
   - Justified for seller-focused platforms (like Atomica)

---

## Further Reading

**Related Ausubel Documents**:
- [ausubel-vs-dutch-comparison.md](./ausubel-vs-dutch-comparison.md) - Detailed comparison showing why Ausubel ≠ reverse Dutch
- [ausubel-clinching-clock.md](./ausubel-clinching-clock.md) - Technical implementation, L1/L2 analysis, and deployment strategy for Atomica

**Context Documents**:
- [auction-requirements.md](./auction-requirements.md) - First principles analysis of auction design requirements
- [sealed-bid-alternatives.md](./sealed-bid-alternatives.md) - Comparison of all public-bid auction formats

---

## Quick Reference: Ausubel Algorithm

```python
def ausubel_round(price, bidders, remaining_supply):
    """Execute one round of Ausubel auction"""

    # 1. Collect demand from all bidders at current price
    demands = {bidder: bidder.demand_at(price) for bidder in bidders}
    total_demand = sum(demands.values())

    # 2. Check termination condition
    if total_demand <= remaining_supply:
        # Auction ends - everyone gets what they want
        return allocate_final(demands, remaining_supply)

    # 3. Calculate guarantees and clinching
    clinched = {}
    for bidder in bidders:
        # What bidder is guaranteed even if opponents get everything
        opponents_demand = total_demand - demands[bidder]
        guarantee = max(0, remaining_supply - opponents_demand)

        # New clinching = guarantee - previously clinched
        new_clinch = guarantee - bidder.total_clinched

        if new_clinch > 0:
            clinched[bidder] = new_clinch
            bidder.clinch(new_clinch, price)

    # 4. Update remaining supply
    total_clinched = sum(clinched.values())
    remaining_supply -= total_clinched

    # 5. Increase price and continue to next round
    return continue_auction(price + price_increment, remaining_supply)
```

---

*This document explains the Ausubel (Clinching Clock) auction mechanism for multi-unit assets, designed for Atomica's blockchain auction platform.*
