# Futures Market Model for Atomic Auctions

This document explains why Atomica uses a futures market model rather than spot trading for cross-chain atomic swaps, and details the daily batch auction architecture for Phase 1 launch.

## Core Insight: Embrace Latency, Don't Fight It

Cross-chain atomic swaps inherently require coordination time and settlement delays due to:
- Block finality times on away chains (Ethereum ~15min, Bitcoin ~60min)
- ZK proof generation and verification
- Cross-chain state synchronization
- Atomic settlement coordination

Rather than positioning this latency as a limitation, Atomica reframes the system as a **futures market** where users understand they're purchasing assets for delivery at a future time.

## Why Futures, Not Spot?

### Benefits

**1. Price Smoothing**
- Futures pricing naturally reduces sensitivity to momentary price spikes
- Market makers price in expected value over settlement window
- Less volatility-driven slippage compared to spot markets

**2. Better Market Maker Economics**
- Known settlement time enables proper hedging strategies
- Market makers can take offsetting positions on other exchanges
- Settlement delay reduces inventory risk premium
- Lower risk = tighter spreads = better pricing for users

**3. Liquidity Concentration**
- Single daily auction aggregates all volume into critical mass
- Many small users create meaningful total volume together
- More attractive to market makers than fragmented small auctions
- Solves chicken-and-egg bootstrapping problem

**4. Simpler Mechanism**
- No reserve prices needed at launch (large liquid auction provides natural protection)
- Fewer attack vectors compared to complex spot auction designs
- Easier to understand and audit

**5. Clear User Expectations**
- Users know they're buying futures for next-day delivery (not confused about spot vs delayed)
- Transparent about timing from the start
- Mental model similar to traditional futures markets

### Tradeoffs

**Not suitable for:**
- Time-sensitive trades requiring immediate execution
- Arbitrage opportunities with short windows
- Users needing same-day settlement

**Mitigation:** Phase 3+ can add premium spot auctions (shorter settlement) for users willing to pay wider spreads. Futures auctions maintain best pricing.

## Daily Batch Auction Architecture (Phase 1 Launch)

### Structure

**One unified batch auction per day** per trading pair (e.g., ETH/LIBRA, BTC/LIBRA, USDC/LIBRA)

**Participants:**
- **Auctioneers (Sellers):** Users holding quote asset (e.g., USDC on Ethereum) wanting to purchase base asset (e.g., LIBRA)
- **Bidders (Market Makers):** Holders of base asset (LIBRA on home chain) submit sealed bids

**Key Parameters:**
- **No reserve prices** at launch (relies on market maker competition in large batch)
- **Settlement delay:** X hours after auction close (recommended 12-24 hours)
- **Bid window:** 4-hour submission window (e.g., 08:00-12:00 UTC)

### Example Flow

```
08:00 UTC - Bid Window Opens
  └─ Users on Ethereum lock USDC and initiate auction participation
  └─ Auction contract on home chain becomes active

08:00-12:00 UTC - Bid Submission Window
  └─ Market makers on home chain submit encrypted sealed bids for LIBRA
  └─ Zero-knowledge proofs ensure bid validity (solvency, balance) without revealing amounts
  └─ Bids remain cryptographically sealed via drand timelock

12:00 UTC - Auction Close & Automatic Decryption
  └─ Drand randomness beacon releases decryption key
  └─ All bids decrypt automatically (no interactive reveal phase)
  └─ Clearing price determined at lowest qualifying bid (uniform price auction)
  └─ All winning bidders pay same clearing price

12:00-18:00 UTC - Settlement Window
  └─ Market makers hedge positions on external markets
  └─ Cross-chain proofs generated and verified
  └─ Atomic settlement prepared

18:00 UTC - Settlement (6 hours after close)
  └─ Assets delivered to all participants atomically
  └─ Native assets on both chains (no wrapped tokens)
  └─ Market makers transfer LIBRA to users
  └─ Users' locked USDC released to market makers
```

### Why Single Daily Auction?

**Liquidity Bootstrapping:**
- Aggregates many small users into meaningful total volume
- Reduces fragmentation across multiple auctions
- Creates predictable large batch attractive to market makers

**Market Maker Appeal:**
- Known schedule enables automated participation
- Sufficient volume in single auction worth infrastructure investment
- Predictable daily rhythm for risk management

**User Experience:**
- Simple mental model (one auction per day, like a farmers market)
- Predictable timing for planning transactions
- Clear expectations (futures delivery, not spot)

**Protocol Advantages:**
- Lower coordination overhead (one settlement vs. many)
- Simpler mechanism (no need to handle thin auctions)
- Easier to monitor and maintain

## Settlement Delay Considerations

The settlement delay after auction close is a key design parameter with tradeoffs:

### Short Delay (6-12 hours)

**Advantages:**
- ✅ Lower inventory risk for market makers (less time exposed to price movements)
- ✅ Better for users wanting quick delivery (same-day settlement possible)
- ✅ Closer to spot market pricing (futures premium smaller)

**Disadvantages:**
- ❌ Less time for market makers to hedge (may result in wider spreads to compensate for risk)
- ❌ Tighter operational window for market makers
- ❌ Higher stress testing requirements

**Best For:** Launch phase where proving fast execution is important for user adoption

### Medium Delay (24 hours)

**Advantages:**
- ✅ Full day for market makers to manage positions
- ✅ May result in tighter spreads due to better hedging opportunities
- ✅ Clear "next-day delivery" mental model (like Amazon Prime)
- ✅ Market makers can use global markets across timezones

**Disadvantages:**
- ❌ Longer wait for users (full 24-hour cycle)
- ⚠️ Moderate inventory risk (more than short, less than long)

**Best For:** Steady-state operation balancing user satisfaction with market maker profitability

### Long Delay (48+ hours)

**Advantages:**
- ✅ True futures market dynamics
- ✅ Maximum hedging flexibility for market makers
- ✅ Potentially best pricing for users (tightest spreads)
- ✅ Can use multi-day hedging strategies

**Disadvantages:**
- ❌ Significant wait time may frustrate users
- ❌ Higher price risk over longer delay period
- ❌ Users may seek alternatives with faster settlement

**Best For:** Institutional users prioritizing best execution over speed

### Recommendation for Launch

**12-24 hour settlement delay** balances user expectations with market maker risk management.

**Rationale:**
- Long enough for market makers to hedge effectively (encourages competitive participation)
- Short enough to maintain user interest (next-day delivery is familiar concept)
- Flexible range allows adjustment based on market conditions
- Can tune within range without changing core mechanism

**Tuning Parameters:**
- Start at 18 hours (mid-range)
- Monitor market maker feedback on spread compression opportunities
- Monitor user satisfaction with timing
- Adjust toward 12hr if users demand faster, toward 24hr if market makers need more time

## Comparison to Alternative Models

### vs. Spot Auctions (Multiple Daily)

| Dimension | Futures (Single Daily) | Spot (Multiple Daily) |
|-----------|------------------------|------------------------|
| **Liquidity per Auction** | Concentrated | Fragmented |
| **Market Maker Appeal** | High (worth investment) | Lower (thin auctions) |
| **Bootstrapping** | Easier (critical mass) | Harder (need MMs for each) |
| **User Expectations** | Clear (futures) | Confused (delayed "spot") |
| **Reserve Prices** | Not needed | Needed for protection |
| **Complexity** | Simpler | More complex |
| **Best Pricing** | Yes (hedgeable) | No (higher risk premium) |

### vs. Continuous Trading

| Dimension | Futures Batch | Continuous Trading |
|-----------|---------------|-------------------|
| **MEV Resistance** | Strong (batch) | Weak (ordering matters) |
| **Sealed Bids** | Natural fit | Complex to implement |
| **Liquidity Concentration** | Yes | Fragmented across time |
| **Price Discovery** | Efficient (auction) | Requires continuous MM quotes |
| **Implementation** | Simpler | Much more complex |

## Success Criteria for Futures Model

**Phase 1 Validation:**

1. **Auctions consistently clear** - Every daily auction has sufficient market maker participation
2. **Competitive pricing** - Spreads comparable to spot exchanges + reasonable futures premium
3. **User adoption** - Growing volume indicating users accept futures delivery model
4. **Market maker profitability** - MMs remain profitable and expand participation
5. **No gaming** - No manipulation or strategic behavior undermining mechanism

**If successful:** Demonstrates futures model viability, can expand to Phase 2 (multiple daily auctions)

**If unsuccessful:**
- Analyze friction points (timing, spreads, UX confusion)
- Consider shorter settlement delays or reserve price safety nets
- May need to reconsider spot auction model (but only after thorough analysis)

## Related Documents

- [Atomica PRD](../../Prd.md) - Product overview
- [Evolution Roadmap](evolution-roadmap.md) - How futures model evolves in later phases
- [CPMM vs Auction Comparison](../game-theory/cpmm-vs-auction-comparison.md) - Detailed economic analysis of why auctions over AMMs
- [Uniform Price Auctions](../game-theory/uniform-price-auctions.md) - Auction mechanism details
- [Timelock Encryption for Sealed Bids](../technical/timelock-bids.md) - How sealed bids work
