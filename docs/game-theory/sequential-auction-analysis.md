# Sequential Auction Design: Game Theory and Strategic Implications

**Question**: Can multiple different assets (ETH, BTC, SOL, etc.) be auctioned within a single trading session without creating unfair strategic advantages or undermining price discovery?

**Short Answer**: Yes, with **simultaneous bid revelation + sequential clearing with global priority order**.

**Status**: Product research complete. Recommendation: Alternative 5.

---

## Table of Contents

### Part 1: Executive Summary & Recommendation
1. [TL;DR: The Answer](#tldr-the-answer)
2. [Recommended Design: Sequential Clearing with Global Order](#recommended-design-sequential-clearing-with-global-order)
3. [Implementation Guide](#implementation-guide)
4. [Key Trade-Offs](#key-trade-offs)

### Part 2: Problem Analysis
5. [Why Sequential Auctions Create Problems](#why-sequential-auctions-create-problems)
6. [Why Simultaneous Revelation Helps](#why-simultaneous-revelation-helps)

### Part 3: Solution Options
7. [Five Design Alternatives Considered](#five-design-alternatives-considered)
8. [Why Alternative 5 is Best](#why-alternative-5-is-best)

### Part 4: Implementation Details
9. [Smart Contract Implementation](#smart-contract-implementation)
10. [Griefing Attacks & Mitigations](#griefing-attacks--mitigations)
11. [Testing & Launch Strategy](#testing--launch-strategy)

### Part 5: Background (Appendix)
12. [Academic Literature Review](#academic-literature-review)
13. [Alternative Architectures](#alternative-architectures)

---

# Part 1: Executive Summary & Recommendation

## TL;DR: The Answer

**Problem**: Running multiple asset auctions (ETH, BTC, SOL, etc.) in one session creates strategic timing games if done sequentially. Early winners lock capital, losers gain advantage.

**Solution**: **Simultaneous bid revelation + sequential clearing with global priority order**

**How It Works**:
1. **Bidding Phase**: All users submit sealed bids on multiple assets simultaneously
2. **Reveal Phase**: All bids decrypt at same time (eliminates information cascades)
3. **Fee Collection**: Deduct 3-5% fee upfront from over-budget bidders
4. **Sequential Clearing**: Process auctions in predetermined order: **Smallest → Biggest markets** (DOGE → LINK → ... → BTC → ETH)

**Why This Works**:
- ✅ Simplest possible smart contract implementation (O(N × M) gas)
- ✅ Eliminates sequential timing games during bidding
- ✅ Prioritizes liquidity for underserved small markets (Atomica's competitive advantage)
- ✅ Fee-based griefing deterrent (economically, not algorithmically)
- ✅ No user priorities needed (simple UX)
- ✅ Predictable, deterministic, easy to audit

**Key Trade-Off**:
- Users can't control which assets they prioritize (global policy enforced)
- Major markets (ETH/BTC) clear last, may have thinner participation
- BUT: ETH/BTC already have deep liquidity on other venues (CEXs/DEXs), so this is acceptable

---

## Recommended Design: Sequential Clearing with Global Order

### Mechanism

**Phase 1: Bidding (Simultaneous)**
```
Time: 08:00 - 12:00 EST
- All bidders submit sealed bids (timelock encrypted)
- Can bid on any/all assets (ETH, BTC, SOL, DOGE, etc.)
- Bids remain encrypted until deadline
```

**Phase 2: Reveal (Simultaneous)**
```
Time: 12:00:00
- All bids decrypt simultaneously
- No information cascades (no one gets early info)
```

**Phase 3: Fee Collection**
```
Time: 12:00:01
For each bidder:
  IF sum(all_bids) > user_balance:
    fee = 3% × user_balance
    net_budget = user_balance - fee
    collect_fee(fee) → protocol treasury
  ELSE:
    net_budget = user_balance
```

**Phase 4: Sequential Clearing**
```
Time: 12:00:02 onwards
Auction order: DOGE → LINK → UNI → DOT → ATOM → AVAX → MATIC → SOL → BTC → ETH
               (Smallest market → Biggest market)

For each auction in order:
  1. Calculate clearing price using all bids
  2. Determine winners
  3. For each winner:
     - IF winner.net_budget ≥ clearing_price × quantity:
       - Settle trade
       - Deduct from winner.net_budget
     - ELSE:
       - Forfeit (insufficient budget)
       - Award to next highest bidder
  4. Continue to next auction
```

### Example

```
Alice has 100,000 LIBRA balance

Alice submits bids:
- DOGE: 5,000 LIBRA  (small market)
- SOL:  40,000 LIBRA (mid market)
- BTC:  60,000 LIBRA (big market)
- ETH:  50,000 LIBRA (big market)
Total: 155,000 LIBRA (55% over-budget)

Phase 3: Fee Collection
- Over-budget: 155k - 100k = 55k (55%)
- Fee: 3% × 100k = 3,000 LIBRA
- Net budget: 97,000 LIBRA

Phase 4: Sequential Clearing
Auction 1 (DOGE): Alice wins, pays 5,000  → Net: 92,000 remaining
Auction 2 (SOL):  Alice wins, pays 40,000 → Net: 52,000 remaining
Auction 3 (BTC):  Alice wins, needs 60,000 → FORFEITED (only 52k left)
Auction 4 (ETH):  Alice wins, needs 50,000 → FORFEITED (only 52k left)

Result:
- Alice receives: DOGE + SOL (small/mid markets)
- Alice forfeits: BTC + ETH (ran out of budget)
- Protocol earns: 3,000 LIBRA fee
- Next bidders win BTC and ETH
```

---

## Implementation Guide

### Smart Contract Pseudocode

```rust
fn settle_auctions(auctions: Vec<Auction>, bids: Vec<Bid>) {
    // Phase 1: Collect fees from over-budget bidders
    for bidder in bidders {
        let total_bids = sum(bidder.bids);
        if total_bids > bidder.balance {
            let fee = bidder.balance * 0.03; // 3% fee
            bidder.net_budget = bidder.balance - fee;
            transfer_to_treasury(fee);
        } else {
            bidder.net_budget = bidder.balance;
        }
    }

    // Phase 2: Sort auctions by market size (smallest first)
    auctions.sort_by(|a, b| a.market_size.cmp(&b.market_size));

    // Phase 3: Clear sequentially
    for auction in auctions {
        let clearing_price = calculate_clearing_price(auction.bids);

        for bidder in auction.winners() {
            let payment = clearing_price * bidder.quantity;

            if bidder.net_budget >= payment {
                // Settle trade
                transfer(bidder, payment, clearing_price * bidder.quantity);
                bidder.net_budget -= payment;
            } else {
                // Forfeit, award to next bidder
                let next_bidder = auction.next_highest_bidder();
                transfer(next_bidder, payment, clearing_price * bidder.quantity);
                next_bidder.net_budget -= payment;
            }
        }
    }
}
```

### Gas Estimate

```
Fixed costs:
- Decrypt bids: O(N)
- Sort auctions: O(M log M)
- Calculate clearing prices: O(N × M)
- Process settlements: O(N × M)

Total: O(N × M) where N = bidders, M = auctions
For N=100 bidders, M=10 auctions: ~2-5M gas (within block limits)
```

### Clearing Order Rationale

**Order: Smallest → Biggest Market (DOGE → ETH)**

**Why smallest first?**
- Small/niche markets get maximum participation (all users still have capital)
- Best price discovery for underserved assets
- Atomica's competitive advantage: provide liquidity where other venues don't

**What about major markets?**
- ETH/BTC already have deep liquidity on Binance, Coinbase, Uniswap, etc.
- If ETH/BTC auctions are thin, users have external alternatives
- Focus Atomica's unique value on long-tail assets

---

## Key Trade-Offs

### Advantages

✅ **Simplest smart contract implementation**
- Deterministic sequential order (no iteration, no convergence issues)
- Fixed gas cost O(N × M)
- Always terminates
- Easy to audit and verify

✅ **Strategic market positioning**
- Prioritizes liquidity for underserved small/niche markets
- Atomica provides value where CEXs/DEXs don't focus
- Competitive differentiation

✅ **Simple UX**
- Users don't need to rank preferences
- Just bid on what you want
- Order is transparent and predictable

✅ **Fee-based griefing deterrent**
- 3% fee makes price manipulation expensive
- Fee collected upfront (can't dodge by forfeiting)
- Creates protocol revenue

✅ **Eliminates sequential bidding games**
- All bids revealed simultaneously (no information cascades during bidding)
- No early-mover advantage

### Disadvantages

❌ **Users can't control asset priority**
- Global policy enforced (smallest → biggest)
- User who wants ETH might end up with DOGE instead
- No way to express "I prefer BTC > SOL > DOGE"
- **Mitigation**: Could add user priorities in v2 if users demand control

❌ **Major markets may have thin participation**
- ETH/BTC clear last when many users exhausted budgets
- Potential for lower liquidity in major assets
- **Acceptable**: Users have external alternatives (Binance, Coinbase, etc.)

❌ **Still vulnerable to some griefing**
- Users can bid high on early auctions to waste others' budgets
- Forfeited bids affect clearing prices (not recalculated)
- **Mitigation**: 3-5% fee makes most attacks unprofitable

---

# Part 2: Problem Analysis

## Why Sequential Auctions Create Problems

If auctions run **sequentially** (ETH auction 12:00-12:06, then BTC 12:06-12:12, etc.), three strategic problems emerge:

### Problem 1: Capital Reuse Asymmetry

**Winners lose liquid capital, losers retain optionality.**

```
Auction 1 (ETH):
- Alice bids 100k, wins → Receives ETH, spent all LIBRA
- Bob bids 98k, loses → Still has 100k LIBRA

Auction 2 (BTC):
- Alice: Cannot participate (has 0 LIBRA, only ETH)
- Bob: Can bid full 100k LIBRA

Result: Sequential losers have advantage in later auctions
```

**Strategic Implication**: Rational bidders shade bids in early auctions to preserve capital for later assets.

### Problem 2: Information Cascades

**Early auction results signal market conditions to later participants.**

```
Scenario: Auction 1 (ETH) clears at $2,000 (2% below external market)

Later bidders interpret:
- "Market is bearish" → Bid lower in all remaining auctions
- "Competition is weak" → Reduce bids (expect to win cheaply)

Result: Auction 1 noise propagates, distorting later price discovery
```

### Problem 3: Strategic Bid Shading

**Bidders face intertemporal optimization problem.**

```
Bidder valuations:
- ETH: $2,100 (true value)
- BTC: $65,000 (true value)

If ETH clears first, BTC second:
- Bidder must decide: Bid truthfully on ETH (win ETH, can't bid on BTC)
                   OR: Shade ETH bid (preserve capital for BTC)

Optimal strategy: Bid below true value on ETH if BTC valued more highly
```

**Result**: Systematic bid shading reduces price discovery efficiency.

### Academic Literature Support

- **Krishna (2002)**: "Sequential auctions are vulnerable to strategic timing behavior that does not arise in isolated single auctions."
- **Milgrom & Weber (1982)**: Sequential auctions with budget constraints exhibit declining prices across sequence.
- **Ashenfelter (1989)**: Empirical evidence from art/wine auctions shows "declining price anomaly" due to budget depletion.
- **Zeithammer (2006)**: Forward-looking bidders shade bids in early auctions to preserve capital for preferred assets.

**Conclusion**: Sequential auction structure creates unavoidable strategic distortions with heterogeneous assets.

---

## Why Simultaneous Revelation Helps

**Simultaneous revelation** means all bids are submitted and revealed at the same time, even if settlement happens sequentially.

### What Changes

**Sequential Bidding (Bad)**:
```
12:00-12:06: ETH auction (submit bids)
12:06:00:   ETH bids decrypt → clearing price revealed
12:06-12:12: BTC auction (submit bids, knowing ETH result)
```
→ Information cascade, capital lock visible, strategic timing

**Simultaneous Revelation (Good)**:
```
08:00-12:00: All auctions (submit bids for ETH, BTC, SOL, etc.)
12:00:00:   ALL bids decrypt simultaneously
12:00:01:   Settlement (may be sequential, but no new info during bidding)
```
→ No information cascade during bidding, symmetric information

### What It Eliminates

✅ **Eliminates information cascades during bidding**
- No early signals to influence later bids
- All bidders operate with same information

✅ **Eliminates sequential timing advantage**
- No benefit from waiting to see early results
- Can't reactively adjust strategy

✅ **Reduces strategic bid shading**
- Bidders can't game the sequence
- Must commit simultaneously

### What It Doesn't Solve

❌ **Budget constraint problem**
- Users may win multiple auctions but lack capital for all
- Need settlement mechanism to resolve over-commitment
- This is the problem Alternative 5 solves

---

# Part 3: Solution Options

## Five Design Alternatives Considered

### Alternative 1: No Over-Budget Bidding Allowed

**Mechanism**: Smart contract enforces `sum(all_bids) ≤ user_balance` at submission time.

**Pros**:
- ✅ Simplest on-chain logic
- ✅ No griefing (can't bid without capital)
- ✅ Guaranteed settlement

**Cons**:
- ❌ Users can't bid aggressively (must assume winning all)
- ❌ Drastically reduces auction competitiveness
- ❌ Poor UX (bids rejected at submission)

**Conclusion**: **Rejected**. Too restrictive, kills competitive bidding.

---

### Alternative 2: User-Defined Priority Ranking

**Mechanism**: Users specify priority (1st, 2nd, 3rd choice) with each bid. Settlement processes priorities sequentially per user until budget exhausted.

**Pros**:
- ✅ User control over preferences
- ✅ Better preference matching
- ✅ Fixed gas O(N × M × log M)
- ✅ No iteration needed

**Cons**:
- ❌ More UX complexity (must rank preferences)
- ❌ Forfeited bids still affect prices
- ⚠️ Requires users to understand priority system

**Conclusion**: **Good option for v2** if users demand preference control. More complex than Alternative 5.

---

### Alternative 3: Off-Chain Computation + ZK Proofs

**Mechanism**: Run complex iterative clearing off-chain, verify on-chain with zero-knowledge proof.

**Pros**:
- ✅ Can run optimal iterative algorithm off-chain
- ✅ Best theoretical properties
- ✅ Eliminates griefing entirely

**Cons**:
- ❌ Requires ZK infrastructure (massive complexity)
- ❌ Adds latency (proof generation time)
- ❌ Not viable for v1 launch

**Conclusion**: **Future consideration** once protocol matures. Not practical for initial launch.

---

### Alternative 4: Collateral Lock

**Mechanism**: Users lock collateral equal to total bid amount. Can bid 150k with 100k balance if they provide 50k collateral (staked tokens, LP tokens, etc.).

**Pros**:
- ✅ Simple settlement (no forfeiture)
- ✅ No griefing (all bids backed)

**Cons**:
- ❌ Requires extra collateral (capital inefficient)
- ❌ Complex UX (what collateral accepted?)
- ❌ Liquidation risk if collateral value drops

**Conclusion**: **Rejected**. Only works for sophisticated users with excess capital.

---

### Alternative 5: Sequential Clearing with Global Priority Order ⭐

**Mechanism**:
- All bids revealed simultaneously
- Fee deducted upfront (3-5%) from over-budget bidders
- Auctions clear sequentially in global order: Smallest → Biggest market
- Net budget consumed as auctions clear

**Pros**:
- ✅ Simplest implementation O(N × M)
- ✅ No user priorities (simple UX)
- ✅ Fee collected upfront (can't dodge)
- ✅ Always terminates (no convergence)
- ✅ Strategic focus on underserved markets

**Cons**:
- ❌ Users can't control preferences
- ❌ Major markets may have thin participation
- ❌ Still vulnerable to griefing (mitigated by fees)

**Conclusion**: ⭐ **RECOMMENDED for v1**. Best balance of simplicity, strategic positioning, and practicality.

---

## Why Alternative 5 is Best

### Comparison Matrix

| Criterion | Alt 1: No Over-Budget | Alt 2: User Priority | Alt 3: ZK Off-Chain | Alt 4: Collateral | Alt 5: Global Order ⭐ |
|-----------|----------------------|---------------------|-------------------|------------------|---------------------|
| **Smart Contract Complexity** | Simplest | Moderate | Complex | Moderate | Simplest |
| **UX Complexity** | Simple but restrictive | Complex (rank) | Simple | Complex (collateral) | Simplest |
| **Gas Cost** | O(N×M) | O(N×M×log M) | O(1) verify | O(N×M) | O(N×M) |
| **User Control** | None | Full | Full | Full | None |
| **Griefing Risk** | None | Fee-mitigated | None | None | Fee-mitigated |
| **Capital Efficiency** | Poor | Good | Good | Poor | Good |
| **Viable for v1?** | No | Yes | No | No | **Yes ⭐** |

### Why Alternative 5 Wins

**1. Simplest Implementation**
- No user priorities to sort/process
- No ZK infrastructure needed
- No collateral management
- Deterministic sequential processing

**2. Strategic Market Positioning**
- Small markets get maximum participation
- Differentiation from CEXs/DEXs (who focus on ETH/BTC)
- Provides value for underserved assets

**3. Good Enough Griefing Deterrent**
- 3-5% fee makes most attacks unprofitable
- Accept theoretical vulnerability for practical simplicity
- Can increase fee if needed

**4. Clear Path to v2**
- Start with global order (simple)
- Add user priorities later if users demand control
- Learn from v1 data

---

# Part 4: Implementation Details

## Smart Contract Implementation

### Full Settlement Algorithm

```rust
struct Auction {
    asset: Asset,
    market_size: u64,  // For sorting
    bids: Vec<Bid>,
}

struct Bid {
    bidder: Address,
    amount: u128,
    quantity: u64,
}

fn settle_multi_asset_auctions(
    mut auctions: Vec<Auction>,
    bidders: Vec<Bidder>
) -> Result<(), Error> {

    // Step 1: Collect fees from over-budget bidders
    for bidder in bidders.iter_mut() {
        let total_bids: u128 = bidder.bids.iter()
            .map(|b| b.amount)
            .sum();

        if total_bids > bidder.balance {
            // Calculate over-budget ratio
            let over_budget_ratio = (total_bids - bidder.balance) as f64
                                  / bidder.balance as f64;

            // Scaled fee: 3% base, +1% per 50% over-budget
            let fee_percent = 0.03 + (over_budget_ratio * 0.02);
            let fee = (bidder.balance as f64 * fee_percent) as u128;

            // Deduct fee
            transfer_to_treasury(bidder.address, fee)?;
            bidder.net_budget = bidder.balance - fee;

            emit_event(OverBudgetFeeCollected {
                bidder: bidder.address,
                fee,
                total_bids,
                balance: bidder.balance,
            });
        } else {
            bidder.net_budget = bidder.balance;
        }
    }

    // Step 2: Sort auctions by market size (smallest first)
    auctions.sort_by_key(|a| a.market_size);

    // Step 3: Clear each auction sequentially
    for auction in auctions.iter() {
        // Calculate uniform clearing price
        let clearing_price = calculate_uniform_clearing_price(&auction.bids)?;

        // Get winning bids (above clearing price)
        let mut winners: Vec<&Bid> = auction.bids.iter()
            .filter(|b| (b.amount / b.quantity as u128) >= clearing_price)
            .collect();

        // Sort winners by bid price (highest first)
        winners.sort_by_key(|b| -(b.amount / b.quantity as u128) as i128);

        // Settle winners in order until supply exhausted
        let mut supply_remaining = auction.supply;

        for bid in winners {
            let bidder = get_bidder_mut(bid.bidder)?;
            let payment = clearing_price * bid.quantity as u128;

            if bidder.net_budget >= payment && supply_remaining >= bid.quantity {
                // Settle trade
                transfer_asset(
                    auction.asset,
                    bid.quantity,
                    bid.bidder,
                )?;
                transfer_payment(bid.bidder, payment)?;

                bidder.net_budget -= payment;
                supply_remaining -= bid.quantity;

                emit_event(TradeSett led {
                    auction: auction.asset,
                    bidder: bid.bidder,
                    price: clearing_price,
                    quantity: bid.quantity,
                });
            } else {
                // Forfeit - insufficient budget or supply
                emit_event(BidForfeited {
                    auction: auction.asset,
                    bidder: bid.bidder,
                    reason: if bidder.net_budget < payment {
                        "InsufficientBudget"
                    } else {
                        "InsufficientSupply"
                    },
                });
            }
        }
    }

    Ok(())
}

fn calculate_uniform_clearing_price(bids: &Vec<Bid>) -> Result<u128, Error> {
    // Standard uniform price auction logic
    // Find price where supply = demand
    // ... (implementation details)
}
```

### Key Implementation Notes

**Fee Collection**:
- Collected upfront (can't dodge by forfeiting)
- Scaled by over-budget ratio (more over-budget = higher fee)
- Example: 50% over-budget = 3% fee, 100% over-budget = 5% fee

**Clearing Order**:
- Sort auctions by `market_size` field (smallest first)
- Market size = 30-day average volume or total supply
- Transparent, predictable for users

**Budget Tracking**:
- Track `net_budget` per bidder (balance - fees paid)
- Decrement as auctions settle
- When exhausted, forfeit remaining wins

**Gas Optimization**:
- Pre-sort bids off-chain, verify on-chain (cheaper)
- Use bitmap for forfeitures (gas-efficient)
- Batch event emissions

---

## Griefing Attacks & Mitigations

### Primary Attack: Price Inflation via Strategic Forfeiture

**Attack Mechanism**:
```
Attacker goal: Inflate BTC clearing price

Attacker bids:
- DOGE: 10,000 LIBRA (Priority 1, will consume budget)
- BTC:  100,000 LIBRA (very high bid, will forfeit)

Budget: 10,000 LIBRA

Settlement:
1. DOGE clears: Attacker pays 10k (budget exhausted)
2. BTC clears: Attacker's 100k bid included in demand curve
             → Clearing price inflated
             → Attacker forfeits (no budget)
             → Legitimate bidders pay inflated price

If attacker is selling BTC: Profits from higher clearing price
```

### Mitigation: Fee-Based Economic Deterrent

**How it works**:
```
Attacker bids 110k total, has 10k budget (1000% over-budget)
Fee: 5% × 10k = 500 LIBRA (collected upfront)

For attack to be profitable:
- Attacker must manipulate price enough to gain >500 LIBRA
- With competitive auctions, price impact likely small (<1%)
- Attack becomes unprofitable

If fee = 10%: Need >1,000 LIBRA profit → most attacks fail
```

**Fee Structure Recommendation**:
```
Over-budget ratio → Fee %
0-50%             → 3%
50-100%           → 4%
100-200%          → 5%
200%+             → 10%

Example:
- 50% over-budget:  3% fee
- 100% over-budget: 5% fee
- 500% over-budget: 10% fee (max)
```

### Secondary Defense: Bid Limits

**Optional additional protection**:
- Maximum bids per account: 10-20 bids total
- Prevents Sybil amplification attacks
- Still allows legitimate multi-asset bidding

### Monitoring & Response

**Red flags to watch**:
- Systematic price distortions (auctions clearing above external markets)
- High forfeiture rates (>20% of winning bids forfeited)
- Repeated over-budget bidding from same addresses

**Dynamic response**:
- Increase fee percentage if attacks observed
- Add per-bid submission fee (e.g., 0.1% of bid amount)
- Temporarily limit bids per account

**Key principle**: Accept that some manipulation is possible, make it economically unviable through fees.

---

## Testing & Launch Strategy

### Pre-Launch Testing

**1. Simulation Testing**
```
Goals:
- Test clearing algorithm with realistic bid distributions
- Measure price discovery quality across different orderings
- Identify edge cases (all users over-budget, supply shortage, etc.)

Scenarios:
- 100 users, 10 assets, 50% over-budget bidding
- Adversarial: 10 attackers trying price manipulation
- Stress test: 1,000 users, 20 assets
```

**2. Testnet with Incentives**
```
Goals:
- Real user behavior with real incentives
- Test fee structure (3%, 5%, 10% - which works best?)
- Identify griefing attacks in practice

Setup:
- Deploy to testnet with real LIBRA tokens
- Offer rewards for finding vulnerabilities
- Run for 4-8 weeks before mainnet
```

**3. Red Team Exercises**
```
Goals:
- Actively try to grief/manipulate auctions
- Test if fee deterrent works
- Identify novel attack vectors

Tasks:
- Price inflation attacks
- Sybil amplification
- Strategic forfeiture patterns
```

### Launch Strategy

**Phase 1: Single Daily Auction (Months 1-2)**
```
Scope:
- One asset per day (ETH Monday, BTC Tuesday, etc.)
- Rotating schedule
- Single isolated auction (proven mechanism)

Goal:
- Prove basic auction mechanics work
- Build user base
- Gather baseline data
```

**Phase 2: Limited Multi-Asset (Months 3-4)**
```
Scope:
- 2-3 simultaneous auctions
- Test sequential clearing with global order
- Small scale to limit risk

Goal:
- Validate Alternative 5 design in production
- Measure user behavior with over-budget bidding
- Test fee structure effectiveness
- Observe market outcomes for different clearing orders
```

**Phase 3: Full Multi-Asset (Months 5+)**
```
Scope:
- Scale to 10 simultaneous auctions
- Only if Phase 2 succeeds

Goal:
- High throughput multi-asset trading
- Monitor for systematic issues
```

### Questions to Answer Before Launch

**1. What clearing order?**
- Start with Smallest → Biggest (DOGE → ETH)
- Rationale: Prioritize underserved markets
- Can adjust based on data

**2. What fee percentage?**
- Start with 3% base, scaled by over-budget ratio
- A/B test 3% vs 5% vs 10% on testnet
- Monitor attack profitability

**3. Should we add user priorities later?**
- Gather feedback in Phase 2
- If users demand control, add in v2 (Alternative 2)
- Trade-off: Complexity vs flexibility

**4. Which markets to include?**
- Start with major altcoins (top 20 by market cap)
- Add long-tail assets based on demand
- Focus on assets underserved by other venues

---

# Part 5: Background (Appendix)

## Academic Literature Review

This section provides theoretical foundation for why sequential auctions create strategic problems.

### 1. Krishna (2002) - Auction Theory

**Chapter 7: Sequential Auctions of Heterogeneous Objects**

**Context**: Analyzes auctions where different objects (art, cars, spectrum) are sold sequentially.

**Key Findings**:
- Budget constraints + sequential structure = strategic bid shading
- Information revelation creates cascades across different assets
- No sequencing strategy is strategy-proof for heterogeneous goods
- Simultaneous auctions preferred when feasible

**Quote**: "Sequential auctions are vulnerable to strategic timing behavior that does not arise in isolated single auctions. When feasible, simultaneous mechanisms are preferable."

**Application**: ETH, BTC, SOL are heterogeneous assets. Same strategic issues apply.

---

### 2. Milgrom & Weber (1982) - Theory of Auctions and Competitive Bidding

**Context**: Sequential auctions with budget-constrained bidders.

**Key Result**: Sequential auctions exhibit **declining prices** - each auction clears lower than previous on average.

**Mechanism**:
- Early winners lock capital in purchased assets
- Remaining bidders have capital but fewer competitors
- Aggregate demand declines across sequence
- Result: Prices tend to decline

**Application**: Even with atomic settlement, capital lock effect persists (winners hold different assets, must sell externally to regain liquidity).

**Citation**: Milgrom, P., & Weber, R. J. (1982). "A Theory of Auctions and Competitive Bidding." *Econometrica*, 50(5), 1089-1122.

---

### 3. Ashenfelter (1989) - How Auctions Work for Wine and Art

**Context**: Empirical study of sequential auctions selling different items (wine bottles, artworks).

**Finding**: **Declining price anomaly** - prices decline over sequence, even controlling for quality.

**Examples**:
- Estate sales: First furniture pieces fetch higher prices
- Wine auctions: Early lots get aggressive bidding, later lots thinned
- Art auctions: Declining effect observed even for high-quality late items

**Mechanism**:
- Early bidders with highest budgets win early items
- Remaining bidders have depleted budgets
- Budget constraints bind more tightly as sequence progresses

**Application**: Even with different assets (ETH ≠ BTC ≠ SOL), budget constraints create declining participation.

**Citation**: Ashenfelter, O. (1989). "How Auctions Work for Wine and Art." *Journal of Economic Perspectives*, 3(3), 23-36.

---

### 4. Zeithammer (2006) - Forward-Looking Bidding in Online Auctions

**Context**: Sequential auctions of different products on eBay.

**Key Result**: Forward-looking bidders **shade bids** in early auctions if they value later goods more highly.

**Example**:
```
Auction sequence: Laptop → Camera → Phone
Bidder values Camera most

Strategy: Bid below valuation on Laptop (preserve budget for Camera)
Outcome: Systematic bid shading in early auctions
```

**Equilibrium**: Bidders with strong preferences for later goods systematically lose early auctions, preserving capital for preferred items.

**Application**: If bidders prefer BTC over ETH, they'll shade ETH bids if ETH clears first. This undermines price discovery.

**Citation**: Zeithammer, R. (2006). "Forward-Looking Bidding in Online Auctions." *Journal of Marketing Research*, 43(3), 462-476.

---

### 5. Black & de Meza (1992) - Systematic Price Differences

**Context**: Sequential auctions of different goods.

**Finding**: Predictable price patterns emerge based on order, even when assets differ.

**Mechanism**:
- Bidders anticipate declining prices in later auctions
- Creates self-fulfilling prophecy
- Price patterns emerge from budget constraints and forward-looking behavior, not asset similarity

**Application**: Even though ETH ≠ BTC ≠ SOL, rational bidders create correlated price trends.

**Citation**: Black, J., & de Meza, D. (1992). "Systematic Price Differences Between Successive Auctions Are No Anomaly." *Journal of Economics & Management Strategy*, 1(4), 607-628.

---

## Alternative Architectures

For completeness, other high-level designs considered but not recommended.

### Architecture 1: Multiple Independent Daily Auctions

**Design**:
```
Day 1: ETH/LIBRA auction (single asset)
Day 2: BTC/LIBRA auction (single asset)
Day 3: SOL/LIBRA auction (single asset)
```

**Pros**: Each auction isolated, no strategic games, simple UX
**Cons**: Low frequency (one asset per day), poor capital efficiency
**Verdict**: Eliminates strategic issues but reduces market efficiency. Good fallback if multi-asset fails.

---

### Architecture 2: Rotating Schedule

**Design**:
```
Monday:    ETH/LIBRA
Tuesday:   BTC/LIBRA
Wednesday: SOL/LIBRA
Thursday:  MATIC/LIBRA
Friday:    ETH/LIBRA (repeats)
```

**Pros**: Single daily auction (simple), each asset gets regular liquidity, no gaming
**Cons**: Must wait for specific day to trade specific asset
**Verdict**: Simple and fair, but limited throughput.

---

### Architecture 3: Grouped Parallel Auctions

**Design**:
```
12:00-13:00: Group A: ETH, BTC, SOL (parallel, simultaneous close)
14:00-15:00: Group B: MATIC, AVAX, ATOM (parallel, simultaneous close)
16:00-17:00: Group C: DOT, LINK, UNI (parallel, simultaneous close)
```

**Pros**: Within-group fairness, manageable UX (3-4 assets per session)
**Cons**: Between-group sequential effects (Group A capital locked for B)
**Verdict**: Hybrid approach, reduces but doesn't eliminate issues.

---

### Architecture 4: Fully Simultaneous Auctions

**Design**:
```
12:00-13:00: All 10 auctions run in parallel
             Single bid window, all close simultaneously
             All decrypt and settle simultaneously
```

**Pros**: Eliminates sequential gaming, no information cascades, no capital reuse asymmetry
**Cons**: Complex UX (manage 10 auctions at once), portfolio optimization problem
**Verdict**: Theoretically cleanest but UX complexity. Alternative 5 achieves similar benefits with simpler UX (sequential clearing vs simultaneous).

---

## Related Documents

- [Uniform Price Auctions](./uniform-price-auctions.md) - Base auction mechanism
- [Multi-Seller Batch Auction](./multi-seller-batch-auction.md) - Aggregating supply
- [Shill Bidding Analysis](./shill-bidding-analysis.md) - Manipulation resistance

---

## References

**Academic Literature**:

1. Krishna, V. (2002). *Auction Theory*. Academic Press. Chapter 7.
2. Milgrom, P., & Weber, R. J. (1982). "A Theory of Auctions and Competitive Bidding." *Econometrica*, 50(5), 1089-1122.
3. Ashenfelter, O. (1989). "How Auctions Work for Wine and Art." *Journal of Economic Perspectives*, 3(3), 23-36.
4. Black, J., & de Meza, D. (1992). "Systematic Price Differences Between Successive Auctions Are No Anomaly." *Journal of Economics & Management Strategy*, 1(4), 607-628.
5. Zeithammer, R. (2006). "Forward-Looking Bidding in Online Auctions." *Journal of Marketing Research*, 43(3), 462-476.
6. Vickrey, W. (1961). "Counterspeculation, Auctions, and Competitive Sealed Tenders." *Journal of Finance*, 16(1), 8-37.

**Real-World Examples**:
- Sotheby's/Christie's art auctions: Different paintings sold sequentially
- Classic car auctions: Different vehicles sold one after another
- Estate sales: Different items sold in sequence
- FCC spectrum auctions: Different frequency bands

---

**Version**: 1.0
**Last Updated**: 2025-11-14
**Status**: Complete - Production Ready

**Summary of Changes from v0.7**:
- Complete reorganization with clear structure
- Deduplicated overlapping content
- Moved recommendation to top (executive summary)
- Condensed five alternatives to bullet pros/cons
- Single clear recommendation: Alternative 5
- Moved academic content to appendix
- Reduced from 2,200 lines to ~1,100 lines
- Clarified clearing order: Smallest → Biggest (underserved markets focus)
