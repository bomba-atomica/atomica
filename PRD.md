# Atomica Product Requirements Document

## Executive Summary

**What:** Atomica enables trustless cross-chain atomic swaps via daily batch auctions with futures delivery.

**Why:** Existing cross-chain exchanges require bridges (custody risk, wrapped tokens, governance centralization) or suffer from liquidity fragmentation, MEV exploitation, and adverse selection.

**How:** Users lock native assets on away chains and participate in a single daily batch auction where market makers competitively bid using sealed bids. Assets settle 12-24 hours after auction close without bridges, wrapped tokens, or custodians.

**Key Innovation:** Futures market model with timelock-encrypted sealed bids concentrates liquidity, enables fair price discovery, and provides self-sustaining economics.

## Problem Statement

Cross-chain asset exchange today compounds risks from both bridges and DEXs:

**Bridge Risks:** Custody vulnerabilities, wrapped token depegging, smart contract exploits ($900M+), multisig governance centralization

**DEX Risks:** MEV exploitation, adverse selection for LPs (LVR, impermanent loss), liquidity fragmentation, capital inefficiency

**Combined Impact:** Multiple transaction steps, accumulated fees, fragmented UX, time-based price risk

**→ See:** [Prior Art: Decentralized Exchanges](docs/background/prior-art.md) for detailed analysis

## Solution: Atomic Auctions with Futures Delivery

Atomica introduces **Atomic Auctions**: trustless cross-chain execution combined with auction-based competitive price discovery.

**Core Properties:**
1. Native cross-chain execution (no bridges/wrapped tokens)
2. Futures delivery model (12-24hr settlement post-auction)
3. Sealed bid batch auctions (mandatory timelock encryption)
4. Active market maker participation (no passive LPs)
5. Self-sustaining economics (bid-ask spreads, no subsidies)

**→ See:** [Futures Market Model](docs/design/futures-market-model.md) for why futures over spot

### Daily Batch Auction (Phase 1 Launch)

**Structure:**
- One unified auction per day per trading pair
- Auctioneers (sellers): Users with quote assets wanting base assets
- Bidders (MMs): Base asset holders submit sealed bids
- No reserve prices (relies on MM competition in large batch)
- Settlement: 12-24 hours post-auction

**Example Timeline:**
```
08:00 UTC  Bid window opens (users lock assets on away chains)
08:00-12:00  MM bid submission (ZK-proven sealed bids)
12:00  Auction close & automatic decryption (drand timelock)
12:00  Clearing price determined (uniform price auction)
18:00  Settlement (native assets delivered atomically)
```

**Why Single Daily Auction:** Aggregates volume into critical mass, attracts market makers, simplifies coordination, reduces bootstrapping friction

**→ See:** [Futures Market Model](docs/design/futures-market-model.md) for detailed flow and rationale

## Technical Architecture

### Cross-Chain Verification

Home chain maintains cryptographic accumulators (merkle roots) of away chain block headers, verified via ZK proofs. Standard merkle inclusion proofs demonstrate transactions occurred. No trusted oracles or bridges.

**→ See:** [Cross-Chain Verification](docs/technical/cross-chain-verification.md) for implementation details

### Sealed Bid Implementation

Bids encrypted via drand-based timelock (IBE), remain sealed until auction close, then auto-decrypt. Invalid bids filtered post-decryption with economic deposits preventing spam. No ZK proofs required. No interactive reveal phase prevents griefing.

**→ See:** [Timelock Encryption for Sealed Bids](docs/technical/timelock-bids.md) for full specification
**→ See:** [Bid Validity Simplification Decision](docs/decisions/bid-validity-simplification.md) for rationale

### Uniform Price Auction Mechanism

Market makers submit sealed bids (quantity + price). Bids sorted, clearing price set at lowest qualifying bid. All winners pay same uniform price (regardless of their bid).

**Example:** Auction for 100 ETH with bids: A (40@$2000), B (30@$1980), C (40@$1950) → All clear at $1950

**Why:** Revenue equivalence to Vickrey auctions, incentive compatibility, MEV resistance, tolerates public information post-decryption

**→ See:** [Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md) for game theory analysis

### Self-Sustaining Economics

Market makers earn through bid-ask spreads (buy at auction price, sell/hedge externally). Futures pricing enables hedging strategies. Settlement delay reduces inventory risk premium. No protocol fees or subsidies required.

Competitive bidding drives spreads toward fair risk-adjusted rates. Single large daily auction justifies MM infrastructure investment.

**→ See:** [CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md) for detailed economic analysis

## Launch Strategy

**Phase 1 (Launch):** Single daily batch auction, sealed bids, futures delivery (12-24hr), no reserve prices
**Focus:** Build critical mass, establish MM relationships, demonstrate economic viability

**Settlement Delay:** 12-24 hours balances user expectations with MM risk management. Long enough for effective hedging, short enough for next-day delivery UX.

**→ See:** [Evolution Roadmap](docs/design/evolution-roadmap.md) for Phases 2-4 (multiple daily auctions, hybrid spot+futures, dynamic parameters)

## Design Principles

Atomica prioritizes:

1. **Trustlessness over convenience** - Cryptographic guarantees, no custodians
2. **Economic sustainability over UX familiarity** - Self-sustaining MM economics, no subsidies
3. **Practical deployability over theoretical privacy** - Timelock encryption (works today) vs FHE (years away)
4. **Market-driven liquidity over protocol subsidies** - Competitive bidding, no token emissions

**Key Tradeoffs Accepted:**
- Futures delivery vs spot execution (embrace cross-chain latency)
- Active MMs vs passive LPs (sustainable economics)
- Daily batch vs continuous trading (liquidity concentration for bootstrap)
- Temporary bid privacy vs full privacy (practical cryptography)

**→ See:** [Ideal Solution Characteristics](docs/design/ideal-characteristics.md) for full requirements with tradeoffs

## Open Questions

1. Away-chain data availability for home-chain verifiers (only headers submitted)
2. Fraud proof latency windows and impact on finality/UX
3. Validator incentives for submitting away-chain headers (no extra rewards)
4. Sybil resistance for bidders (no KYC/reputation beyond griefing cost)
5. DoS prevention (spam bids/commitments)
6. Economic bounds on griefing attacks
7. Away-chain reorganization detection/resolution
8. Header submission failure handling (validator collusion/offline)
9. Auction liveness with fraud proof disputes
10. Cross-chain fork choice in competing submissions
11. Governance for parameter changes and upgrades
12. State growth management (multiple auctions, commitment storage)
13. Partial participation inference attacks
14. Commitment replay/double-use prevention

## Documentation Map

**Background & Context:**
- [Prior Art: Decentralized Exchanges](docs/background/prior-art.md) - Existing DEX mechanisms
- [CoW Swap Analysis](docs/background/cow-swap-analysis.md) - Batch auction case study

**Design & Strategy:**
- [Ideal Solution Characteristics](docs/design/ideal-characteristics.md) - Requirements with tradeoffs
- [Futures Market Model](docs/design/futures-market-model.md) - Why futures for cross-chain swaps
- [Evolution Roadmap](docs/design/evolution-roadmap.md) - Phases 1-4 growth plan

**Technical Specifications:**
- [Cross-Chain Verification](docs/technical/cross-chain-verification.md) - ZK proofs, merkle inclusion
- [Timelock Encryption for Sealed Bids](docs/technical/timelock-bids.md) - Bid privacy implementation
- [Technology Limitations](docs/technical/technology-limitations.md) - Why fully private auctions aren't feasible

**Game Theory & Economics:**
- [Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md) - Auction mechanism details
- [Shill Bidding Analysis](docs/game-theory/shill-bidding-analysis.md) - Manipulation attacks
- [CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md) - Economic analysis

## References

**Nobel Prize Winners in Auction Theory:**
- Vickrey, W. (1961). Revenue equivalence theorem (Nobel 1996)
- Wilson, R. (1979). Uniform-price multi-unit auctions
- Milgrom, P. & Wilson, R. (2020). Auction theory improvements (Nobel 2020)

**Additional:** Nobel Prize Committee (2020). Scientific Background on Economic Sciences Prize. [nobelprize.org]
