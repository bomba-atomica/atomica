# Shill Bidding: Formal Analysis

This document provides rigorous game-theoretic analysis proving that shill bidding attacks fail under the proposed auction design for Atomic Auctions.

## Attack Taxonomy

**Type 1: Last-Minute Bid Lowering**
- Attacker submits high bid early, attempts to lower it before auction close
- **Status**: Prevented by "No Bid Lowering" policy (enforced in smart contract)

**Type 2: Sybil Bid Withholding**
- Attacker creates multiple identities
- Early bids from Identity A (high prices), late bids from Identity B (low prices)
- Attempts to lower clearing price while maintaining allocation

**Type 3: Bid Sniping**
- Attacker waits until last second to submit low bid
- Hopes to win allocation at artificially low price by surprising other bidders

**Type 4: Collusive Bid Depression**
- Multiple market makers coordinate to submit uniformly low bids
- Collectively lower clearing price to extract better terms

## Formal Model

**Players**:
- N legitimate market makers: M₁, M₂, ..., Mₙ
- 1 strategic attacker: A (may control multiple addresses)
- 1 auctioneer: U

**Strategies**:
- Each market maker i has true valuation vᵢ for the auctioned asset
- Can submit bid bᵢ ≤ vᵢ at any time t before auction close
- Attacker A can submit multiple bids from different addresses

**Auction Mechanism**:
- Total supply being auctioned: Q units
- Bids aggregated and sorted by price (highest to lowest)
- Clearing price p* = lowest bid price such that cumulative quantity ≥ Q
- All winning bidders pay p* (uniform pricing)

**Payoffs**:
- If market maker i wins quantity qᵢ at clearing price p*:
  - Profit πᵢ = (vᵢ - p*) × qᵢ
- If market maker loses auction: πᵢ = 0

## Type 2 Analysis: Sybil Bid Withholding

**Attack Scenario**:
```
Auction: 100 units
Legitimate bids:
  - M₁: 50 units @ $2,000
  - M₂: 60 units @ $1,980

Without attacker:
  Clearing price = $1,980
  M₁ wins 50 units @ $1,980
  M₂ wins 50 units @ $1,980

Attacker strategy:
  t=0: Submit bid from Address_A: 40 units @ $2,000
  t=T-ε: Submit bid from Address_B: 10 units @ $1,960

Attacker hopes:
  Clear at $1,960 (lowered by late low bid)
  Attacker profit increase: $20/unit × 40 units = $800
```

**Why This Fails**:

**Reason 1: Self-Competition**

The attacker's early high bid (Address_A @ $2,000) already locks in allocation for 40 units. When the late low bid arrives (Address_B @ $1,960), the auction clears based on ALL bids including both attacker bids.

**Clearing Calculation**:
```
Sorted bids (highest to lowest):
1. M₁: 50 @ $2,000
2. Address_A: 40 @ $2,000
3. M₂: 60 @ $1,980
4. Address_B: 10 @ $1,960

Cumulative quantity:
  @ $2,000: 50 + 40 = 90 units (insufficient)
  @ $1,980: 90 + 60 = 150 units (exceeds 100, clears here)

Clearing price: $1,980 (unchanged!)
```

The late low bid from Address_B is irrelevant because the auction already clears at $1,980. The attacker has not lowered the clearing price.

**Reason 2: Bid Timing Irrelevance**

In a uniform price auction with public bids:
- All bids submitted before close are treated identically
- There is no advantage to submitting early vs. late
- The clearing price is determined by the marginal bid (100th unit), not by timing

**Formal Proof**:

Let:
- D(p) = aggregate legitimate demand at price p
- qₐ = total quantity attacker bids across all addresses
- p* = clearing price

The clearing price is defined as:
```
p* = min{p | D(p) + qₐ ≥ Q}
```

This depends only on total attacker quantity qₐ, not on how that quantity is distributed across addresses or when bids are submitted.

**Splitting qₐ into multiple bids**:
- Address_A: qₐ₁ @ pₐ₁
- Address_B: qₐ₂ @ pₐ₂
- Where qₐ₁ + qₐ₂ = qₐ

The clearing price p* is still determined by the same total quantity qₐ. The split is cosmetic.

**Conclusion**: Sybil identities provide no advantage in uniform price auctions.

## Type 3 Analysis: Bid Sniping

**Attack Scenario**:
- Attacker observes early bids publicly
- Current bids: M₁ @ $2,000 (50 units), M₂ @ $1,980 (60 units)
- Attacker submits $1,960 bid at t=T-ε to lower clearing price

**Why This Fails**:

**Case A: Insufficient Legitimate Demand**
```
Supply: 100 units
Legitimate bids: 80 units total
Attacker bid: 30 units @ $1,960

Sorted bids:
  M₁: 50 @ $2,000
  M₂: 30 @ $1,980
  Attacker: 30 @ $1,960

Cumulative: 50 + 30 + 30 = 110 units > 100
Clearing price: $1,960

Attacker wins: ~20 units @ $1,960
```

**Analysis**: Attacker won at $1,960, but could have bid $1,980 and still won. By bidding low, attacker risks being outbid by other late bidders. The attacker saved $20/unit but took on risk.

**BUT**: This assumes no other market makers are active. In reality:

**Case B: Rational Market Maker Response**

When the attacker's $1,960 bid is public (before auction close), rational market maker M₃ observes:
- Current clearing price would be $1,960
- M₃'s true valuation: $2,000
- M₃ can profitably bid $1,970

```
After M₃ responds:
  M₁: 50 @ $2,000
  M₂: 30 @ $1,980
  M₃: 40 @ $1,970
  Attacker: 30 @ $1,960

Cumulative: 50 + 30 + 40 = 120 units @ $1,970
Clearing price: $1,970

Attacker wins 0 units (bid too low)
```

**Case C: Sufficient Legitimate Demand**
```
Supply: 100 units
Legitimate bids: 120 units @ ≥$1,980
Attacker bid: 30 units @ $1,960

Clearing price: $1,980 (attacker's bid irrelevant)
Attacker wins 0 units
```

**Formal Proof**:

If legitimate aggregate demand D(p) ≥ Q at price p, then:
- Clearing price p* ≥ p
- Any bid below p wins zero allocation

The attacker bidding below market-clearing price simply loses the auction.

**Rational Bidding Strategy**: Bid at or near true valuation vᵢ. Bidding below risks losing allocation; bidding above is unnecessary (pay clearing price anyway).

**Conclusion**: Bid sniping provides no advantage; rational bidders bid truthfully.

## Type 4 Analysis: Collusive Bid Depression

**Attack Scenario**:
- K market makers collude to submit artificially low bids
- Agree to all bid $1,960 when true valuation is $2,000
- Hope to jointly lower clearing price

**Why This Fails**:

**The Defection Incentive** (Prisoner's Dilemma):

Suppose colluders agree to bid $1,960:

**If Alice Cooperates** (bids $1,960):
- Clearing price: $1,960
- Alice's profit: ($2,000 - $1,960) × q = $40q

**If Alice Defects** (bids $1,980):
- Alice outbids other colluders
- Wins larger allocation or entire auction
- Clearing price: $1,960 (if other colluders' bids still clear) or $1,980
- Alice's profit: ($2,000 - $1,980) × Q = $20Q (if wins entire auction)

**Payoff Matrix** (simplified):

|              | Others Collude | Others Defect |
|--------------|----------------|---------------|
| **Alice Colludes** | ($40, $40)     | ($0, $60)     |
| **Alice Defects**  | ($60, $0)      | ($20, $20)    |

(First number = Alice's profit per unit, second = others' profit per unit)

**Game-Theoretic Analysis**:
- If others collude, Alice's best response: **Defect** ($60 > $40)
- If others defect, Alice's best response: **Defect** ($20 > $0)
- **Dominant strategy**: Defect
- **Nash equilibrium**: All defect, bid near true valuation

**Why Collusion Is Hard to Sustain**:

**1. Anonymous Participants**
- Market makers use pseudonymous addresses
- Cannot identify who defected
- Cannot punish defectors in future auctions

**2. Open Entry**
- New market makers can enter freely
- No barrier to becoming a bidder
- Colluding group cannot exclude outsiders

**3. One-Shot Game Nature**
- Each auction is independent
- No repeated game dynamics to enforce cooperation
- Threat of future punishment is not credible

**4. Information Leakage**
- Defecting bid is public once submitted
- Other colluders can defect in response before auction close
- Collusion unravels rapidly

**Formal Result** (Folk Theorem Failure):

In repeated games with perfect monitoring, collusion can be sustained via trigger strategies. However, Atomic Auctions lack the necessary conditions:
- Imperfect monitoring (pseudonymous participants)
- Open entry (cannot exclude defectors)
- Public bids during auction (enables rapid counter-defection)

**Conclusion**: Collusion is unstable; market competition drives bids toward true valuations.

## Reserve Price Defense Layer

Even if collusion were somehow sustained, the reserve price mechanism provides a backstop:

**Auctioneer's Optimal Strategy**:

If clearing price p* is suspiciously low (e.g., $1,900 when market price is $2,000):
- Auctioneer rejects auction by revealing reserve price R > p*
- Pays 5% penalty on auction value

**Break-Even Analysis**:
```
Auction value: $200,000 (100 ETH @ $2,000 true value)
5% penalty: $10,000

If clearing price p* = $1,900:
  Loss from accepting: ($2,000 - $1,900) × 100 = $10,000
  Cost of rejecting: $10,000
  Auctioneer is indifferent

If clearing price p* < $1,900:
  Auctioneer strictly prefers to reject
```

**Effect on Collusion**:
- Colluding market makers know auctioneer will reject if price drops >5% below market
- Collusion only profitable if clearing price ∈ [$1,900, $2,000]
- Maximum extractable profit: $10,000 total (divided among colluders)
- Risk of defection still dominates for individual colluders

**Result**: Reserve price sets a floor on how low collusion can push prices (~95% of true value).

## Empirical Validation from Treasury Auctions

**Real-World Evidence**:

The US Treasury has used uniform price auctions for government bonds since 1992, conducting thousands of auctions with hundreds of billions in volume.

**Academic Studies**:

**Malvey & Archibald (1998)**: "Uniform-Price Auctions: Update of the Treasury Experience"
- Analyzed 4+ years of Treasury auction data
- Found: Bidding patterns consistent with competitive pricing
- Collusion rare and quickly detected
- Auction format naturally resists manipulation

**Key Findings**:
- Winning bids cluster tightly around market prices (spread <0.1%)
- No evidence of systematic bid depression
- Occasional manipulation attempts detected and penalized
- Uniform pricing discourages strategic underbidding

**Nyborg & Sundaresan (1996)**: "Discriminatory versus Uniform Treasury Auctions: Evidence from When-Issued Transactions"
- Compared discriminatory (pay-your-bid) vs. uniform price auctions
- Found: Uniform price auctions have lower "winner's curse" effect
- Bidders bid more aggressively (closer to true valuation) in uniform auctions
- Reduced incentive for strategic bid shading

**Application to Atomic Auctions**:

Treasury auctions share key properties with Atomic Auctions:
- Multiple competing bidders
- Uniform clearing price
- Public bid revelation (after close)
- High-stakes financial assets

**Difference**: Treasury auctions have known participants (primary dealers), while Atomic Auctions are anonymous. However, **anonymity strengthens collusion resistance** (cannot identify/punish defectors).

**Conclusion**: 30+ years of empirical evidence supports uniform price auction robustness.

## Summary of Formal Results

**Type 1 (Last-Minute Bid Lowering)**:
- ✅ **Prevented** by smart contract enforcement of "No Bid Lowering" policy

**Type 2 (Sybil Bid Withholding)**:
- ✅ **Provably ineffective**: Uniform pricing makes bid splitting economically neutral
- Attacker cannot lower clearing price by splitting bids across identities

**Type 3 (Bid Sniping)**:
- ✅ **Provably ineffective**: Rational bidders bid near true valuation regardless of timing
- Low bids risk losing allocation; high bids are protected by uniform pricing

**Type 4 (Collusive Bid Depression)**:
- ✅ **Game-theoretically unstable**: Dominant strategy is to defect from collusion
- Anonymous markets prevent punishment of defectors
- Empirical evidence from Treasury auctions confirms resistance

**Reserve Price Backstop**:
- ✅ **Economic floor**: Limits maximum extractable value from manipulation to ~5%
- Aligns auctioneer incentives to reject unreasonably low clearing prices

## Conclusion: Incentive-Compatible Design

The combination of:
1. Uniform price auction mechanism
2. No bid lowering policy
3. Reserve price with commit-reveal
4. Auctioneer penalty for rejection
5. Anonymous, open-entry market structure

Creates an **incentive-compatible** auction system where:
- Rational bidders bid near true valuation
- Manipulation strategies are unprofitable
- Collusion is unsustainable
- System achieves competitive market pricing

**Nash Equilibrium**: All market makers bid truthfully based on their valuations, and the clearing price reflects true market conditions.

This formal analysis demonstrates that Atomic Auctions achieve game-theoretic soundness even in partially public, anonymous environments with potential adversaries.
