# Atomica Product Requirements Document

## Executive Summary

**What:** Atomica is the global canonical market open/close auction for crypto—trustless cross-chain atomic swaps via twice-daily batch auctions with 1-3 hour settlement.

**Why:** Existing cross-chain exchanges require bridges ($2B+ hacked since 2021), suffer from liquidity fragmentation, and expose traders to MEV and adverse selection. Individual arbitrageurs face existential risk using bridges—one hack can wipe out their entire capital.

**How:** Users lock native assets on their home chains and participate in twice-daily sealed-bid batch auctions. Assets settle 1-3 hours after auction close. Cross-chain atomic trades execute without bridges or custodians.

<!-- SCOUT(#242) DOC: "Non-custodial with minimal lock time" bullet: on main a lock leaves LockBox only by reclaim, 72 h after its window closes, so say what the lock time is today. -->
<!-- SCOUT(#228) DOC: "Timelock IBE cryptography" bullet: bids open by a submitted (price, salt) pair today; "no interactive reveal phase" holds only once open_bids decrypts on chain. -->
<!-- SCOUT(#242) DOC: "Encrypted mempools" bullet: only the price is sealed; the bid quantity is a clear argument of submit_bid and no encrypted mempool is used; say so. -->
<!-- SCOUT(#242) DOC: "Double verification pathways" bullet: label the ZK half as a later-phase item, in the wording the acceptance check greps for. -->
<!-- SCOUT(#242) DOC: "Zero operator fees" bullet: no fee or rebate exists on chain and Bitcoin is not supported; label the deal-breaker rebate as a later-phase item. -->

**Key Innovations:**
- **Non-custodial with minimal lock time**: Assets locked only for the auction period—no prolonged custody risk
- **True cross-chain atomic trades**: Native assets move between chains without bridges, wrapped tokens, or custodians
- **Twice-daily liquidity concentration**: Two auctions per day aggregate global liquidity rather than fragmenting across time
- **Timelock IBE cryptography**: Identity-Based Encryption enables sealed bids that automatically decrypt at auction deadline—no interactive reveal phase
- **Encrypted mempools**: Bid contents hidden from validators until decryption, eliminating front-running and MEV extraction
- **High-throughput blockchain**: Built on Aptos-core infrastructure (Move VM, BLS signatures, parallel execution) for scalable auction processing
- **Double verification pathways**: BLS threshold signatures for consensus (v0.1 Beta), with ZK proofs for independent computation verification (v1.0+)—both must agree for settlement in v1.0
- **Zero operator fees on major pairs**: Bitcoin and Ethereum markets have no network fees; deal breakers pay deal makers (not built: nothing on chain computes a fee or rebate yet)

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

<!-- SCOUT(#242) DOC: property 3 "N-layer timelock encryption": one validator layer is built; label the other layers as a later-phase item. -->

**Core Properties:**
1. Native cross-chain execution (no bridges, no wrapped tokens)
2. Batch auction clearing with 1-3 hour settlement
3. Sealed bid auctions (N-layer timelock encryption)
4. Self-bootstrapping liquidity (arbitrageurs are both sellers AND bidders)
5. Self-sustaining economics (bid-ask spreads, no subsidies required)

**→ See:** [Auction Prior Art](docs/analysis/secondary-auctions-plus-continuous.md) for institutional auction precedents across asset classes

### Twice-Daily Batch Auctions

<!-- SCOUT(#242) DOC: the 07:45 and 16:15 UTC closes are the target; on main window ids change at 00:00, 07:55, 12:00 and 19:55 UTC until the window id issue (220) lands; say so or land that first. -->
<!-- SCOUT(#242) DOC: "All trading pairs clear simultaneously": one FakeETH and FakeUSD pair is hardcoded; label multi-pair clearing as a later-phase item (the pair allowlist issue (224) adds one launch pair). -->
<!-- SCOUT(#242) DOC: "Sellers ... with quote assets wanting base assets" and "Bidders: Base asset holders" are inverted against the code: sellers lock the base token (FakeETH) and bidders lock the quote token (FakeUSD). -->
<!-- SCOUT(#242) DOC: "Settlement: 1-3 hours post-auction" (also Executive Summary, Core Properties, "Why 1-3 Hour Settlement", Key Tradeoffs): no code times settlement; on main no outcome reaches Ethereum and a lock goes home by reclaim after 72 h. -->

**Structure:**
- **Two auctions per day** to capture global liquidity:
  - **Western Auction:** 16:15 UTC
  - **Eastern Auction:** 07:45 UTC
- All trading pairs clear **simultaneously** within each auction
- **Sellers (Sellers):** Users with quote assets wanting base assets
- **Bidders:** Base asset holders submit sealed bids
- No reserve prices at launch (relies on competitive bidding in large batch)
- Settlement: 1-3 hours post-auction

<!-- SCOUT(#242) DOC: timeline: no code opens bidding at 12:15 or delays settlement to 17:15; bids run from create_auction to the window timelock deadline, and settle is callable from the reveal. -->
<!-- SCOUT(#228) DOC: "automatic decryption" at the close needs open_bids; today each bid needs a submitted price and salt. -->
<!-- SCOUT(#243) DOC: "16:15 UTC Auction close": the close is the first seller's timelock deadline today; it is the window close only once create_auction registers the timelock itself. -->
<!-- SCOUT(#231) DOC: "12:15 UTC Bid window opens": bids can start only in the chain epoch that holds the close, so the opening time depends on the epoch ends the owner picks. -->

**Example Timeline (16:15 UTC Auction):**
```
12:15 UTC  Bid window opens (users lock assets on away chains)
12:15-16:15 UTC  Bid submission window (sealed bids)
16:15 UTC  Auction close & automatic decryption (all assets simultaneously)
16:15 UTC  Clearing price determined for each pair (uniform price auction)
16:15-17:15 UTC  Settlement window (verification & hedging)
17:15 UTC  Settlement (native assets delivered atomically)
```

**Why 1-3 Hour Settlement (Not 24 Hours):**
1. **Economic benefit:** Prevents arbitrage and private information withholding—achievable in hours, not days
2. **Verification period:** All participants can review bids and confirm smart contracts operated correctly
3. **Better UX:** Same-day settlement (bid morning, settle afternoon)
4. **Lower risk:** Minimal price exposure between bid submission and delivery

**Why Two Auctions Per Day:**
- **Global coverage:** Captures liquidity from both Western and Eastern market participants
- **Optimal timing:** Fixed UTC windows align with global desk-overlap participation windows
- **Aggregates volume:** Each auction concentrates regional liquidity into critical mass
- **Manageable frequency:** Twice-daily is sufficient for most use cases while maintaining batch size

**→ See:** [Secondary Auctions Analysis](../analysis/secondary-auctions-plus-continuous.md) and [Auction Timing Specification (Canonical)](./auction-timing.md)

### Multi-Asset Auctions

<!-- SCOUT(#242) DOC: "Multi-Asset Auctions" section: unbuilt; label it as a later-phase item, and note that the linked product design is archived. -->

**Simultaneous Clearing:** All trading pairs clear at the same time within each auction window. This provides:
- **Consistent pricing:** All assets priced at the same moment in time
- **Simpler mechanism:** No ordering dependencies or cascading effects
- **Fair access:** All markets treated equally

**Strategic Focus:** While all markets clear simultaneously, Atomica's competitive advantage is providing fair execution for **long-tail assets** where CEX/DEX liquidity is thin. Major pairs (ETH/BTC) already have deep liquidity elsewhere.

**→ See:** [Product Design v0 (Archived)](docs/archived/product-design-v0-archived.md) for complete multi-asset mechanism

## Technical Architecture

### Cross-Chain Verification

<!-- SCOUT(#242) DOC: "All away chains (Ethereum, Solana, Base, Arbitrum)": only Ethereum is built. -->
<!-- SCOUT(#242) DOC: verification item 1: validators do not sign merkle roots with a threshold signature; Ethereum checks a 2/3+ aggregate BLS signature over an Aptos LedgerInfo plus an event inclusion proof (AptosLightClient). -->
<!-- SCOUT(#242) DOC: verification item 2 (ZK computation layer): label as a later-phase item. -->

**Unified Architecture:** All away chains (Ethereum, Solana, Base, Arbitrum, etc.) use identical verification mechanisms.

**Verification:**
1. **BLS Consensus Layer (v0.1 Beta+):** Atomica validators sign merkle roots with BLS threshold signatures (requires 2/3+ validator agreement). v0.1 Beta uses BLS-only settlement.
2. **ZK Computation Layer (v1.0+):** Anyone can verify auction execution correctness via ZK proofs (independent of validator honesty). In v1.0, settlement requires BOTH layers to agree on the merkle root.

No trusted oracles or bridges.

**→ See:** [Architecture Overview](docs/technical/architecture-overview.md) and [Unified Away Chain Architecture](docs/decisions/unified-away-chain-architecture.md)

### Sealed Bid Implementation

<!-- SCOUT(#242) DOC: Sealed Bid Implementation: only the validator timelock layer exists; label the onion layers, the seller DKG layer and the Drand layer as later-phase items. -->
<!-- SCOUT(#242) DOC: the 67 percent sentence (owner decision 31): the fork keeps bids secret only against at most one half of stake and needs two thirds to reveal; the seller-set 33 percent is unbuilt. -->
<!-- SCOUT(#216) DOC: "Invalid bids filtered post-decryption": nothing is filtered today; after this issue a zero-price or under-collateralised bid is invalid at opening and never fills. -->
<!-- SCOUT(#228) DOC: after on-chain opening, a ciphertext that does not decrypt to an 8-byte price is also an invalid bid. -->

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

<!-- SCOUT(#242) DOC: "sealed bids (quantity + price)": only the price is sealed; the quantity is public at submission. -->
<!-- SCOUT(#217) DOC: the example prices (2000, 1980, 1950) are whole USD per whole base token, the one unit this issue pins; say the unit here. -->
<!-- SCOUT(#216) DOC: "clearing price set at lowest qualifying bid": the rule for an undersubscribed window (review decision 34) is not stated; today the lowest opened bid sets the price, even at zero. -->

Bidders submit sealed bids (quantity + price). Bids sorted, clearing price set at lowest qualifying bid. All winners pay same uniform price (regardless of bid).

**Example:** Auction for 100 ETH with bids: A (40@$2000), B (30@$1980), C (40@$1950) → All clear at $1950

**Why:** Revenue equivalence to Vickrey auctions, incentive compatibility, MEV resistance, tolerates public information post-decryption

**→ See:** [Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md) for game theory analysis

### Account Abstraction

<!-- SCOUT(#242) DOC: "without needing ... gas tokens": the derived Aptos account pays its own gas; the demo funds it with APT through a funding API, and no fee payer exists in the SDK. -->

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

<!-- SCOUT(#242) DOC: "(12:00 NYC, 12:00 Tokyo)" contradicts the canonical 07:45 and 16:15 UTC closes, and "on business days" has no code: window ids run every calendar day. -->

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

<!-- SCOUT(#242) DOC: "Fee Structure: Deal Breakers Pay Deal Makers" section: unbuilt (the rebate coefficient is zero); label the rebate curve as a later-phase item. -->

> **Status:** not built. Nothing on chain computes a fee or rebate yet, and no client shows one. The rebate curve is an open question below.

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

<!-- SCOUT(#242) DOC: status block: Risk #2 is no longer "in progress, N-layer onion" (validator timelock DKG, V2 bid ciphertexts and key reveal are merged); Risk #3 is no longer "Pending" (attested headers, the Aptos light client and the proof-gated LockBox are merged; outcome emission (194) and the carrier (195) are open); the timeline estimate is stale. -->
<!-- SCOUT(#242) DOC: the Risk #3 bullet repeats "trusts only the 2/3 validator threshold, no relayer" without the package upgrade-key assumption (owner decision 30). -->

**Current Progress:**
- ✅ **Risk #1 (Ethereum Signing):** Complete - users can sign Atomica transactions with MetaMask
- 🟡 **Risk #2 (Timelock Encryption):** In progress - N-layer onion encryption implementation
- ⏳ **Risk #3 (Cross-Chain Verification):** Pending - v0.1 Beta trusts only the 2/3 validator threshold, no relayer: validators attest Ethereum headers, Ethereum verifies validator BLS signatures over Aptos outcomes, and any user can unwind a finished or stuck auction ([trustless v0.1 unwinding ADR](docs/decisions/trustless-v0-1-unwinding.md)); ZK double verification (v1.0)

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

<!-- SCOUT(#242) DOC: "Custodial Risk" row: "locked only for auction duration; guaranteed delivery or refund": the lock deadline is the window close plus 72 h (owner decision 36), and the package upgrade-key holder can redirect a lock (owner decision 30). -->

| Characteristic | Ideal State | Atomica's Approach |
|----------------|-------------|--------------------|
| **Private Strategies** | Full privacy of strategies & prices | **Timelock Sealed Bids:** Temporary privacy during auction window; public post-decryption. |
| **MEV Resistance** | No front-running or censorship | **Batch Auctions:** Uniform clearing price makes ordering irrelevant; sealed bids prevent pre-auction front-running. |
| **Cross-Chain** | Native asset trading without bridges | **Cross-Chain Verification:** BLS-signed state proofs (v0.1 Beta); ZK verification for independent computation proof (v1.0+); atomic settlement without wrapped tokens. |
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

<!-- SCOUT(#218) DOC: question 6 (DoS prevention): partly answered by the seller-lock cap, the bid cap and the minimum lock sizes; name the values the owner picks. -->
<!-- SCOUT(#243) DOC: question 6 also covers timelock registration spam: closed when only the auction package registers a timelock, one per window. -->
<!-- SCOUT(#216) DOC: question 7 (griefing bounds): a dust bid can no longer cancel a window once invalid bids are skipped. -->
<!-- SCOUT(#242) DOC: question 5: headers are validator transactions now; the open incentive question is who pays the outcome carrier's gas (review K-2). Question 9: the package upgrade-key is the governance question that matters (owner decision 30). -->

1. Optimal settlement delay within 1-3 hour range
2. Distance-to-clearing-price rebate curve calibration
3. Later phase: reserve price mechanics if needed (RMS deviation fee structure). Launch has no reserve price (review decision 33).
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

<!-- SCOUT(#242) DOC: links: 31 links in this file are repo-root paths (docs/...) that do not resolve from docs/specifications/ on GitHub; only the timing-spec line uses file-relative links; "Bear Market Analysis" is listed twice. -->

**Background & Context:**
- [Prior Art: Decentralized Exchanges](docs/background/prior-art.md) - Existing DEX mechanisms
- [CoW Swap Analysis](docs/background/cow-swap-analysis.md) - Batch auction case study

**Design & Strategy:**
- [Product Design v0 (Archived)](docs/archived/product-design-v0-archived.md) - Historical auction mechanism
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

## Protocol Evolution Roadmap

<!-- SCOUT(#242) DOC: broken link: the plan evolution file lives under docs/archived/ in kebab-case. -->
<!-- SCOUT(#242) DOC: table row v0.1 Beta: "2/3 validator threshold only" omits the package upgrade-key (owner decision 30), and "permissionless unwind (current)" is not on main until the Aptos unwind (194) merges. -->

See [Plan Evolution](docs/PLAN-EVOLUTION.md) for the multi-phase roadmap from v0.1 Beta to v2.0:

| Phase | Trust Model | Key Innovation |
|-------|-------------|----------------|
| **v0.1 Beta** | 2/3 validator threshold only, no relayer | Working system with verified BLS settlement and permissionless unwind (current) |
| **v1.0** | Same validator assumption + ZK | ZK auction verification |
| **v2.0** | Same validator assumption + ratchet | Cross-chain auctions + BitVM |

<!-- SCOUT(#242) DOC: trust model sentence (owner decision 30): "No relayer, admin key or operator can move or freeze funds" contradicts the decision record's Trust Assumptions; also state the bid secrecy bound (owner decision 31). -->

**v0.1 Trust Model:** v0.1 trusts only the 2/3 validator threshold. No relayer, admin key or operator can move or freeze funds. All funds unwind to their origin unless the auction executes flawlessly, and any user can send a transaction to a finished or stuck auction to unwind it. See the [trustless v0.1 unwinding ADR](docs/decisions/trustless-v0-1-unwinding.md).

**v0 → v1 Trust Reduction:**
- Same validator honesty assumption (2/3 threshold)
- Validators only need to generate receipts for bids
- ZK circuit independently verifies auction clearing
- Isolated Rust implementation (no shared code with MoveVM)

**v1 → v2 Cross-Chain:**
- Same validator honesty assumption
- Bitcoin support via BitVM + STARK proofs
- Multi-step ratchet for atomic cross-chain releases
- Extension to additional chains (Solana, etc.)

**Cross-Chain Trust (v2 only):**
- Ratchet mechanism ensures funds release only when other chain has committed
- No trust in bridge liveness - atomicity enforced cryptographically

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

<!-- SCOUT(#242) DOC: last-updated date and status line are stale. -->

**Last Updated:** 2025-01-17
**Status:** Risk #1 complete, Risk #2 in progress (timelock encryption)
