# Futures Market Model for Atomic Auctions

This document explains why Atomica uses a futures market model rather than spot trading for cross-chain atomic swaps, and details the daily batch auction architecture.

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
- Bidders price in expected value over settlement window
- Less volatility-driven slippage compared to spot markets

**2. Better Bidder Economics**
- Known settlement time enables proper hedging strategies
- Bidders can take offsetting positions on other exchanges
- Settlement delay reduces inventory risk premium
- Lower risk = tighter spreads = better pricing for users

**3. Liquidity Concentration**
- Single daily auction aggregates all volume into critical mass
- Many small users create meaningful total volume together
- More attractive to bidders than fragmented small auctions
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

**Potential Future Enhancement:** Premium spot auctions (shorter settlement) for users willing to pay wider spreads. Futures auctions maintain best pricing.

## Daily Batch Auction Architecture

### Structure

**One unified batch auction per day** per trading pair (e.g., ETH/LIBRA, BTC/LIBRA, USDC/LIBRA)

**Participants:**
- **Auctioneers (Sellers):** Users holding quote asset (e.g., USDC on Ethereum) wanting to purchase base asset (e.g., LIBRA)
- **Bidders:** Holders of base asset (LIBRA on home chain) submit sealed bids

**Key Parameters:**
- **No reserve prices** at launch (relies on competitive bidding in large batch)
- **Settlement delay:** 1-3 hours after auction close
- **Bid window:** 4-hour submission window (e.g., 08:00-12:00 UTC)

### Example Flow

```
08:00 UTC - Bid Window Opens
  └─ Users on Ethereum lock USDC and initiate auction participation
  └─ Auction contract on home chain becomes active

08:00-12:00 UTC - Bid Submission Window
  └─ Bidders on home chain submit encrypted sealed bids for LIBRA
  └─ Economic deposits prevent spam bids (returned if valid, slashed if malformed)
  └─ Bids remain cryptographically sealed via Dual-Layer Timelock (Validator + Seller)
 
12:00 UTC - Auction Close & Automatic Decryption
  └─ Validators and Seller Jury publish decryption shares (threshold signatures)
  └─ All bids decrypt automatically (no interactive reveal phase)
  └─ Clearing price determined at lowest qualifying bid (uniform price auction)
  └─ All winning bidders pay same clearing price

12:00-13:00 UTC - Settlement Window (1 hour)
  └─ Participants review bids and verify smart contracts operated correctly
  └─ Bidders hedge positions on external markets (prevents arbitrage)
  └─ Cross-chain proofs generated and verified
  └─ Atomic settlement prepared

13:00 UTC - Settlement (1 hour after close)
  └─ Assets delivered to all participants atomically
  └─ Native assets on both chains (no wrapped tokens)
  └─ Bidders transfer LIBRA to users
  └─ Users' locked USDC released to bidders
```

### Why Single Daily Auction?

**Liquidity Bootstrapping:**
- Aggregates many small users into meaningful total volume
- Reduces fragmentation across multiple auctions
- Creates predictable large batch attractive to bidders

**Bidder Appeal:**
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

The settlement delay after auction close is a key design parameter. Atomica uses a **1-3 hour** settlement delay.

### Rationale for Short Delay

**Dual Purpose:**

1. **Economic Benefit:** Prevents arbitrage and private information withholding
   - Bidders cannot exploit price movements between bid submission and delivery
   - Private information about market conditions revealed during auction becomes public before settlement
   - **Key insight:** 24 hours is NOT required for this benefit; a few hours is sufficient

2. **Verification Period:** Allows all participants to review before settlement
   - Users can verify their bids decrypted correctly
   - All parties can review auction clearing was computed properly
   - Time to confirm smart contracts operated as expected
   - Transparency builds trust in the mechanism

### Benefits of Short Delay (1-3 hours)

**For Users:**
- ✅ Same-day settlement (bid morning, settle early afternoon)
- ✅ Lower price risk exposure (minimal time between bid and delivery)
- ✅ Faster capital velocity
- ✅ Better UX (rapid settlement)

**For Bidders:**
- ✅ Lower inventory risk (very short exposure to price movements)
- ✅ Still sufficient time for basic hedging on external markets
- ✅ Tighter operational requirements but manageable
- ✅ Prevents complex arbitrage strategies (keeps mechanism simple)

**For Protocol:**
- ✅ Simpler mechanism (less time for edge cases to emerge)
- ✅ Faster feedback loops for improvements
- ✅ Easier to monitor and respond to issues
- ✅ Reduces attack surface (shorter window for manipulation)

### Comparison to Longer Delays

| Delay | Economic Benefit | Verification | User Experience | Bidder Complexity |
|-------|------------------|--------------|-----------------|-------------------|
| **1-3 hours** | ✅ Sufficient | ✅ Adequate | ✅ Rapid same-day | ✅ Manageable |
| 6 hours | ✅ Sufficient | ✅ Ample | ✅ Same-day | ✅ More hedging time |
| 12 hours | ✅ Sufficient | ✅ Excessive | ⚠️ Next-day | ⚠️ More time than needed |
| 24 hours | ✅ Sufficient | ❌ Excessive | ❌ Full cycle wait | ✅ Full day to hedge |
| 48+ hours | ✅ Sufficient | ❌ Unnecessary | ❌ Too slow | ✅ Multi-day strategies |

**Analysis:** The economic benefit (preventing arbitrage) does NOT require 24 hours—it only requires enough time that price information becomes public before settlement. 1-3 hours achieves this. The verification benefit similarly doesn't require a full day; 1-3 hours gives everyone time to review.

### Tuning Parameters

Atomica launches with **1-3 hour** settlement delay, which can be adjusted based on real-world data:

- **Shorten to 1 hour** if verification proves very fast and bidders comfortable
- **Extend to 3 hours** if bidders need more hedging time or verification needs longer
- Monitor spread compression vs settlement delay
- User satisfaction with delivery timing

**Flexibility:** The core mechanism doesn't change with timing adjustments, making this a safe parameter to tune post-launch. The 1-3 hour range provides flexibility to optimize based on market feedback.

## Comparison to Alternative Models

### vs. Spot Auctions (Multiple Daily)

| Dimension | Futures (Single Daily) | Spot (Multiple Daily) |
|-----------|------------------------|------------------------|
| **Liquidity per Auction** | Concentrated | Fragmented |
| **Bidder Appeal** | High (worth investment) | Lower (thin auctions) |
| **Bootstrapping** | Easier (critical mass) | Harder (need bidders for each) |
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
| **Price Discovery** | Efficient (auction) | Requires continuous quotes |
| **Implementation** | Simpler | Much more complex |

## Success Criteria for Futures Model

**Key Metrics:**

1. **Auctions consistently clear** - Every daily auction has sufficient bidder participation
2. **Competitive pricing** - Spreads comparable to spot exchanges + reasonable futures premium
3. **User adoption** - Growing volume indicating users accept futures delivery model
4. **Bidder profitability** - Bidders remain profitable and expand participation
5. **No gaming** - No manipulation or strategic behavior undermining mechanism

**If unsuccessful:**
- Analyze friction points (timing, spreads, UX confusion)
- Consider shorter settlement delays or reserve price safety nets
- May need to reconsider spot auction model (but only after thorough analysis)

## Related Documents

- [Atomica PRD](../../Prd.md) - Product overview
- [CPMM vs Auction Comparison](../game-theory/cpmm-vs-auction-comparison.md) - Detailed economic analysis of why auctions over AMMs
- [Uniform Price Auctions](../game-theory/uniform-price-auctions.md) - Auction mechanism details
- [Seller-Stake DKG Design](timelock-seller-stake-dkg.md) - How sealed bids work (Dual-Layer Timelock)
