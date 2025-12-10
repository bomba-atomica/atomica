# Atomica Product Requirements Document

## Executive Summary

**What:** Atomica enables trustless cross-chain atomic swaps via daily batch auctions with futures delivery.

**Why:** Existing cross-chain exchanges require bridges (custody risk, wrapped tokens, governance centralization) or suffer from liquidity fragmentation, MEV exploitation, and adverse selection.

**How:** Users lock native assets on away chains and participate in a single daily batch auction where bidders competitively bid using sealed bids. Assets settle 1-3 hours after auction close without bridges, wrapped tokens, or custodians.

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
4. Active bidder participation (no passive LPs)
5. Self-sustaining economics (bid-ask spreads, no subsidies)

**→ See:** [Futures Market Model](docs/design/futures-market-model.md) for why futures over spot

### Daily Batch Auction

**Structure:**
- One unified auction per day per trading pair
- Auctioneers (sellers): Users with quote assets wanting base assets
- Bidders: Base asset holders submit sealed bids
- No reserve prices (relies on competitive bidding in large batch)
- Settlement: 1-3 hours post-auction (prevents arbitrage/information withholding, allows bid verification)

**Example Timeline:**
```
08:00 UTC  Bid window opens (users lock assets on away chains)
08:00-12:00  Bid submission window (sealed bids)
12:00  Auction close & automatic decryption (Atomica validator timelock)
12:00  Clearing price determined (uniform price auction)
12:00-13:00  Settlement window (verification & hedging)
13:00  Settlement (native assets delivered atomically, 1 hour post-auction)
```

**Why Single Daily Auction:** Aggregates volume into critical mass, attracts bidders, simplifies coordination, reduces bootstrapping friction

**→ See:** [Futures Market Model](docs/design/futures-market-model.md) for detailed flow and rationale

## Technical Architecture

### Cross-Chain Verification

**Unified Architecture:** All away chains (Ethereum, Solana, Base, Arbitrum, etc.) use identical verification mechanisms.

**Dual-Layer Verification:**
1. **BLS Consensus Layer:** Atomica validators sign merkle roots with BLS threshold signatures (requires 2/3+ validator agreement)
2. **ZK Computation Layer:** Anyone can verify auction execution correctness via ZK proofs (independent of validator honesty)

Settlement requires BOTH layers to agree on the merkle root. No trusted oracles or bridges.

**→ See:** [Architecture Overview](docs/technical/architecture-overview.md) and [Unified Away Chain Architecture](docs/decisions/unified-away-chain-architecture.md) for details

### Sealed Bid Implementation

**Atomica Validator + Seller Timelock (Dual-Layer):** Bids encrypted using a **Dual-Layer "Onion" Timelock** scheme.
1.  **Outer Layer:** Atomica Validator TIMELOCK (BLS12-381) - Decrypts at auction deadline.
2.  **Inner Layer:** Seller Group DKG (BLS12-381) - Decrypts only if Sellers (stake-weighted) participate.

This prevents "Invisible Handshake" attacks where validators collude off-chain. Decryption requires cooperation from BOTH the Validator Set (>67%) AND the Seller Set (>33%). Invalid bids filtered post-decryption.

**Note:** Atomica chain is built using Aptos-core software (consensus, BLS signatures, Move VM), but runs as an independent blockchain with its own validators and governance.

**→ See:** [Atomica Validator Timelock Decision](docs/decisions/aptos-validator-timelock.md) for implementation approach
**→ See:** [Bid Validity Simplification Decision](docs/decisions/bid-validity-simplification.md) for validation rationale

### Uniform Price Auction Mechanism

Bidders submit sealed bids (quantity + price). Bids sorted, clearing price set at lowest qualifying bid. All winners pay same uniform price (regardless of their bid).

**Example:** Auction for 100 ETH with bids: A (40@$2000), B (30@$1980), C (40@$1950) → All clear at $1950

**Why:** Revenue equivalence to Vickrey auctions, incentive compatibility, MEV resistance, tolerates public information post-decryption

**→ See:** [Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md) for game theory analysis

### Account Abstraction

**Seamless Cross-Chain UX:** Users deposit on their preferred chain (Ethereum, Solana, etc.) using familiar wallets (MetaMask, Phantom). Account abstraction maps Ethereum addresses to Atomica accounts, enabling users to sign bids with their Ethereum wallet without needing Atomica-native wallets or gas tokens.

**Key Innovation:** Users never leave their wallet ecosystem yet participate in cross-chain auctions.

**→ See:** [Ethereum Wallet Atomica Bridge](docs/technical/ethereum-wallet-atomica-bridge.md) and [Account Abstraction](docs/technical/account-abstraction.md) for specification

### Self-Sustaining Economics

Bidders earn through bid-ask spreads (buy at auction price, sell/hedge externally). Futures pricing enables hedging strategies. Settlement delay (1-3 hours) provides:

1. **Economic benefit:** Prevents arbitrage around bid/delivery timing and private information withholding (24h not required)
2. **Verification period:** Gives participants time to review bids and verify smart contracts operated correctly

No protocol fees or subsidies required. Competitive bidding drives spreads toward fair risk-adjusted rates. Single large daily auction justifies bidder infrastructure investment.

**→ See:** [CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md) for detailed economic analysis

## Launch Strategy

**Core Design:** Single daily batch auction, sealed bids, futures delivery (1-3 hours), no reserve prices

**Focus:** Build critical mass, establish bidder relationships, demonstrate economic viability

**Settlement Delay:** 1-3 hours provides two key benefits:
1. **Economic:** Prevents price arbitrage and private information withholding around auction timing (24h not needed for this benefit)
2. **Verification:** Allows all participants to review bids and confirm smart contracts operated as expected before settlement

## Design Principles

Atomica prioritizes:

1. **Trustlessness over convenience** - Cryptographic guarantees, no custodians
2. **Economic sustainability over UX familiarity** - Self-sustaining bidder economics, no subsidies
3. **Practical deployability over theoretical privacy** - Timelock encryption (works today) vs FHE (years away)
4. **Market-driven liquidity over protocol subsidies** - Competitive bidding, no token emissions

**Key Tradeoffs Accepted:**
- Futures delivery vs spot execution (embrace cross-chain latency)
- Active bidders vs passive LPs (sustainable economics)
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
