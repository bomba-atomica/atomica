# Atomica Product Requirements Document

## Executive Summary

**What:** Atomica is the global canonical market open/close auction for crypto—trustless cross-chain atomic swaps via twice-daily batch auctions with 1-3 hour settlement.

**Why:** Existing cross-chain exchanges require bridges ($2B+ hacked since 2021), suffer from liquidity fragmentation, and expose traders to MEV and adverse selection. Individual arbitrageurs face existential risk using bridges—one hack can wipe out their entire capital.

**How:** Users lock native assets on their home chains and participate in twice-daily sealed-bid batch auctions. Assets settle 1-3 hours after auction close. Cross-chain atomic trades execute without bridges or custodians.

**Key Innovations:**
- **Non-custodial with minimal lock time**: Assets locked only for the auction period—no prolonged custody risk
- **True cross-chain atomic trades**: Native assets move between chains without bridges, wrapped tokens, or custodians
- **Twice-daily liquidity concentration**: Two auctions per day aggregate global liquidity rather than fragmenting across time
- **Timelock IBE cryptography**: Identity-Based Encryption enables sealed bids that automatically decrypt at auction deadline—no interactive reveal phase
- **Encrypted mempools**: Bid contents hidden from validators until decryption, eliminating front-running and MEV extraction
- **High-throughput blockchain**: Built on Aptos-core infrastructure (Move VM, BLS signatures, parallel execution) for scalable auction processing
- **Double verification pathways**: Dual-layer security combining BLS threshold signatures (consensus) + ZK proofs (computation)—both must agree for settlement
- **Zero operator fees on major pairs**: Bitcoin and Ethereum markets have no network fees; deal breakers pay deal makers

## Problem Statement

Cross-chain asset exchange compounds risks from bridges and DEX mechanics:

**Bridge Risks:**
- $2B+ in bridge hacks (2021-2024): Ronin $625M, Wormhole $326M, Nomad $190M, etc.
- Counterparty risk existential for individual arbitrageurs (one hack = total loss)
- Wrapped token depegging, smart contract exploits, multisig governance centralization

**DEX Risks:**
- MEV exploitation ($600M+ extracted annually even in bear markets)
- Adverse selection for LPs (LVR: 5-25% annual losses to informed traders)
- Liquidity fragmentation across time and venues
- Wide spreads in low-liquidity markets (10-30%+)

**Combined Impact:** Every trade carries unhedgeable bridge risk, accumulated fees, fragmented UX, and price exploitation

**→ See:** [Prior Art: Decentralized Exchanges](docs/background/prior-art.md) for detailed analysis

## Solution: Atomic Auctions with batch settlement

Atomica introduces **Atomic Auctions**: trustless cross-chain execution combined with auction-based competitive price discovery.

**Core Properties:**
1. Native cross-chain execution (no bridges, no wrapped tokens)
2. Batch auction clearing with 1-3 hour settlement
3. Sealed bid auctions (N-layer timelock encryption)
4. Self-bootstrapping liquidity (arbitrageurs are both sellers AND bidders)
5. Self-sustaining economics (bid-ask spreads, no subsidies required)

**→ See:** [Auction Prior Art](docs/analysis/secondary-auctions-plus-continuous.md) for institutional auction precedents across asset classes

### Twice-Daily Batch Auctions

**Structure:**
- **Two auctions per day** to capture global liquidity:
  - **Western Auction:** 12:00 PM New York (17:00 UTC)
  - **Eastern Auction:** 12:00 PM Tokyo (03:00 UTC)
- All trading pairs clear **simultaneously** within each auction
- **Sellers (Sellers):** Users with quote assets wanting base assets
- **Bidders:** Base asset holders submit sealed bids
- No reserve prices at launch (relies on competitive bidding in large batch)
- Settlement: 1-3 hours post-auction

**Example Timeline (Western Auction):**
```
08:00 NYC  Bid window opens (users lock assets on away chains)
08:00-12:00 NYC  Bid submission window (sealed bids)
12:00 NYC  Auction close & automatic decryption (all assets simultaneously)
12:00 NYC  Clearing price determined for each pair (uniform price auction)
12:00-13:00 NYC  Settlement window (verification & hedging)
13:00 NYC  Settlement (native assets delivered atomically)
```

**Why 1-3 Hour Settlement (Not 24 Hours):**
1. **Economic benefit:** Prevents arbitrage and private information withholding—achievable in hours, not days
2. **Verification period:** All participants can review bids and confirm smart contracts operated correctly
3. **Better UX:** Same-day settlement (bid morning, settle afternoon)
4. **Lower risk:** Minimal price exposure between bid submission and delivery

**Why Two Auctions Per Day:**
- **Global coverage:** Captures liquidity from both Western and Eastern market participants
- **Optimal timing:** 12:00 PM local time aligns with peak trading activity in each region
- **Aggregates volume:** Each auction concentrates regional liquidity into critical mass
- **Manageable frequency:** Twice-daily is sufficient for most use cases while maintaining batch size

**→ See:** [Secondary Auctions Analysis](docs/analysis/secondary-auctions-plus-continuous.md) and [Optimal Time of Day Analysis](docs/analysis/optimal-time-of-day.md)

### Multi-Asset Auctions

**Simultaneous Clearing:** All trading pairs clear at the same time within each auction window. This provides:
- **Consistent pricing:** All assets priced at the same moment in time
- **Simpler mechanism:** No ordering dependencies or cascading effects
- **Fair access:** All markets treated equally

**Strategic Focus:** While all markets clear simultaneously, Atomica's competitive advantage is providing fair execution for **long-tail assets** where CEX/DEX liquidity is thin. Major pairs (ETH/BTC) already have deep liquidity elsewhere.

**→ See:** [Product Design v0 (Archived)](docs/archive/product-design-v0-ARCHIVED.md) for complete multi-asset mechanism

## Technical Architecture

### Cross-Chain Verification

**Unified Architecture:** All away chains (Ethereum, Solana, Base, Arbitrum, etc.) use identical verification mechanisms.

**Dual-Layer Verification:**
1. **BLS Consensus Layer:** Atomica validators sign merkle roots with BLS threshold signatures (requires 2/3+ validator agreement)
2. **ZK Computation Layer:** Anyone can verify auction execution correctness via ZK proofs (independent of validator honesty)

Settlement requires BOTH layers to agree on the merkle root. No trusted oracles or bridges.

**→ See:** [Architecture Overview](docs/technical/architecture-overview.md) and [Unified Away Chain Architecture](docs/decisions/unified-away-chain-architecture.md)

### Sealed Bid Implementation

**N-Layer "Onion" Timelock Encryption:** Bids encrypted using pluggable, configurable layers.

**Example: Dual-Layer (Validators + Sellers)**
1. **Outer Layer:** Atomica Validator Timelock (BLS12-381) - Decrypts at auction deadline
2. **Inner Layer:** Seller Group DKG (BLS12-381) - Decrypts only if Sellers (stake-weighted) participate

This prevents "Invisible Handshake" attacks where validators collude off-chain. Decryption requires cooperation from BOTH the Validator Set (>67%) AND the Seller Set (>33%). Invalid bids filtered post-decryption.

**Orthogonal Key Generation:** How each layer generates its keys (DKG, beacon, threshold) is independent of the onion encryption structure. Layers can be composed freely:
- Validators only, Validators + Drand, Validators + Sellers, Validators + Drand + Sellers, etc.

**Note:** Atomica chain is built using Aptos-core software (consensus, BLS signatures, Move VM), but runs as an independent blockchain with its own validators and governance.

**→ See:** [N-Layer Onion Timelock Design](docs/design/timelock-seller-stake-dkg.md) and [Atomica Validator Timelock Decision](docs/decisions/aptos-validator-timelock.md)

### Uniform Price Auction Mechanism

Bidders submit sealed bids (quantity + price). Bids sorted, clearing price set at lowest qualifying bid. All winners pay same uniform price (regardless of bid).

**Example:** Auction for 100 ETH with bids: A (40@$2000), B (30@$1980), C (40@$1950) → All clear at $1950

**Why:** Revenue equivalence to Vickrey auctions, incentive compatibility, MEV resistance, tolerates public information post-decryption

**→ See:** [Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md) for game theory analysis

### Account Abstraction

**Seamless Cross-Chain UX:** Users deposit on their preferred chain using familiar wallets (MetaMask, Phantom). Account abstraction maps Ethereum addresses to Atomica accounts, enabling users to sign bids with their Ethereum wallet without needing Atomica-native wallets or gas tokens.

**Key Innovation:** Users never leave their wallet ecosystem yet participate in cross-chain auctions.

**→ See:** [Ethereum Wallet Atomica Bridge](docs/technical/ethereum-wallet-atomica-bridge.md) and [Account Abstraction](docs/technical/account-abstraction.md)

## Market Opportunity

**The Provocation:** Why do crypto markets need to be 24/7, when nearly no other asset class requires this?

Equities trade on scheduled hours with opening/closing auctions. Bonds clear via periodic Treasury auctions. Commodities use the LME ring. Precious metals have LBMA fixings. Even spectrum licenses sell through FCC auctions. **Yet crypto operates 24/7/365 continuous trading—and suffers massive adverse selection as a result.**

**The Cost of 24/7:**
- Liquidity fragmented across every hour of every day
- Bidders must quote continuously or be adversely selected
- Thin orderbooks at off-peak hours enable manipulation
- MEV bots exploit every transaction, every block
- No canonical reference price—just noisy continuous feeds

**The Gap:** Institutional-grade auction infrastructure exists for every major asset class except crypto. No opening auction. No closing auction. No batch price discovery. Just continuous fragmentation.

**Atomica's Position:** The global canonical market open/close auction for crypto on business days. Two auctions per day (12:00 NYC, 12:00 Tokyo) establish reference prices for Bitcoin, Ethereum, and cross-chain assets—just as the NYSE open/close does for equities and the LBMA fixing does for gold.

**→ See:** [Continuous vs Auction Markets](docs/analysis/continuous-vs-auction-markets.md) for historical evidence on auction adoption across asset classes

## Economic Model

### Auction Advantages in Low-Liquidity Markets

**Critical Insight:** Auctions become MORE valuable as liquidity fragments.

During bear markets and in niche asset markets:
- Continuous markets: 100 traders arrive randomly → each crosses spread individually
- Batch auction: Same 100 traders aggregated at single moment → discovers unified clearing price

**The thinner the continuous market, the greater the auction advantage.**

**Empirical Evidence:**
- **European equity closing auctions:** 25-41% of daily volume (vs 7.5% in US)
- **Superior Price Discovery:** Closing prices discovered via auctions are 40% more accurate (closer to next day's open) than continuous trading closes (Pagano & Schwartz, 2003).
- **Reduced Volatility:** Auctions exhibit 30-50% lower volatility and 40-60% lower bid-ask spreads for comparable trade sizes (Lin et al., 1995).
- **Pattern:** As liquidity decreases → auction advantage increases

### Self-Sustaining Economics

Bidders (arbitrageurs) earn through bid-ask spreads (buy at auction price, sell/hedge on external exchanges). auction pricing enables known settlement time for proper hedging.

**Why 1-3 Hour Settlement Works:**
1. Prevents arbitrage around bid/delivery timing
2. Provides verification period
3. Still allows hedging on external markets
4. Same-day capital velocity

### Fee Structure: Deal Breakers Pay Deal Makers

**Core Principle:** All externalities are internalized. Participants whose bids move the market away from efficient clearing compensate those whose bids improve price discovery.

**Distance-to-Clearing-Price Rebates:**
- Fees are proportional to how far your bid was from the clearing price
- Bids near the clearing price (accurate price discovery) receive fee rebates
- Bids far from clearing price (noise/manipulation) pay higher fees
- This rewards accurate bidding and punishes uninformative participation

**Zero Fees for Major Markets:**
- **Bitcoin and Ethereum markets have no operator/network fees**
- All costs are internalized through the deal-breaker/deal-maker mechanism
- This ensures Atomica is competitive on the most liquid pairs

**How It Works:**
- "Deal makers" = bids that help establish the clearing price (near the equilibrium)
- "Deal breakers" = bids that are far from clearing or don't contribute to price discovery
- Fee flow: Deal breakers → Deal makers
- Net effect: Zero-sum fee redistribution, protocol extracts nothing on major pairs

**→ See:** [CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md) and [Bear Market Analysis](docs/analysis/bear-market.md)

## Development Status

**Current Progress:**
- ✅ **Risk #1 (Ethereum Signing):** Complete - users can sign Atomica transactions with MetaMask
- 🟡 **Risk #2 (Timelock Encryption):** In progress - N-layer onion encryption implementation
- ⏳ **Risk #3 (Cross-Chain Verification):** Pending - ZK light client for Ethereum state verification

**Timeline Estimate:**
- Risk #2: 7-10 weeks (current sprint)
- Risk #3: 10-15 weeks (after Risk #2)
- Total to MVP: ~4-6 months

**→ See:** [Technical Risks](docs/development/technical-risks.md) for detailed status

## Design Principles & System Properties

Atomica prioritizes:

1. **Trustlessness over convenience** - Cryptographic guarantees, no custodians
2. **Economic sustainability over UX familiarity** - Self-sustaining bidder economics, no subsidies
3. **Practical deployability over theoretical privacy** - Timelock encryption (works today) vs FHE (years away)
4. **Market-driven liquidity over protocol subsidies** - Competitive bidding, no token emissions
5. **Underserved markets over major pairs** - Long-tail assets where Atomica provides most value

### System Characteristics & Tradeoffs

| Characteristic | Ideal State | Atomica's Approach |
|----------------|-------------|--------------------|
| **Private Strategies** | Full privacy of strategies & prices | **Timelock Sealed Bids:** Temporary privacy during auction window; public post-decryption. |
| **MEV Resistance** | No front-running or censorship | **Batch Auctions:** Uniform clearing price makes ordering irrelevant; sealed bids prevent pre-auction front-running. |
| **Cross-Chain** | Native asset trading without bridges | **ZK Verification:** Cryptographic proof of away-chain state; atomic settlement without wrapped tokens. |
| **Liquidity** | Passive, non-adversarial | **Active Bidding:** Bidders compete on price; eliminates LP adverse selection (LVR). |
| **Adverse Selection** | No winner's curse | **Self-Selection:** Bidders choose participation; sealed bids equalize information access. |
| **User Experience** | Unified, single-wallet | **Account Abstraction:** Sign with existing wallets (MetaMask); single interface for cross-chain actions. |
| **Custodial Risk** | Trustless, non-custodial | **Atomic Settlement:** Assets locked only for auction duration; guaranteed delivery or refund. |
| **Capital Efficiency** | Minimized idle capital | **On-Demand Capital:** Bidders deploy liquidity only when clearing auctions; comparable to order books. |

### Key Tradeoffs Accepted

- **Batch Settlement vs Spot:** Embracing 1-3 hour latency to enable trustless cross-chain atomicity.
- **Active Bidding vs Passive LPs:** Prioritizing sustainable economics over passive yield farming.
- **Bootstrapping Focus:** Focusing on arbitrageurs and long-tail assets first.
- **Practical Privacy:** Accepting temporary privacy (timelock) rather than waiting for FHE.

## Open Questions

1. Optimal settlement delay within 1-3 hour range
2. Distance-to-clearing-price rebate curve calibration
3. Reserve price mechanics if needed (RMS deviation fee structure)
4. Fraud proof latency windows and impact on finality/UX
5. Validator incentives for submitting away-chain headers
6. DoS prevention (spam bids/commitments)
7. Economic bounds on griefing attacks
8. Away-chain reorganization detection/resolution
9. Governance for parameter changes and upgrades
10. State growth management (multiple auctions, commitment storage)

## Success Criteria

**Launch Success (Month 1-3):**
- 20-100 individual arbitrageurs trying platform
- $100K-2M/day in volume
- 5-10 bidders per auction providing competitive spreads
- Spreads < 0.3%

**Growth Success (Month 6):**
- 200-500 active arbitrageurs
- $2M-20M/day in volume
- 20+ bidders per auction
- Spreads < 0.2%

**Scale Success (Year 1):**
- 500-2,000 active users
- $5M-50M/day in volume
- 30-50+ bidders per auction
- Professional Market Makers showing inbound interest
- 1-2 major wallet/aggregator integrations

## Documentation Map

**Background & Context:**
- [Prior Art: Decentralized Exchanges](docs/background/prior-art.md) - Existing DEX mechanisms
- [CoW Swap Analysis](docs/background/cow-swap-analysis.md) - Batch auction case study

**Design & Strategy:**
- [Product Design v0 (Archived)](docs/archive/product-design-v0-ARCHIVED.md) - Historical auction mechanism
- [N-Layer Onion Timelock](docs/design/timelock-seller-stake-dkg.md) - Sealed bid architecture

**Technical Specifications:**
- [Technical Risks](docs/development/technical-risks.md) - Implementation status
- [Architecture Overview](docs/technical/architecture-overview.md) - System architecture
- [Cross-Chain Verification](docs/technical/cross-chain-verification.md) - ZK proofs, merkle inclusion
- [Ethereum Wallet Bridge](docs/technical/ethereum-wallet-atomica-bridge.md) - Account abstraction

**Game Theory & Economics:**
- [Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md) - Auction mechanism details
- [Shill Bidding Analysis](docs/game-theory/shill-bidding-analysis.md) - Manipulation attacks
- [CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md) - Economic analysis

**Market Analysis:**
- [Bear Market Analysis](docs/analysis/bear-market.md) - Performance in low-liquidity conditions
- [Bear Market Analysis](docs/analysis/bear-market.md) - Performance in low-liquidity conditions
- [Continuous vs Auction Markets](docs/analysis/continuous-vs-auction-markets.md) - Historical evidence

## References

**Nobel Prize Winners in Auction Theory:**
- Vickrey, W. (1961). Revenue equivalence theorem (Nobel 1996)
- Wilson, R. (1979). Uniform-price multi-unit auctions
- Milgrom, P. & Wilson, R. (2020). Auction theory improvements (Nobel 2020)

**Market Microstructure:**
- Budish, Cramton, Shim (2015). Frequent batch auctions
- Kyle (1985). Continuous auctions and insider trading
- Glosten & Milgrom (1985). Bid-ask spread with adverse selection

---

**Last Updated:** 2025-01-17
**Status:** Risk #1 complete, Risk #2 in progress (timelock encryption)
