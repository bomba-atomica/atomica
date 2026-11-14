# Atomica Product Requirements Document

## Executive Summary

**What:** Atomica is the global canonical market open/close auction for crypto—trustless cross-chain atomic swaps via twice-daily batch auctions. Settlement within 1-3 hours of the close is a target that main does not enforce.

**Why:** Existing cross-chain exchanges require bridges ($2B+ hacked since 2021), suffer from liquidity fragmentation, and expose traders to MEV and adverse selection. Individual arbitrageurs face existential risk using bridges—one hack can wipe out their entire capital.

**How:** Users lock native assets on their home chains and participate in twice-daily sealed-bid batch auctions. The target is settlement 1-3 hours after auction close; no code on main times it. Cross-chain atomic trades execute without bridges or custodians.

**Key Innovations:**
- **Non-custodial with bounded lock time**: Assets stay in the Ethereum LockBox, never with a custodian. As built, a lock pays out once the auction's proven outcome reaches Ethereum, or it goes back to its depositor: at once when its recorded leaf is unpayable, or by reclaim at the lock deadline (the window close plus 72 hours)
- **True cross-chain atomic trades**: Native assets move between chains without bridges, wrapped tokens, or custodians
- **Twice-daily liquidity concentration**: Two auctions per day aggregate global liquidity rather than fragmenting across time
- **Timelock IBE cryptography**: Identity-Based Encryption enables sealed bids that automatically decrypt at auction deadline—no interactive reveal phase. Once the validators release the key, any account calls `open_bids` and the chain decrypts every bid itself; no bidder submits a price or a salt, so none can withhold one
- **Sealed bid prices**: Each bid's price is encrypted until the window's key is released, so nobody can front-run it. Only the price is sealed: the bid quantity is a clear argument of `submit_bid`, and no encrypted mempool is used
- **High-throughput blockchain**: Built on Aptos-core infrastructure (Move VM, BLS signatures, parallel execution) for scalable auction processing
- **Double verification pathways**: Validator BLS signatures for consensus (v0.1 Beta, built). ZK proofs for independent computation verification are a later phase (v1.0+), and both must agree for settlement in v1.0
- **Zero operator fees on major pairs**: The deal-breaker rebate is a later phase: deal breakers pay deal makers, and Bitcoin and Ethereum markets have no network fees. Not built: nothing on chain computes a fee or rebate, and Bitcoin is not supported yet

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

**→ See:** [Prior Art: Decentralized Exchanges](../background/prior-art.md) for detailed analysis

## Solution: Atomic Auctions with batch settlement

Atomica introduces **Atomic Auctions**: trustless cross-chain execution combined with auction-based competitive price discovery.

**Core Properties:**
1. Native cross-chain execution (no bridges, no wrapped tokens)
2. Batch auction clearing (settlement 1-3 hours after the close is a target)
3. Sealed bid auctions: one validator timelock layer is built; more onion layers (N-layer timelock encryption) are a later phase
4. Self-bootstrapping liquidity (arbitrageurs are both sellers AND bidders)
5. Self-sustaining economics (bid-ask spreads, no subsidies required)

**→ See:** [Auction Prior Art](../analysis/secondary-auctions-plus-continuous.md) for institutional auction precedents across asset classes

### Twice-Daily Batch Auctions

**Structure:**
- **Two auctions per day** to capture global liquidity:
  - **Western Auction:** 16:15 UTC
  - **Eastern Auction:** 07:45 UTC
  - As built, window ids change exactly at these two closes on every calendar day (`eth_proof::window_id_at`)
- Multi-pair clearing is a later phase: all trading pairs would clear **simultaneously** within each auction. As built, the pair allowlist holds one launch pair (FakeETH and FakeUSD, both on Ethereum), and each window and pair clears on its own
- **Sellers:** Base asset holders lock the base token (FakeETH at launch) and sell it for the quote token
- **Bidders:** Quote asset holders lock the quote token (FakeUSD at launch) as collateral and submit sealed-price bids for the base token
- Each window takes at most 100 seller locks of at least 0.01 FakeETH each, and at most 100 bids with at least 10 FakeUSD collateral each
- No reserve prices at launch (relies on competitive bidding in large batch)
- Settlement: the target is 1-3 hours post-auction. No code on main times it: any account may call `settle` once the key is revealed and every bid is opened, until the window's stuck deadline

<!-- SCOUT(#231) DOC: "12:15 UTC Bid window opens": bids can start only in the chain epoch that holds the close, so the opening time depends on the epoch ends the owner picks. -->

**Target Timeline (16:15 UTC Auction, not enforced on main):**
```
12:15 UTC  Bid window opens (users lock assets on away chains)
12:15-16:15 UTC  Bid submission window (sealed bids)
16:15 UTC  Auction close & automatic decryption on chain (open_bids, all assets simultaneously)
16:15 UTC  Clearing price determined for each pair (uniform price auction)
16:15-17:15 UTC  Settlement window (verification & hedging)
17:15 UTC  Settlement (native assets delivered atomically)
```

As built, no code opens bidding at 12:15 or waits until 17:15. Bids run from
the first `create_auction` of the window until the window close, the deadline
of the window's timelock. Once the validators reveal the key, any account opens
the bids on chain with `open_bids` (12 bids per call), clears the window with
`finalize_window`, and calls `settle`.

The auction close is the window close. The first `create_auction` of a window
registers the window's one timelock with the close as its deadline, so no
seller can move it.

**Why a 1-3 Hour Settlement Target (Not 24 Hours):**
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

> **Status:** later phase. Not built: the pair allowlist holds one launch pair, and each window and pair clears on its own. The linked product design is archived.

**Simultaneous Clearing:** All trading pairs clear at the same time within each auction window. This provides:
- **Consistent pricing:** All assets priced at the same moment in time
- **Simpler mechanism:** No ordering dependencies or cascading effects
- **Fair access:** All markets treated equally

**Strategic Focus:** While all markets clear simultaneously, Atomica's competitive advantage is providing fair execution for **long-tail assets** where CEX/DEX liquidity is thin. Major pairs (ETH/BTC) already have deep liquidity elsewhere.

**→ See:** [Product Design v0 (Archived)](../archived/product-design-v0-archived.md) for complete multi-asset mechanism

## Technical Architecture

### Cross-Chain Verification

**Unified Architecture:** Every away chain uses the same verification mechanism. Only Ethereum is built. Solana, Base, Arbitrum and other away chains are a later phase.

**Verification:**
1. **BLS Consensus Layer (v0.1 Beta, built):** Ethereum's `AptosLightClient` checks an aggregate BLS12-381 signature over an Aptos LedgerInfo from validators holding more than 2/3 of the voting power, plus an inclusion proof of the auction's `AuctionOutcome` event. LockBox records the outcome and pays each lock per its leaf. v0.1 Beta uses BLS-only settlement.
2. **ZK Computation Layer (later phase, v1.0+):** Anyone can verify auction execution correctness via ZK proofs (independent of validator honesty). In v1.0, settlement requires BOTH layers to agree on the merkle root.

No trusted oracles or bridges.

**→ See:** [v0 Architecture](../architecture/v0-architecture.md) and [Unified Away Chain Architecture](../decisions/unified-away-chain-architecture.md)

### Sealed Bid Implementation

<!-- SCOUT(#242) DOC: the 67 percent sentence (owner decision 31): the fork keeps bids secret only against at most one half of stake and needs two thirds to reveal; the seller-set 33 percent is unbuilt. -->

**N-Layer "Onion" Timelock Encryption:** Bids encrypted using pluggable, configurable layers. As built, a bid uses one layer, the Atomica validator timelock (IBE over BLS12-381), which the validators release after the window close. The other onion layers, the seller DKG layer and the Drand layer are a later phase.

**Example: Dual-Layer (Validators + Sellers), a later phase**
1. **Outer Layer:** Atomica Validator Timelock (BLS12-381) - Decrypts at auction deadline
2. **Inner Layer:** Seller Group DKG (BLS12-381) - Decrypts only if Sellers (stake-weighted) participate

This prevents "Invisible Handshake" attacks where validators collude off-chain. Decryption requires cooperation from BOTH the Validator Set (>67%) AND the Seller Set (>33%). Invalid bids are filtered when the chain opens them: a bid whose ciphertext does not decrypt to an 8-byte price, a bid with a zero price, or whose collateral does not cover its quantity at its own price, is invalid, never fills, and gets its whole collateral back. A bid with a zero quantity or a quantity above the window supply is refused at submission.

**Orthogonal Key Generation (later phase):** How each layer generates its keys (DKG, beacon, threshold) is independent of the onion encryption structure. Layers can be composed freely:
- Validators only, Validators + Drand, Validators + Sellers, Validators + Drand + Sellers, etc.

**Note:** Atomica chain is built using Aptos-core software (consensus, BLS signatures, Move VM), but runs as an independent blockchain with its own validators and governance.

**→ See:** [N-Layer Onion Timelock Design](../design/timelock-seller-stake-dkg.md) and [Atomica Validator Timelock Decision](../decisions/aptos-validator-timelock.md)

### Uniform Price Auction Mechanism

<!-- The rule for an undersubscribed window (review decision 34) is still open: today the lowest valid bid sets the price. A zero-price bid is invalid, so the price is never zero. -->

Bidders submit bids with a sealed price and a clear quantity. Only the price is encrypted; the quantity is public at submission. Bids sorted, clearing price set at lowest qualifying bid. A qualifying bid is a valid one: invalid bids are skipped. All winners pay same uniform price (regardless of bid).

**Example:** Auction for 100 ETH with bids: A (40@$2000), B (30@$1980), C (40@$1950) → All clear at $1950. Prices are whole USD per whole base token (here USD per ETH), the one price unit across the contracts, SDK and UI.

**Why:** Revenue equivalence to Vickrey auctions, incentive compatibility, MEV resistance, tolerates public information post-decryption

**→ See:** [Uniform Price Auctions](../game-theory/uniform-price-auctions.md) for game theory analysis

### Account Abstraction

**Seamless Cross-Chain UX:** Users deposit on their preferred chain using familiar wallets (MetaMask, Phantom). Account abstraction maps Ethereum addresses to Atomica accounts, enabling users to sign bids with their Ethereum wallet without an Atomica-native wallet. The derived Atomica account still pays its own gas in APT: the demo funds it through a funding API, and the SDK has no fee payer.

**Key Innovation:** Users never leave their wallet ecosystem yet participate in cross-chain auctions.

**→ See:** [Ethereum Wallet Atomica Bridge](../technical/ethereum-wallet-atomica-bridge.md) and [Account Abstraction](../technical/account-abstraction.md)

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

**Atomica's Position:** The global canonical market open/close auction for crypto. Two auctions per day (07:45 and 16:15 UTC, every calendar day) establish reference prices for Bitcoin, Ethereum, and cross-chain assets—just as the NYSE open/close does for equities and the LBMA fixing does for gold.

**→ See:** [Continuous vs Auction Markets](../analysis/continuous-vs-auction-markets.md) for historical evidence on auction adoption across asset classes

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

**Why a 1-3 Hour Settlement Target Works:**
1. Prevents arbitrage around bid/delivery timing
2. Provides verification period
3. Still allows hedging on external markets
4. Same-day capital velocity

### Fee Structure: Deal Breakers Pay Deal Makers

> **Status:** later phase. Not built: nothing on chain computes a fee or rebate, and no client shows one. The rebate curve is an open question below.

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

**→ See:** [CPMM vs Auction Comparison](../game-theory/cpmm-vs-auction-comparison.md) and [Bear Market Analysis](../analysis/bear-market.md)

## Development Status

<!-- SCOUT(#242) DOC: the Risk #3 bullet repeats "trusts only the 2/3 validator threshold, no relayer" without the package upgrade-key assumption (owner decision 30). -->

**Current Progress:**
- ✅ **Risk #1 (Ethereum Signing):** Complete - users can sign Atomica transactions with MetaMask
- ✅ **Risk #2 (Timelock Encryption):** Built for one layer - the validator timelock DKG, V2 bid ciphertexts, the on-chain key reveal and on-chain bid opening (`open_bids`) are merged. More onion layers are a later phase
- ✅ **Risk #3 (Cross-Chain Verification):** Built for Ethereum - v0.1 Beta trusts only the 2/3 validator threshold, no relayer: validators attest Ethereum headers, Ethereum verifies validator BLS signatures over Aptos outcomes, and any user can unwind a finished or stuck auction ([trustless v0.1 unwinding ADR](../decisions/trustless-v0-1-unwinding.md)); ZK double verification (v1.0)

The UI that completes a trade end to end (open, settle and release) is open work (issue 236). GitHub issues track every open gap.

**→ See:** [Roadmap](../roadmap.md) for the status of each capability

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

- **Batch Settlement vs Spot:** Embracing a 1-3 hour settlement latency target to enable trustless cross-chain atomicity.
- **Active Bidding vs Passive LPs:** Prioritizing sustainable economics over passive yield farming.
- **Bootstrapping Focus:** Focusing on arbitrageurs and long-tail assets first.
- **Practical Privacy:** Accepting temporary privacy (timelock) rather than waiting for FHE.

## Open Questions

<!-- SCOUT(#242) DOC: question 9: the package upgrade-key is the governance question that matters (owner decision 30). -->

1. Optimal settlement delay within the 1-3 hour target range
2. Distance-to-clearing-price rebate curve calibration
3. Later phase: reserve price mechanics if needed (RMS deviation fee structure). Launch has no reserve price (review decision 33).
4. Fraud proof latency windows and impact on finality/UX
5. Who pays the gas to carry an auction outcome to Ethereum (`recordOutcome`, `releaseByOutcome`). Validators now attest away-chain headers as validator transactions, so headers need no carrier incentive
6. DoS prevention (spam bids/commitments). Timelock registration spam is closed: only the auction package registers a timelock, one per window id. Bid and seller spam is partly answered: a window takes at most 100 bids and 100 seller locks, each seller lock is at least 0.01 FakeETH and each bid's collateral at least 10 FakeUSD, so filling a window costs real capital. The UI checks these limits before the Ethereum lock, so an honest user never locks an amount Aptos refuses.
7. Economic bounds on griefing attacks. Partly answered: a dust bid can no longer win supply or cancel a window, because an under-collateralised bid is invalid at opening and skipped. Its collateral still goes back in full (no slash), so spam is bounded by the collateral a bid must lock.
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
- [Prior Art: Decentralized Exchanges](../background/prior-art.md) - Existing DEX mechanisms
- [CoW Swap Analysis](../background/cow-swap-analysis.md) - Batch auction case study

**Design & Strategy:**
- [Product Design v0 (Archived)](../archived/product-design-v0-archived.md) - Historical auction mechanism
- [N-Layer Onion Timelock](../design/timelock-seller-stake-dkg.md) - Sealed bid architecture

**Technical Specifications:**
- [Roadmap](../roadmap.md) - Implementation status
- [v0 Architecture](../architecture/v0-architecture.md) - System architecture
- [Cross-Chain Verification](../technical/cross-chain-verification.md) - ZK proofs, merkle inclusion
- [Ethereum Wallet Bridge](../technical/ethereum-wallet-atomica-bridge.md) - Account abstraction

**Game Theory & Economics:**
- [Uniform Price Auctions](../game-theory/uniform-price-auctions.md) - Auction mechanism details
- [Shill Bidding Analysis](../game-theory/shill-bidding-analysis.md) - Manipulation attacks
- [CPMM vs Auction Comparison](../game-theory/cpmm-vs-auction-comparison.md) - Economic analysis

**Market Analysis:**
- [Bear Market Analysis](../analysis/bear-market.md) - Performance in low-liquidity conditions
- [Continuous vs Auction Markets](../analysis/continuous-vs-auction-markets.md) - Historical evidence

## Protocol Evolution Roadmap

<!-- SCOUT(#242) DOC: table row v0.1 Beta: "2/3 validator threshold only" omits the package upgrade-key (owner decision 30). -->

See [Plan Evolution (Archived)](../archived/plan-evolution.md) for the multi-phase roadmap from v0.1 Beta to v2.0:

| Phase | Trust Model | Key Innovation |
|-------|-------------|----------------|
| **v0.1 Beta** | 2/3 validator threshold only, no relayer | Working system with verified BLS settlement and permissionless unwind (current) |
| **v1.0** | Same validator assumption + ZK | ZK auction verification |
| **v2.0** | Same validator assumption + ratchet | Cross-chain auctions + BitVM |

<!-- SCOUT(#242) DOC: trust model sentence (owner decision 30): "No relayer, admin key or operator can move or freeze funds" contradicts the decision record's Trust Assumptions; also state the bid secrecy bound (owner decision 31). -->

**v0.1 Trust Model:** v0.1 trusts only the 2/3 validator threshold. No relayer, admin key or operator can move or freeze funds. All funds unwind to their origin unless the auction executes flawlessly, and any user can send a transaction to a finished or stuck auction to unwind it. See the [trustless v0.1 unwinding ADR](../decisions/trustless-v0-1-unwinding.md).

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

**Last Updated:** 2026-11-14
**Status:** Risk #1 complete; Risk #2 built for the validator timelock layer; Risk #3 built for Ethereum (see Development Status)
