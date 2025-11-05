# CPMM vs Auction: A Comparison for Cross-Chain Atomic Swaps

## Executive Summary

This document provides an objective comparison of two exchange mechanisms for enabling trustless cross-chain asset swaps: **Constant Product Market Makers (CPMMs)** and **Uniform Price Auctions**. Both mechanisms aim to solve the same problem—enabling users to exchange native assets across blockchains without bridges or wrapped tokens—but use fundamentally different approaches to liquidity provision and price discovery.

## Context and Assumptions

This analysis assumes the following infrastructure:

**Technical Infrastructure:**
- High-throughput home chain (100K+ TPS) coordinating cross-chain swaps
- Away chains (e.g., Ethereum, Bitcoin) where users hold native assets
- Sub-second cross-chain state verification via zero-knowledge proofs
- Merkle proof inclusion for trustless transaction verification
- Intent-based transaction execution (transactions validated against expected state or rejected)

**Economic Constraints:**
- No oracle price feeds (pure market-based price discovery)
- No protocol fees or profit extraction
- Trustless execution (no custodians or centralized intermediaries)

## Constant Product Market Maker (CPMM) Approach

### Mechanism Overview

CPMMs use automated liquidity pools based on the constant product formula: **x × y = k**

**How it works:**
1. Liquidity providers (LPs) deposit paired assets (e.g., ETH and SOL) into pools on the home chain
2. Pool maintains constant product invariant: if one asset is withdrawn, proportionally more of the other must be deposited
3. Users lock assets on away chain (verified via ZK proofs)
4. Home chain executes swap against pool at algorithmically determined price
5. User receives swapped assets atomically

**Price Discovery:**
- Prices determined by pool ratio (x/y)
- Arbitrageurs trade when pool price deviates from external markets
- Continuous arbitrage brings pool prices toward market equilibrium

### Advantages

**1. Instant Execution**
- Swaps execute immediately without waiting periods
- Users know execution price instantly (subject to slippage)
- No coordination with other market participants needed

**2. Always Available Liquidity**
- Pools provide 24/7 liquidity if LPs maintain deposits
- No dependence on market makers being online
- Predictable availability

**3. Simple User Experience**
- Familiar AMM interface used across DeFi
- Clear slippage calculations
- No auction mechanics to understand

**4. Proven Track Record**
- CPMMs power billions in trading volume (Uniswap, SushiSwap, etc.)
- Battle-tested smart contract patterns
- Well-understood security properties

**5. Composability**
- Liquidity pools can be used for other DeFi primitives (lending, derivatives)
- LP tokens can be used as collateral elsewhere
- Established integration patterns

### Challenges

**1. Liquidity Provider Incentive Problem**

Without protocol fees, LPs face negative expected returns:

- **Loss-Versus-Rebalancing (LVR):** LPs systematically lose to informed traders who exploit stale prices. Even with sub-second updates, price movements create arbitrage opportunities where LPs sell low and buy high.

- **Impermanent Loss:** LPs lose when asset prices diverge, even without arbitrage exploitation.

- **Zero Compensation:** Without fees, LPs earn nothing to offset these losses.

**Possible Solutions:**
- Token emission rewards (requires governance token and treasury)
- External subsidies from protocols seeking liquidity
- Altruistic LPs providing public good liquidity
- Cross-subsidization from other revenue streams

**Challenge:** All solutions require external capital sources or unsustainable token inflation.

**2. JIT Liquidity Attacks**

**Important note:** Under the zero-fee assumption of this analysis, JIT attacks are economically irrational since there are no fees to extract. JIT providers would face the same LVR losses as passive LPs without compensation. However, this challenge becomes critical if fees are introduced:

High-throughput chains enable Just-In-Time (JIT) liquidity provision when fees exist:
- Sophisticated operators monitor incoming swaps
- Add liquidity immediately before swap execution
- Capture fees without holding long-term risk
- Remove liquidity immediately after

**Impact (if fees were introduced):**
- Passive LPs squeezed out by professional JIT players
- Exacerbates LP profitability problem
- May lead to liquidity fragmentation or concentration
- Creates tension: fees needed to compensate LPs, but fees enable JIT extraction

**3. Capital Efficiency**

CPMMs require liquidity distributed across entire price curves:
- Most capital sits idle at prices that rarely trade
- Concentrated liquidity (Uniswap v3) improves efficiency but increases complexity
- Concentrated liquidity also amplifies JIT attack surface

**4. Adverse Selection**

LPs are passive counterparties to all trades:
- Cannot choose which swaps to fill
- Cannot refuse trades at unfavorable prices
- Information asymmetry favors informed traders over passive LPs

**5. Price Impact and Slippage**

Large trades face significant slippage:
- Bonding curve causes superlinear (hyperbolic) price impact following the constant product formula
- Fragmented liquidity across multiple pools worsens problem
- May require routing through multiple hops

### Economic Viability Without Fees

**Critical Issue:** Zero-fee CPMMs lack sustainable LP incentive mechanisms.

LPs suffer guaranteed losses (LVR + IL) with no compensation. Rational LPs would exit, leading to:
- Depleted liquidity pools
- Extreme slippage
- Non-functional exchange

**Requires:** External subsidy mechanism (token emissions, protocol treasury, charitable donations) to maintain liquidity.

## Uniform Price Auction Approach

### Mechanism Overview

Single-sided auctions where market makers competitively bid to clear user orders.

**How it works:**
1. User locks assets on away chain and initiates auction on home chain
2. Market makers submit bids specifying quantity and price
3. Bids aggregated and sorted by price (highest to lowest)
4. Clearing price set at lowest qualifying bid that satisfies total quantity
5. All winning bidders pay the same uniform clearing price
6. Atomic settlement executes cross-chain swap

**Example:**
- User sells 100 ETH
- Bidder A: 40 ETH @ $2,000
- Bidder B: 30 ETH @ $1,980
- Bidder C: 40 ETH @ $1,950
- **Result:** All clear at $1,950 (lowest qualifying bid)

**Price Discovery:**
- Competitive bidding reveals market prices
- Market makers bid based on external market conditions
- Uniform pricing creates strategic bid-shading incentives (demand reduction). While not incentive-compatible like Vickrey auctions, competition among market makers may discipline strategic behavior. Revenue equivalence to other formats holds under certain benchmark conditions (Milgrom-Wilson 2020).

### Advantages

**1. Self-Sustaining Economics**

Market makers compensated through bid-ask spreads:
- Buy from user at auction clearing price
- Sell on external markets at higher price (or hedge positions)
- Spread compensates for inventory risk, capital costs, and potential adverse selection
- In competitive equilibrium, expected profits approach zero after risk adjustment (contestable markets theory)
- No protocol fees or subsidies required

**Important caveat:** Market maker compensation represents fair payment for risk-bearing and capital provision, not risk-free arbitrage profits. Market makers face inventory risk (price movements between auction clearing and external execution) and winner's curse effects (discussed below).

**Impact:** Economically viable without external capital sources, though market makers earn competitive returns, not excess rents.

**2. Active Liquidity Provision**

Market makers actively choose which auctions to fill:
- Evaluate each opportunity individually
- Only participate when expected profit > risk-adjusted costs
- Can hedge positions on other markets
- Reduced adverse selection through self-selection, though market makers still face winner's curse (Milgrom & Weber 1982): winning an auction reveals that other bidders valued the opportunity less, which may signal negative information about asset value

**3. Capital Efficiency**

Market makers deploy capital only when clearing specific auctions:
- No idle capital sitting in pools
- Capital moves to where it's needed
- Comparable efficiency to centralized order books without custody risk

**4. MEV Resistance**

Uniform price auction structure limits MEV exploitation:
- Batch execution makes transaction ordering irrelevant
- All winners pay same price regardless of bid
- Traditional front-running (transaction reordering) provides no advantage
- However, bid visibility still creates timing games (late bidders observe early bids)
- Shill bidding mitigated by no-bid-lowering policy

**5. No Passive LP Losses**

Active participation eliminates traditional AMM problems:
- No LVR (market makers choose when to provide liquidity)
- No impermanent loss (no permanent capital deposits)
- No JIT attacks (auction format prevents last-second extraction)

**6. Competition Drives Pricing**

Multiple market makers competing benefits users:
- Bid competition narrows spreads
- More participants = better prices
- Natural market mechanism without protocol intervention

### Challenges

**1. Execution Latency**

Auctions require waiting for batch window:
- Users must wait for auction to close
- May be seconds to minutes depending on design
- Market conditions can change during window

**Mitigation:** Reserve prices allow users to set minimum acceptable clearing price.

**2. Liquidity Uncertainty**

No guaranteed liquidity:
- Depends on market maker participation
- Thin markets may receive few or no bids
- Users face execution risk

**Mitigation:** Reserve prices with commit-reveal and penalty mechanisms incentivize realistic expectations.

**3. Complexity**

More complex than simple swap interface:
- Users must understand auction mechanics
- Reserve price decisions require market knowledge
- Less familiar than traditional AMM UX

**4. Market Maker Barriers**

Requires sophisticated participants:
- Market makers need capital, infrastructure, and expertise
- Fewer potential participants than passive LPs
- Risk of market maker centralization

**Counter-argument:** Professional market making may actually provide better execution than amateur LPs.

**5. Shill Bidding Risk**

Strategic bid manipulation in low-liquidity scenarios:
- Winning bidder could lower bid at last moment
- Collusion between bidders to suppress prices
- Information advantage from seeing existing bids

**Mitigations:**
- No bid lowering policy (bids cannot be reduced once submitted)
- Reserve price with commit-reveal scheme
- Reserve price rejection penalty (5% of reserve × volume)
- Bid automators (always-online agents) increase participation

**6. Bid Visibility and Timing Games**

Public bid visibility creates information asymmetries and strategic timing issues:
- Late bidders observe early bids and gain information advantage
- Strategic advantage to waiting until near auction close
- Can bid just above expected clearing price after observing competition
- Creates timing games and potential for strategic manipulation

**Mitigations:**
- Sealed-bid auctions (commit-reveal for all bids)
- Batch submission windows where all bids revealed simultaneously
- VCG-style mechanisms (though computationally expensive)
- Adds implementation complexity

**7. Cold Start Problem**

Bootstrapping initial market maker participation:
- New markets need critical mass of MMs
- Chicken-and-egg: users want liquidity, MMs want volume
- May require initial incentives or market making commitments

## Comparative Analysis

### Economic Sustainability

| Dimension | CPMM | Auction |
|-----------|------|---------|
| **LP/MM Compensation** | None (0% fees) | Bid-ask spread |
| **External Subsidy Needed** | Yes (token emissions or grants) | No |
| **Long-term Viability** | Questionable without subsidies | Self-sustaining |
| **Rational Participation** | Negative EV for LPs | Positive EV for MMs |

**Analysis:** Without fees, CPMMs lack sustainable incentive mechanisms. Auctions are self-compensating through market dynamics.

### Liquidity Provision

| Dimension | CPMM | Auction |
|-----------|------|---------|
| **Participation Model** | Passive (deposit and wait) | Active (choose opportunities) |
| **Capital Efficiency** | Low (idle capital across price ranges) | High (capital only when clearing) |
| **Adverse Selection** | Systematic (LPs can't refuse trades) | Reduced (self-selection) but winner's curse remains |
| **JIT Attack Surface** | N/A under zero-fee assumption (would be high if fees exist) | Low (auction format prevents) |

**Analysis:** Active liquidity provision in auctions significantly reduces (but doesn't eliminate) adverse selection compared to passive LPs. Winner's curse and timing games create residual information asymmetries in auctions.

### User Experience

| Dimension | CPMM | Auction |
|-----------|------|---------|
| **Execution Speed** | Instant | Delayed (auction window) |
| **Price Certainty** | Slippage curve | Competitive bidding |
| **Complexity** | Simple swap interface | Auction mechanics + reserve prices |
| **Familiarity** | High (common in DeFi) | Lower (less common) |
| **Liquidity Guarantee** | Yes (if pools funded) | No (depends on MM participation) |

**Analysis:** CPMMs provide simpler UX and instant execution, but auction complexity may be justified by better economics.

### Price Discovery

| Dimension | CPMM | Auction |
|-----------|------|---------|
| **Mechanism** | Arbitrage-driven | Competitive bidding |
| **Speed** | Continuous | Batch (auction window) |
| **Accuracy** | Depends on arbitrageur activity | Depends on MM competition |
| **Information Efficiency** | Reactive (follows external markets) | Active (MMs incorporate market data) |

**Analysis:** Both rely on external market information. CPMMs update continuously; auctions discover prices in batches.

### Security and Trust

| Dimension | CPMM | Auction |
|-----------|------|---------|
| **Trustlessness** | Fully trustless (pure algorithm) | Fully trustless (competitive market) |
| **MEV Resistance** | Moderate (intent validation helps) | High (uniform price + batch), but timing games possible |
| **Oracle Dependency** | None | None |
| **Smart Contract Risk** | Well-understood CPMM patterns | Novel auction contract logic |

**Analysis:** Both achieve trustless execution. CPMMs have more battle-tested contracts; auctions have stronger MEV resistance against transaction reordering but remain vulnerable to bid timing manipulation.

### Capital Requirements

| Dimension | CPMM | Auction |
|-----------|------|---------|
| **Total Capital Needed** | High (pools for all pairs) | Lower (active deployment) |
| **Capital Lock-up** | Continuous (deposited in pools) | Episodic (only when clearing) |
| **Opportunity Cost** | High (capital can't be used elsewhere) | Low (capital free between auctions) |

**Analysis:** Auctions require significantly less total capital and impose lower opportunity costs.

### Scalability

| Dimension | CPMM | Auction |
|-----------|------|---------|
| **New Trading Pairs** | Requires new LP deposits per pair | MMs can service multiple pairs |
| **Thin Markets** | Extreme slippage or no liquidity | May receive few/no bids |
| **High Volume Markets** | Scales well (if liquidity exists) | Scales well (attracts more MMs) |
| **Cross-Chain Complexity** | Each chain needs separate pools | Centralized auction coordination |

**Analysis:** Both face challenges with thin markets. CPMMs require more capital per new pair.

## Scenario Analysis

### High-Volume Established Pairs (ETH/USDC)

**CPMM:**
- Deep liquidity pools can handle large volumes
- Instant execution valuable for high-frequency traders
- JIT attacks may concentrate LP profits to sophisticated players
- LP subsidy burden high due to volume-based LVR

**Auction:**
- Many market makers compete (tight spreads)
- Auction latency may frustrate frequent traders
- Competitive environment ensures good pricing
- Self-sustaining without subsidies

**Winner:** Mixed. CPMMs excel on UX; auctions on economics.

### Low-Volume Long-Tail Pairs (obscure tokens)

**CPMM:**
- Unlikely to attract LP deposits without subsidies
- Any liquidity would face extreme slippage
- High IL risk for LPs on volatile assets
- Probably non-functional

**Auction:**
- May receive few market maker bids
- Reserve prices give users control over acceptable prices
- MMs can service many pairs without capital lock-up
- More likely to function even with thin activity

**Winner:** Auctions (lower capital requirements enable long-tail coverage)

### Large Single Trades

**CPMM:**
- Significant price impact from bonding curve
- May require routing through multiple pools
- Slippage predictable but potentially severe

**Auction:**
- Market makers can bring substantial capital for single auction
- Competitive bidding may provide better pricing than slippage curve
- Reserve price protects user from poor execution

**Winner:** Auctions (capital concentration for individual opportunities)

### Time-Sensitive Trades

**CPMM:**
- Instant execution ideal for time-sensitive needs
- Price known immediately (subject to slippage)

**Auction:**
- Auction window introduces delay
- Market conditions may change during wait
- Reserve price provides some protection

**Winner:** CPMMs (instant execution advantage)

## Hybrid and Alternative Approaches

### CPMM for Small Trades + Auctions for Large

**Concept:** Route small trades through CPMM pools (subsidized for UX) and large trades through auctions (where economics matter more).

**Advantages:**
- Best UX for common small swaps
- Best economics for large trades
- Subsidies only needed for small-trade pools

**Challenges:**
- Complexity of dual systems
- Defining threshold between "small" and "large"
- Potential for gaming the routing logic

### Oracle-Assisted Models

**Concept:** Use price oracles to reduce LVR or guide auction bidding.

**Advantages:**
- Could reduce LP losses in CPMM
- Could provide reference prices for auctions

**Challenges:**
- Introduces trusted third party (violates trustlessness goal)
- Oracle manipulation risk
- Centralization concerns

**Note:** Excluded from primary analysis per trustless constraint.

### Liquidity Mining for CPMM Bootstrap

**Concept:** Temporary token emissions to bootstrap CPMM liquidity until sufficient volume generates fees.

**Advantages:**
- Could overcome cold-start problem
- Proven model in DeFi

**Challenges:**
- Requires governance token and treasury
- Contradicts "no protocol fees" constraint
- Mercenary capital may exit when rewards end
- Unsustainable if fees never materialize

## Open Questions and Research Directions

### For CPMMs

1. **Sustainable Zero-Fee LP Incentives:** Can any mechanism sustainably compensate LPs without protocol fees or external subsidies?

2. **JIT Attack Mitigation:** Are there smart contract designs that prevent JIT liquidity extraction while preserving capital efficiency?

3. **Cross-Chain LVR Quantification:** What is the empirical magnitude of LVR in sub-second cross-chain scenarios?

4. **Alternative Invariants:** Could different bonding curves (e.g., stableswap) reduce slippage and IL for specific use cases?

### For Auctions

1. **Auction Duration Optimization:** What is the optimal batch window balancing latency vs. MM participation?

2. **Market Maker Bootstrapping:** How to attract initial market makers to new markets/chains?

3. **Shill Bidding Empirics:** Do no-bid-lowering and reserve price penalties sufficiently mitigate manipulation in practice?

4. **Bid Privacy:** Could commit-reveal or ZK techniques enable private bidding without trusted intermediaries?

5. **Dynamic Auction Parameters:** Should auction duration, reserve price penalties, or other parameters adjust based on market conditions?

### General

1. **User Preference Studies:** Do users prioritize instant execution or better pricing? How much latency is acceptable?

2. **Market Maker Competition:** How many market makers are needed for competitive pricing? What are barriers to entry?

3. **Thin Market Solutions:** Neither approach excels in thin markets. Are there novel mechanisms for guaranteed liquidity?

4. **Cross-Chain Finality:** How do different away-chain finality times (Bitcoin ~60min vs Ethereum ~15min) affect both models?

## Conclusion

Both CPMMs and uniform price auctions can enable trustless cross-chain atomic swaps, but they make fundamentally different tradeoffs:

**CPMMs** prioritize user experience (instant execution, familiar interface) but face severe economic challenges without protocol fees. The passive liquidity provision model results in negative expected value for LPs through LVR and impermanent loss, requiring external subsidies to function. Note that under zero-fee assumptions, JIT attacks are economically irrational; however, introducing fees to compensate LPs would enable JIT exploitation.

**Auctions** prioritize economic sustainability through active liquidity provision and self-compensating market makers. Bid-ask spreads provide natural profit mechanisms without protocol fees or subsidies, though market makers earn competitive returns (not excess rents) and face inventory risk and winner's curse effects. However, auctions introduce execution latency, complexity, and potential timing game vulnerabilities, potentially degrading user experience compared to instant AMM swaps. Importantly, uniform price auctions are not incentive-compatible—bidders strategically shade bids below true valuations (demand reduction).

**The core question is whether sustainable economics or superior UX should take priority.**

If zero-fee, zero-subsidy operation is a hard constraint, auctions appear to be the only economically viable approach. CPMMs require either:
- Protocol fees (contradicts constraint)
- External subsidies (unsustainable/requires governance)
- Oracles to reduce LVR (contradicts trustlessness)

If protocol fees or subsidies are acceptable, CPMMs become viable and may provide better UX for certain use cases, especially high-volume pairs where subsidy costs can be justified.

A hybrid approach—subsidized CPMMs for common small trades and auctions for large trades—may offer the best balance, though at the cost of increased system complexity.

Ultimately, the choice depends on the project's prioritization of:
- Economic sustainability vs. UX simplicity
- Decentralization purity vs. pragmatic compromises
- Long-term viability vs. short-term adoption

Both mechanisms represent valid engineering choices with distinct advantages and unavoidable tradeoffs.

## Academic References and Further Reading

**Important Note:** The following references represent core concepts discussed in this analysis. Readers should verify exact citation details (volume, issue, page numbers) independently before citing in academic work, as some bibliographic details may be approximate.

### Core Auction Theory - Verified Foundational Works

**Vickrey, W. (1961).** "Counterspeculation, Auctions, and Competitive Sealed Tenders." *Journal of Finance*, 16(1), 8-37.
- Foundational work on auction theory and incentive compatibility
- Introduced Vickrey (second-price) auctions with truthful bidding properties

**Milgrom, P. and Weber, R. J. (1982).** "A Theory of Auctions and Competitive Bidding." *Econometrica*, 50(5), 1089-1122.
- Classic treatment of winner's curse in common value auctions
- Analysis of how information affects bidding strategies and revenue

**Milgrom, P. and Wilson, R. (2020).** Nobel Memorial Prize in Economic Sciences.
- Awarded "for improvements to auction theory and inventions of new auction formats"
- Nobel Prize documentation: nobelprize.org

**Kyle, A. S. (1985).** "Continuous Auctions and Insider Trading." *Econometrica*, 53(6), 1315-1335.
- Foundational model of informed trading and market depth
- Shows how information asymmetry affects liquidity and price formation

**Myerson, R. B. and Satterthwaite, M. A. (1983).** "Efficient Mechanisms for Bilateral Trading." *Journal of Economic Theory*, 29(2), 265-281.
- Impossibility theorem for efficient bilateral trade under asymmetric information
- Shows fundamental limitations of mechanism design with private information

### Auction Theory - Multi-Unit and Uniform Price Mechanisms

**Note:** The following papers discuss uniform price auctions and demand reduction. Exact citations should be verified:

- **Wilson, R.** Work on uniform-price share auctions (late 1970s) analyzing strategic bidding in divisible good auctions
- **Ausubel, L. and Cramton, P.** Research on demand reduction in multi-unit auctions demonstrating strategic bid shading
- **Back, K. and Zender, J.** Work on treasury auctions comparing uniform-price and discriminatory formats

These papers collectively establish that uniform price auctions are subject to strategic bid shading (demand reduction) and are not incentive-compatible.

### Market Microstructure - Adverse Selection

**Glosten, L. R. and Milgrom, P. R. (1985).** "Bid, Ask and Transaction Prices in a Specialist Market with Heterogeneously Informed Traders." *Journal of Financial Economics*, 14(1), 71-100.
- Foundational model of adverse selection in market making
- Derives bid-ask spreads as compensation for trading with informed traders

### DeFi and Automated Market Makers

**Note:** DeFi research is rapidly evolving. The following represents current understanding but citations may be approximate:

**Loss-Versus-Rebalancing (LVR) Concept:**
- Recent academic work has formalized how AMM liquidity providers systematically lose to arbitrageurs
- Key researchers include Milionis, Moallemi, Roughgarden, and others
- LPs effectively provide free options to informed traders due to discrete price updates

**Uniswap and Concentrated Liquidity:**
- Uniswap v3 introduced concentrated liquidity positions allowing LPs to specify price ranges
- Technical documentation available from Uniswap Labs
- Increases capital efficiency but creates additional complexity and risks

**Constant Function Market Makers (CFMMs):**
- Researchers including Angeris, Chitra, and others have provided mathematical analysis
- Work covers arbitrage conditions, price discovery, and oracle properties

### Platform Economics and Two-Sided Markets

**Rochet, J.-C. and Tirole, J. (2003).** "Platform Competition in Two-Sided Markets." *Journal of the European Economic Association*, 1(4), 990-1029.
- Foundational analysis of platform design with multiple user sides
- Explains pricing strategies including subsidizing one side

### Recommended Textbooks

**Milgrom, P. (2004).** *Putting Auction Theory to Work*. Cambridge University Press.
- Comprehensive treatment of practical auction design
- Bridges economic theory and real-world implementation

**Krishna, V. (2009).** *Auction Theory* (2nd Edition). Academic Press.
- Standard graduate-level textbook on auction theory
- Covers revenue equivalence, optimal auctions, and multi-unit mechanisms

**Börgers, T. (2015).** *An Introduction to the Theory of Mechanism Design*. Oxford University Press.
- Accessible introduction to mechanism design principles
- Covers incentive compatibility, implementation theory, and optimal mechanisms

### Important Disclaimer

This document synthesizes concepts from mechanism design, auction theory, market microstructure, and decentralized finance. While the economic principles discussed are well-established, the application to cross-chain atomic swaps represents novel synthesis. Specific citation details (especially for recent DeFi research) should be independently verified before use in academic work. The author has attempted to accurately represent economic concepts but cannot guarantee perfect citation accuracy for all sources.
