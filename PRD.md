# Atomica Product Requirements Document

## Executive Summary

**What:** Atomica enables trustless cross-chain atomic swaps via daily batch auctions with futures delivery.

**Why:** Existing cross-chain exchanges require bridges (introducing custody risk, wrapped tokens, and governance centralization) or suffer from liquidity fragmentation, MEV exploitation, and adverse selection for liquidity providers.

**How:** Users lock native assets on their home blockchain and participate in a single daily batch auction where professional market makers competitively bid using sealed bids. Assets settle X hours after auction close without bridges, wrapped tokens, or custodians.

**Key Innovation:** Futures market model with mandatory sealed bids (timelock encryption) concentrates liquidity, enables fair price discovery, and provides sustainable economics without protocol subsidies.

## Problem Statement

Cross-chain asset exchange today faces compounded risks:

**Bridge Risks:**
- Custodial risk (e.g., WBTC governance changes, bridge hacks)
- Wrapped tokens that can depeg from native assets
- Smart contract vulnerabilities ($900M+ in bridge exploits)
- Governance centralization via multisig control

**DEX Risks:**
- MEV exploitation (front-running, sandwich attacks)
- Adverse selection for passive liquidity providers (LVR, impermanent loss)
- Liquidity fragmentation across chains
- Capital inefficiency (idle capital in pools or locked in escrow)

**Combined Impact:**
- Multiple transaction steps expose users to all risks sequentially
- Accumulated fees from bridge + DEX swaps on both chains
- Fragmented UX requiring multiple wallets and wrapped token management
- Time-based risk during multi-step processes

**See:** [Prior Art: Decentralized Exchanges](docs/background/prior-art.md) for detailed analysis of existing solutions and their shortcomings.

## Solution: Atomic Auctions with Futures Delivery

### Core Mechanism

Atomica introduces **Atomic Auctions**: a novel design combining atomic swaps' trustless cross-chain execution with auction-based competitive price discovery.

**Key Properties:**
1. **Native Cross-Chain Execution** - Direct delivery of native assets without bridges or wrapped tokens
2. **Futures Market Model** - Delivery X hours after auction close (not spot market)
3. **Batch Auctions with Sealed Bids** - Single daily auction per pair with mandatory timelock encryption
4. **Active Liquidity Provision** - Market makers compete to clear orders (no passive LPs)
5. **Self-Sustaining Economics** - Market makers earn through bid-ask spreads, no subsidies needed

### Why Futures, Not Spot?

**Core Insight:** Cross-chain atomic swaps inherently require coordination time and settlement delays. Rather than fighting this constraint, we embrace it.

**Benefits:**
- **Price smoothing** - Futures pricing naturally reduces sensitivity to momentary spikes
- **Better market maker economics** - Known settlement time enables hedging, reduces risk premium
- **Liquidity concentration** - Single daily auction aggregates all volume into critical mass
- **Simpler mechanism** - No reserve prices needed (large liquid auction provides protection)
- **Clear user expectations** - Users know they're buying futures for next-day delivery

**Tradeoff:** Not suitable for time-sensitive trades requiring immediate execution. Future phases can add premium spot auctions for users willing to pay wider spreads.

### Daily Batch Auction Architecture (Phase 1 Launch)

**Structure:**
- **One unified batch auction per day** per trading pair (e.g., ETH/LIBRA, BTC/LIBRA, USDC/LIBRA)
- **Auctioneers (Sellers):** Users holding quote asset (e.g., USDC on Ethereum) wanting to purchase base asset (e.g., LIBRA)
- **Bidders (Market Makers):** Holders of base asset (LIBRA on home chain) submit sealed bids
- **No reserve prices** at launch (relies on market maker competition in large batch)
- **Settlement delay:** X hours after auction close (recommended 12-24 hours)

**Example Flow:**
```
08:00 UTC - Bid Window Opens
  └─ Users on Ethereum lock USDC and initiate auction participation

08:00-12:00 UTC - Bid Submission Window
  └─ Market makers on home chain submit encrypted sealed bids for LIBRA
  └─ Zero-knowledge proofs ensure bid validity (solvency, balance) without revealing amounts

12:00 UTC - Auction Close & Automatic Decryption
  └─ Drand timelock automatically decrypts all bids (no reveal phase to grief)
  └─ Clearing price determined at lowest qualifying bid (uniform price auction)

18:00 UTC - Settlement (6 hours after close)
  └─ Assets delivered to all participants atomically
  └─ Native assets on both chains (no wrapped tokens)
```

**Why Single Daily Auction:**
- Aggregates many small users into meaningful total volume
- Creates critical mass attractive to market makers
- Reduces chicken-and-egg bootstrapping problem
- Simpler coordination vs. many small auctions throughout day

## Technical Architecture

### Cross-Chain Transaction Verification

**Challenge:** How to trustlessly verify transactions on other blockchains without oracles or bridges?

**Solution:** The Home chain maintains cryptographic accumulators (merkle roots) of Away chain block headers, verified using zero-knowledge proofs.

**How It Works:**

1. **Away Chain Header Commitment**
   - Home chain maintains on-chain record of Away chain block headers
   - Headers verified trustlessly using ZK proofs (e.g., Succinct Labs, Optimism approaches)
   - Substantial production software already exists for ZK rollups directly applicable here

2. **Transaction Inclusion Proofs**
   - Standard merkle tree proofs demonstrate specific transactions occurred on Away chain
   - Home chain verifies proofs against committed block headers
   - No trusted oracles or bridge operators needed

3. **Atomic Settlement**
   - Verify user locked assets on Away chain before auction execution
   - Prove both sides of cross-chain swap completed successfully
   - Cryptographic proofs provide same security as native on-chain verification

**Cost Optimization:**
- ZK batching compresses multiple verifications into single proof
- Home chain can subsidize verification costs as public good
- Amortize gas costs across many transactions in batch

**See:** [Atomic Guarantee Mechanism](atomic-guarantee-mechanism.md) for detailed technical implementation.

### Sealed Bid Implementation: Timelock Encryption

**Critical Requirement:** For the daily batch futures model to work effectively, sealed bid privacy is **essential** - even more critical than in multi-auction spot models.

**Why Sealed Bids Are Mandatory:**

Without reserve prices to protect sellers, sealed bids become the primary defense against manipulation:

1. **Prevents Shill Bidding** - Market makers cannot strategically lower bids at last second
2. **Eliminates Timing Games** - No advantage to bidding early vs. late (all decrypt simultaneously)
3. **Fair Information Structure** - All bidders compete on equal footing without information asymmetry
4. **Winner's Curse Mitigation** - Bidders cannot game uniform clearing price by observing competitors

**Implementation via Drand Timelock:**

- Bids encrypted using drand-based timelock encryption
- All bids remain cryptographically sealed until auction close time
- Automatic decryption via drand randomness beacon (no interactive reveal phase)
- Zero-knowledge proofs ensure bid validity (solvency, balance) at submission without revealing amounts
- One-shot settlement after automatic decryption

**Technical Feasibility:** This approach is **practical and implementable** using:
- ZK-friendly Poseidon-based encryption for proving bid validity
- Drand timelock for trustless automatic decryption
- Zero-knowledge proofs of balance and solvency at bid submission
- No interactive reveal phase (prevents griefing attacks)

**See:** [Timelock Encryption for Sealed Bids](timelock-bids.md) for complete technical specification.

## Game Theory & Economics

### Uniform Price Auction Mechanism

**How It Works:**

1. Market makers submit sealed bids specifying quantity and price
2. Bids aggregated and sorted by price (highest to lowest)
3. Clearing price set at **lowest qualifying bid** that satisfies total quantity
4. **All winning bidders pay the same uniform clearing price** (regardless of their bid)

**Example:**
- Auction for 100 ETH
- Bidder A: 40 ETH @ $2,000
- Bidder B: 30 ETH @ $1,980
- Bidder C: 40 ETH @ $1,950
- **Result:** All clear at $1,950 (all bidders pay $1,950/ETH even though A and B bid higher)

**Why This Design:**

- **Revenue equivalence** to Vickrey auctions under certain conditions (Nobel Prize-winning research by Vickrey, Milgrom, Wilson)
- **Incentive compatibility** - Bidders motivated to bid near true valuation (protected by uniform pricing)
- **MEV resistance** - Batch execution makes transaction ordering irrelevant
- **Public information tolerance** - Uniform pricing makes visible bids less exploitable than in DCLOBs

**See:** [Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md) for detailed game-theoretic analysis and [Shill Bidding: Formal Analysis](shill-bidding-analysis.md) for manipulation attack vectors and mitigations.

### Self-Sustaining Economics

**Market Maker Compensation:**
- Earn through bid-ask spreads (buy at auction clearing price, sell/hedge on external markets)
- Futures pricing allows proper hedging strategies
- Settlement delay reduces inventory risk premium
- No protocol fees or subsidies required

**Why Sustainable:**
- Market makers actively choose which auctions to participate in (self-selection)
- Competitive bidding drives spreads toward fair risk-adjusted rates
- Single large daily auction worth infrastructure investment
- Sufficient volume to justify competitive participation

**Comparison to Alternatives:**
- **CPMMs:** Passive LPs suffer LVR and impermanent loss with zero compensation (require subsidies)
- **Spot Auctions:** Fragmented liquidity across many small auctions, harder to bootstrap
- **Futures Auctions:** Concentrated liquidity, hedgeable risk, self-sustaining

**See:** [CPMM vs Auction: Comprehensive Comparison](cpmm-vs-auction.md) for detailed economic analysis across all three models.

## Settlement Delay Considerations

The settlement delay after auction close is a key design parameter:

**Short Delay (6-12 hours):**
- ✅ Lower inventory risk for market makers
- ✅ Better for users wanting quick delivery
- ✅ Closer to spot market pricing
- ❌ Less time for market makers to hedge (may result in wider spreads)

**Medium Delay (24 hours):**
- ✅ Full day for market makers to manage positions
- ✅ May result in tighter spreads due to better hedging opportunities
- ✅ Clear "next-day delivery" mental model
- ❌ Longer wait for users

**Long Delay (48+ hours):**
- ✅ True futures market dynamics, potentially best pricing
- ❌ Significant wait time may frustrate users

**Recommended for Launch:** **12-24 hour settlement delay** balances user expectations with market maker risk management.

## Evolution Roadmap

The daily futures model is optimized for **bootstrapping liquidity**. As volume grows, the protocol can evolve:

### Phase 1 (Launch): Single Daily Batch Auction
- **Focus:** Build critical mass, establish market maker relationships
- **Goal:** Demonstrate economic viability without subsidies
- **Features:**
  - One daily auction per trading pair
  - Sealed bids via timelock encryption
  - Futures delivery (12-24 hour settlement)
  - No reserve prices

### Phase 2 (Growth): Multiple Daily Auctions
- **Trigger:** Consistent volume exceeding threshold (e.g., $10M+ daily)
- **Additions:**
  - Auctions for different geographies (Asia, Europe, Americas hours)
  - Maintain futures model but increase frequency
  - Still use sealed bids for each auction
  - Bid automators for continuous market maker participation

### Phase 3 (Maturity): Hybrid Spot + Futures Options
- **Trigger:** Deep liquidity with many active market makers
- **Additions:**
  - Premium spot auctions (shorter settlement) for users willing to pay wider spreads
  - Maintain futures auctions for best pricing
  - Reserve price mechanism available for large individual orders requiring guarantees
  - Reserve price penalty (5% of reserve × volume) prevents manipulation

### Phase 4 (Advanced): Market-Driven Frequency
- **Trigger:** Mature market with predictable volume patterns
- **Additions:**
  - Dynamic auction timing based on volume
  - Dynamic settlement windows based on market conditions
  - Sophisticated order types (limit orders, fill-or-kill, etc.)
  - Potential evolution toward continuous trading if liquidity supports it

## Design Principles

Atomica prioritizes:

1. **Trustlessness over convenience** - Cryptographic guarantees, no custodians
2. **Economic sustainability over UX familiarity** - Self-sustaining market maker economics
3. **Practical deployability over theoretical privacy ideals** - Timelock encryption, not fully homomorphic encryption
4. **Market-driven liquidity over protocol subsidies** - Competitive bidding, no token emissions

**Key Tradeoffs Accepted:**
- Futures delivery instead of spot execution (embrace cross-chain latency)
- Active market makers instead of passive LPs (sustainable economics)
- Daily batch auction instead of continuous trading (liquidity concentration for bootstrap)
- Temporary bid privacy instead of full privacy (practical cryptography)

**See:** [Ideal Solution Characteristics](docs/design/ideal-characteristics.md) for full requirements analysis with tradeoffs.

## Open Questions

1. **Data Availability Risk** - How is data availability of the away chain guaranteed for home-chain verifiers when only block headers are submitted?

2. **Fraud Proof Latency** - What is the expected time window for submitting fraud proofs, and how does this affect finality and UX?

3. **Validator Incentives** - Since no extra reward is provided, what prevents rational home-chain validators from ignoring away-chain header submissions or fraud proofs?

4. **Sybil Resistance for Bidders** - Without KYC or reputation, what mechanisms limit Sybil bidding beyond griefing cost?

5. **DoS on Auction Participation** - Can an attacker cheaply spam fake bids or commitments to delay auction clearing or inflate verification load?

6. **Economic Bounds on Griefing** - What is the maximum griefing cost an attacker can impose vs. the minimum stake they must lock?

7. **Misbehavior of Away-Chain Validators** - If the away chain reorganizes or censors deposits, how is this detected and resolved on the home chain?

8. **Handling Header Submission Failure** - What happens if staked home-chain validators fail (collude or go offline) and headers stop being submitted?

9. **Auction Liveness Guarantees** - If no valid bids can be decrypted or verified due to fraud proof disputes, is the auction canceled, delayed, or force-closed?

10. **Cross-Chain Fork Choice Conflicts** - How does the home chain decide which away-chain header branch is canonical in the presence of competing submissions?

11. **Upgrade & Parameter Change Governance** - Who decides fee parameters, bid commitment formats, fraud proof circuits, etc., and how are upgrades coordinated across chains?

12. **State Blowup from Multiple Auctions** - How is storage growth managed if many auctions run in parallel and commitments must remain accessible until fraud windows close?

13. **Partial Participation Strategy** - If bidders only participate in select auctions, does this create exploitable patterns (e.g., inference attacks on private bids)?

14. **Replay or Double-Use of Commitments** - Can a malicious bidder reuse a valid commitment across auctions to create confusion or extract unintended optionality?

## Documentation Structure

This PRD provides the high-level product specification. For detailed analysis and technical specifications, see:

### Background & Context
- [Prior Art: Decentralized Exchanges](docs/background/prior-art.md) - Existing DEX mechanisms and their shortcomings
- [CoW Swap Analysis](docs/background/cow-swap-analysis.md) - Case study of batch auction approach

### Design & Requirements
- [Ideal Solution Characteristics](docs/design/ideal-characteristics.md) - Requirements and tradeoffs
- [CPMM vs Auction Comparison](cpmm-vs-auction.md) - Detailed economic analysis of exchange mechanisms

### Technical Specifications
- [Atomic Guarantee Mechanism](atomic-guarantee-mechanism.md) - Cross-chain atomicity implementation
- [Timelock Encryption for Sealed Bids](timelock-bids.md) - Bid privacy technical specification
- [Technology Limitations](docs/technical/technology-limitations.md) - Why fully private auctions aren't feasible

### Game Theory & Economics
- [Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md) - Auction mechanism and strategic properties
- [Shill Bidding Analysis](shill-bidding-analysis.md) - Manipulation attacks and mitigations

## References

**Nobel Prize Winners in Auction Theory:**

- Vickrey, W. (1961). "Counterspeculation, Auctions, and Competitive Sealed Tenders." *Journal of Finance*, 16(1), 8-37. — Awarded 1996 Nobel Prize in Economics for foundational work on auction theory and revenue equivalence theorem.

- Wilson, R. (1979). "Auctions of Shares." *Quarterly Journal of Economics*, 93(4), 675-689. — Seminal game-theoretic analysis of uniform-price multi-unit auctions.

- Milgrom, P. and Wilson, R. (2020). Awarded Nobel Prize in Economics "for improvements to auction theory and inventions of new auction formats."

**Additional Resources:**

- The Nobel Prize Committee. (2020). "Scientific Background on the Sveriges Riksbank Prize in Economic Sciences in Memory of Alfred Nobel 2020: Improvements to Auction Theory and Inventions of New Auction Formats." Available at: https://www.nobelprize.org/uploads/2020/09/advanced-economicsciencesprize2020.pdf
