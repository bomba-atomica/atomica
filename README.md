# Atomica Documentation

**Atomica enables trustless cross-chain atomic swaps via daily batch auctions with futures delivery.**

## Quick Start

**New readers should start here:**

1. **[Prd.md](Prd.md)** - Product requirements document (~10 min read)
2. **[Futures Market Model](docs/design/futures-market-model.md)** - Why futures for cross-chain (~15 min)
3. **[CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md)** - Economic analysis (~20 min)

## Documentation Structure

```
atomica/
├── Prd.md                    ← Start here (executive summary, 163 lines)
├── README.md                 ← This file (navigation guide)
└── docs/
    ├── background/           ← Context & prior art
    │   ├── prior-art.md
    │   └── cow-swap-analysis.md
    ├── design/               ← Product design & strategy
    │   ├── ideal-characteristics.md
    │   ├── futures-market-model.md
    │   └── evolution-roadmap.md
    ├── technical/            ← Technical specifications
    │   ├── cross-chain-verification.md
    │   ├── timelock-bids.md
    │   └── technology-limitations.md
    ├── game-theory/          ← Economics & mechanism design
    │   ├── uniform-price-auctions.md
    │   ├── shill-bidding-analysis.md
    │   └── cpmm-vs-auction-comparison.md
    └── archive/              ← Historical & exploratory docs
        ├── Prd-v1-archive.md
        ├── liquidity-provision.md
        └── payment-channel-option.md
```

## Document Guide

### 📋 Product Specification

**[Prd.md](Prd.md)** - Complete product requirements (163 lines)
- Executive summary: What, why, how
- Problem statement (with link to detailed prior art)
- Solution overview: Atomic Auctions
- Daily batch auction architecture
- Technical architecture summaries
- Launch strategy (Phase 1 focus)
- Design principles & tradeoffs
- Open questions
- Documentation map

### 🎯 Design & Strategy

**[Ideal Solution Characteristics](docs/design/ideal-characteristics.md)**
- Requirements for cross-chain exchange
- Tradeoffs for each property
- How Atomica addresses each
- Design philosophy

**[Futures Market Model](docs/design/futures-market-model.md)** ⭐
- Why futures instead of spot trading
- Daily batch auction architecture
- Settlement delay considerations
- Success criteria

**[Evolution Roadmap](docs/design/evolution-roadmap.md)**
- Phase 1: Single daily batch auction (launch)
- Phase 2: Multiple daily auctions (growth)
- Phase 3: Hybrid spot + futures (maturity)
- Phase 4: Market-driven frequency (advanced)

**[Seller-Stake DKG Design](docs/design/timelock-seller-stake-dkg.md)** ⭐
- **The Dual-Layer "Onion" Timelock**
- Preventing "Invisible Handshake" collusion
- Seller participation and incentives (Scuttle Reward)
- v1.0 Homogeneous Crypto (BLS12-381)

### 🔧 Technical Specifications

**[Architecture Overview](docs/technical/architecture-overview.md)** ⭐
- Complete system architecture
- Unified away chain verification
- Aptos validator timelock implementation
- Dual-layer verification (BLS + ZK)
- Account abstraction

**[Architecture Plan](docs/technical/architecture-plan.md)**
- Detailed technical implementation plan
- Aptos API integration research
- Research topics for implementation

**[Cross-Chain Verification](docs/technical/cross-chain-verification.md)**
- ZK proofs of away-chain state
- Merkle proof inclusion
- Atomic settlement mechanics

**[Ethereum Wallet Atomica Bridge](docs/technical/ethereum-wallet-atomica-bridge.md)**
- Account abstraction specification
- Ethereum wallet integration
- Cross-chain UX flow

**[Timelock Encryption for Sealed Bids](docs/technical/timelock-bids.md)**
- **(DEPRECATED)** Historical reference for Drand/ZK approaches
- Superseded by **[Seller-Stake DKG Design](docs/design/timelock-seller-stake-dkg.md)**

**[Technology Limitations](docs/technical/technology-limitations.md)**
- Why fully private auctions aren't feasible
- Limitations of commit-reveal, ZK, homomorphic encryption
- Atomica's pragmatic approach

### 📊 Game Theory & Economics

**[Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md)**
- Auction mechanism details
- Theoretical foundation (Vickrey, Milgrom, Wilson)
- Shill bidding mitigations
- Game-theoretic properties
- Phased implementation (Phase 1 vs Phase 3+)

**[CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md)** ⭐ (761 lines)
- Detailed economic analysis
- CPMM analysis (challenges, viability)
- Spot auction analysis
- Futures market model analysis
- Comparative tables across all dimensions
- Scenario analysis
- Recommended approach

**[Shill Bidding Analysis](docs/game-theory/shill-bidding-analysis.md)**
- Formal analysis of manipulation attacks
- Attack vectors & scenarios
- Mitigation strategies
- Game-theoretic proofs

### 📋 Architecture Decision Records

**[Unified Away Chain Architecture](docs/decisions/unified-away-chain-architecture.md)** ⭐
- Decision to use single architecture for all chains
- Analysis of chain-specific vs unified approaches
- Gas cost trade-offs (Ethereum vs Solana)
- Why consistency over micro-optimization

**[Atomica Validator Timelock](docs/decisions/aptos-validator-timelock.md)** ⭐
- Decision to use Atomica validators for timelock encryption
- Establishes the **Outer Layer** of the dual-layer security check
- Leverages Aptos-core infrastructure
- Security analysis and implementation plan

**[Bid Validity Simplification](docs/decisions/bid-validity-simplification.md)**
- Decision to use post-decryption validation
- vs ZK proof pre-validation
- Economic deposits prevent spam
- Simpler implementation

### 📚 Background & Context

**[Prior Art: Decentralized Exchanges](docs/background/prior-art.md)**
- Atomic swaps, DCLOBs, CPMMs, bridges
- Shortcomings of each approach
- Combined bridge + exchange risks
- Implications for Atomica

**[CoW Swap Analysis](docs/background/cow-swap-analysis.md)**
- How CoW Swap works (batch auctions, solvers)
- Evaluation against ideal characteristics
- Key limitations (no cross-chain, solver centralization)
- Insights for Atomica design

### 🗄️ Archive

**[Prd-v1-archive.md](docs/archive/Prd-v1-archive.md)** - Original 719-line PRD (pre-refactor)

**[liquidity-provision.md](docs/archive/liquidity-provision.md)** - Exploratory liquidity strategies

**[payment-channel-option.md](docs/archive/payment-channel-option.md)** - Alternative payment channel approach

## Key Concepts

### Atomic Auctions
Novel design combining atomic swaps' trustless cross-chain execution with auction-based competitive price discovery. No bridges, no wrapped tokens, no custodians.

### Futures Market Model
Single daily batch auction with delivery 1-3 hours after auction close (not spot market). Embraces cross-chain latency, enabling better MM economics, liquidity concentration, and simpler mechanism. Settlement delay prevents arbitrage/information withholding and provides verification period.

### Sealed Bids via Timelock Encryption
### Sealed Bids via Dual-Layer Timelock
Bids are encrypted using a **Dual-Layer "Onion"** scheme. The Outer Layer is locked by the Validator Set, and the Inner Layer is locked by a weighted threshold of Sellers. Decryption requires >67% independent Validators AND >33% Sellers to cooperate. This "Invisible Handshake" defense prevents off-chain collusion and early revealing.

**Note:** Atomica chain uses Aptos-core as its blockchain software vendor (consensus, BLS cryptography, Move VM) while running as an independent network.

### Uniform Price Auction
All winning bidders pay the same clearing price (lowest qualifying bid), regardless of original bid. Similar properties to Vickrey auctions under certain conditions (Nobel Prize-winning research).

### Unified Cross-Chain Architecture
All away chains (Ethereum, Solana, Base, Arbitrum, etc.) use identical verification mechanisms. Dual-layer security: BLS threshold signatures (consensus layer) + ZK proofs (computation layer). Both must agree on merkle root for settlement. Single codebase, consistent UX, unified security model.

### Account Abstraction
Users deposit on preferred chains using familiar wallets (MetaMask, Phantom). Account abstraction maps Ethereum addresses to Atomica accounts. Users sign bids with Ethereum wallet—no Atomica-native wallet or gas tokens needed. Never leave your wallet ecosystem.

### Self-Sustaining Economics
Market makers earn through bid-ask spreads (competitive returns, not excess rents). No protocol fees, no subsidies, no token emissions required.

## Reading Paths

### For Product Managers
1. Prd.md (executive summary)
2. Futures Market Model (why this approach)
3. Evolution Roadmap (growth plan)
4. Ideal Solution Characteristics (requirements)

### For Engineers
1. Prd.md (overview)
2. Cross-Chain Verification (technical architecture)
3. Timelock Encryption (sealed bid implementation)
4. Uniform Price Auctions (mechanism details)

### For Economists
1. CPMM vs Auction Comparison (full economic analysis)
2. Uniform Price Auctions (game theory)
3. Shill Bidding Analysis (security proofs)
4. Futures Market Model (why futures pricing)

### For Market Makers
1. Prd.md (what & why)
2. Futures Market Model (daily auction structure)
3. Uniform Price Auctions (bidding mechanism)
4. Evolution Roadmap (future opportunities)

## Design Principles

Atomica prioritizes:
1. **Trustlessness over convenience** - Cryptographic guarantees, no custodians
2. **Economic sustainability over UX familiarity** - Self-sustaining MM economics
3. **Practical deployability over theoretical privacy** - Timelock encryption, not FHE
4. **Market-driven liquidity over protocol subsidies** - Competitive bidding, no tokens

## Change Log

**2025-01-10 - Aggressive Deduplication:**
- Slimmed PRD from 344 → 163 lines (53% reduction)
- Moved all root-level docs into docs/ structure
- Extracted Evolution Roadmap to separate doc
- Extracted Futures Market Model to separate doc
- Created archive/ for historical docs
- Deduplicated mechanism explanations (single source of truth)
- Updated all cross-references

**2025-01-09 - Major Refactor:**
- Created streamlined PRD (344 lines, down from 719 - 52% reduction)
- Extracted background to docs/background/
- Extracted technical specs to docs/technical/
- Extracted design to docs/design/
- Extracted game theory to docs/game-theory/
- Added futures market model analysis

## References

**Nobel Prize Winners in Auction Theory:**
- **Vickrey, W. (1961)** - Revenue equivalence theorem (Nobel 1996)
- **Wilson, R. (1979)** - Uniform-price multi-unit auctions
- **Milgrom, P. & Wilson, R. (2020)** - Auction theory improvements (Nobel 2020)

See individual documents for complete citations.

## Contributing

This is design documentation for Atomica. For questions or suggestions:
- Open an issue for discussion
- Propose changes via pull request
- Ensure technical claims are well-sourced

---

**Status:** Phase 1 design complete, implementation pending
**Last Updated:** 2025-01-10
