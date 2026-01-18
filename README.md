# Atomica Documentation

**The global canonical market open/close auction for crypto.** Twice-daily sealed-bid batch auctions like NYSE open/close for digital assets. Implemented non-custodially with trust minimized cross-chain atomic swaps, with timelock encryption.

## Why?

1. **24/7 continuous trading fragments liquidity** — Crypto is the only major asset class that trades continuously; this creates thin orderbooks at off-peak hours and amplifies adverse selection
2. **Cross-chain execution requires trusted bridges** — $2B+ lost to bridge exploits (2021-2024); wrapped tokens introduce custodial and depegging risk
3. **No canonical reference price** — Unlike equities (NYSE close) or gold (LBMA fixing), crypto lacks an authoritative batch-cleared benchmark
4. **MEV extraction is unavoidable in transparent mempools** — Front-running, sandwich attacks, and arbitrage extraction cost users $600M+ annually
5. **Continuous Market Makers face Loss-Versus-Rebalancing** — LPs systematically lose to informed traders; fees rarely compensate for adverse selection
6. **Large trades suffer significant price impact** — Fragmented liquidity across time means institutional-size orders move markets against themselves

## Quick Start

**New readers should start here:**

1. **[PRD.md](PRD.md)** - Product requirements document (~10 min read)
2. **[Auction Prior Art](docs/analysis/secondary-auctions-plus-continuous.md)** - Institutional auction precedents (~20 min)
3. **[CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md)** - Economic analysis (~20 min)

## Key Concepts

### Atomic Auctions
Novel design combining atomic swaps' trustless cross-chain execution with auction-based competitive price discovery. No bridges, no wrapped tokens, no custodians.

### Twice-Daily Batch Auctions
Two auctions per day at 12:00 PM NYC (17:00 UTC) and 12:00 PM Tokyo (03:00 UTC). All trading pairs clear simultaneously. Settlement 1-3 hours after auction close.

### Sealed Bids via N-Layer Timelock Encryption
Bids are encrypted using an **N-Layer "Onion"** scheme with configurable layer composition. Each layer uses independent key providers (Validators, Sellers, Drand, etc.). Decryption requires cooperation from ALL N layers.

### Uniform Price Auction
All winning bidders pay the same clearing price (lowest qualifying bid), regardless of original bid. Similar properties to Vickrey auctions (Nobel Prize-winning research).

### Fee Model: Deal Breakers Pay Deal Makers
All externalities internalized. Fees proportional to distance from clearing price—accurate bidders get rebates, noisy bidders pay. **Zero operator fees for Bitcoin and Ethereum markets.**

### Unified Cross-Chain Architecture
All away chains (Ethereum, Solana, Base, Arbitrum, etc.) use identical verification mechanisms. Dual-layer security: BLS threshold signatures + ZK proofs.

### Account Abstraction
Users deposit on preferred chains using familiar wallets (MetaMask, Phantom). Sign bids with Ethereum wallet—no Atomica-native wallet or gas tokens needed.

**Note:** Atomica chain uses Aptos-core as its blockchain software vendor (consensus, BLS cryptography, Move VM) while running as an independent network.

### Design Principles

Atomica prioritizes:
1. **Trustlessness over convenience** - Cryptographic guarantees, no custodians
2. **Economic sustainability over UX familiarity** - Self-sustaining economics, no subsidies
3. **Practical deployability over theoretical privacy** - Timelock encryption, not FHE
4. **Market-driven liquidity over protocol subsidies** - Competitive bidding, no tokens
5. **Underserved markets over major pairs** - Long-tail assets where Atomica adds most value

---

## Documentation Structure

```
atomica/
├── PRD.md                    ← Start here (executive summary)
├── README.md                 ← This file (navigation guide)
└── docs/
    ├── development/          ← Implementation planning & status
    │   ├── technical-risks.md
    │   └── timelock-implementation-plan.md
    ├── analysis/             ← Market & economic research
    │   ├── bear-market.md
    │   ├── continuous-vs-auction-markets.md
    │   ├── secondary-auctions-plus-continuous.md
    │   └── gtm-considerations.md
    ├── background/           ← Context & prior art
    │   ├── prior-art.md
    │   └── cow-swap-analysis.md
    ├── design/               ← Product design & strategy
    │   ├── timelock-seller-stake-dkg.md
    ├── technical/            ← Technical specifications
    │   ├── architecture-overview.md
    │   ├── cross-chain-verification.md
    │   ├── cross-chain-swap.md
    │   ├── onion-timelock.md
    │   ├── timelock-dataflow-specification.md
    │   ├── rust-move-interface-specification.md
    │   ├── event-schema-specification.md
    │   ├── bitcoin-taproot-analysis.md
    │   ├── bitcoin-bitvm-sp1-fiamma-analysis.md
    │   └── ethereum-wallet-atomica-bridge.md
    ├── game-theory/          ← Economics & mechanism design
    │   ├── uniform-price-auctions.md
    │   ├── batch-auction-economics.md
    │   ├── shill-bidding-analysis.md
    │   └── cpmm-vs-auction-comparison.md
    ├── decisions/            ← Architecture decision records
    │   ├── unified-away-chain-architecture.md
    │   └── aptos-validator-timelock.md
    └── archive/              ← Historical & exploratory docs
```

## Document Guide

### 🚧 Development & Implementation

**[Technical Risks](docs/development/technical-risks.md)** ⭐
- Three major technical risks and current status
- Risk #1: Ethereum signing of Aptos transactions (✅ DONE)
- Risk #2: Timelock encryption end-to-end (🟡 IN PROGRESS)
- Risk #3: Cross-chain transaction verification (⏳ PENDING)
- Timeline estimates and success criteria

**[Timelock Implementation Plan](docs/development/timelock-implementation-plan.md)** ⭐
- Comprehensive 7-10 week roadmap for Risk #2
- Phase 1: zapatos testing and validation (2-3 weeks)
- Phase 2: atomica-move-contracts integration (3-4 weeks)
- Phase 3: atomica-web frontend (2-3 weeks)

### 📋 Product Specification

**[PRD.md](PRD.md)** - Complete product requirements
- Executive summary: What, why, how
- Problem statement (bridge risks, DEX risks)
- Solution: Atomic Auctions
- Twice-daily auction architecture (12:00 NYC, 12:00 Tokyo)
- Fee structure: Deal breakers pay deal makers
- Technical architecture summaries

### 🎯 Design & Strategy

**[Auction Prior Art](docs/analysis/secondary-auctions-plus-continuous.md)** ⭐
- Institutional auction adoption across asset classes
- Equities (NYSE/LSE), bonds (Treasury), commodities (LME), precious metals (LBMA)
- Why auctions coexist with continuous markets
- Empirical evidence on auction volume share

**[N-Layer Onion Timelock Design](docs/design/timelock-seller-stake-dkg.md)** ⭐
- Pluggable key providers (Validators, Sellers, Drand, etc.)
- Example configurations: Dual-layer and Triple-layer
- Preventing "Invisible Handshake" collusion
- Key provider independence (orthogonal key generation)

**[Batch Auction Economics](docs/game-theory/batch-auction-economics.md)**
- Core Insight: "Embrace Latency"
- Why batch settlement is a feature, not a bug
- Daily auction structure and 1-3 hour settlement justification

### 🔧 Technical Specifications

**[Architecture Overview](docs/technical/architecture-overview.md)** ⭐
- Complete system architecture
- Unified away chain verification
- Dual-layer verification (BLS + ZK)
- Account abstraction

**[Onion Timelock Encryption](docs/technical/onion-timelock.md)**
- Composition and ordering of encryption layers
- Multi-layer security model

**[Timelock Dataflow Specification](docs/technical/timelock-dataflow-specification.md)**
- End-to-end flow from Rust to Move contracts
- DKG and share generation mechanics

**[Rust ↔ Move Interface](docs/technical/rust-move-interface-specification.md)**
- Low-level interface boundaries and native functions
- Event schema and validator transaction formats

**[Cross-Chain Verification](docs/technical/cross-chain-verification.md)**
- ZK proofs of away-chain state
- Merkle proof inclusion
- Atomic settlement mechanics

**[Atomic Cross-Chain Swap](docs/technical/cross-chain-swap.md)**
- Hash Time Locked Contracts (HTLCs) and ZK verification
- "Fail-only" design philosophy for fund safety

### ₿ Bitcoin Integration

**[Bitcoin Taproot Analysis](docs/technical/bitcoin-taproot-analysis.md)**
- Critical analysis of Taproot capabilities for auctions
- Pareto-optimal design for Bitcoin mainnet

**[Fiamma & BitVM Analysis](docs/technical/bitcoin-bitvm-sp1-fiamma-analysis.md)**
- Scaling Bitcoin verification using SP1 and BitVM2
- Comparison of ZK-proof verification pathways on Bitcoin

**[Ethereum Wallet Atomica Bridge](docs/technical/ethereum-wallet-atomica-bridge.md)**
- Account abstraction specification
- Ethereum wallet integration
- Cross-chain UX flow

### 📊 Game Theory & Economics

**[Uniform Price Auctions](docs/game-theory/uniform-price-auctions.md)**
- Auction mechanism details
- Theoretical foundation (Vickrey, Milgrom, Wilson)
- Game-theoretic properties

**[CPMM vs Auction Comparison](docs/game-theory/cpmm-vs-auction-comparison.md)** ⭐
- Detailed economic analysis
- Why batch auctions over continuous AMMs
- Comparative tables across all dimensions

**[Shill Bidding Analysis](docs/game-theory/shill-bidding-analysis.md)**
- Formal analysis of manipulation attacks
- Mitigation strategies
- Game-theoretic proofs

### 📈 Market Analysis

**[Secondary Auctions Analysis](docs/analysis/secondary-auctions-plus-continuous.md)** ⭐
- Equity markets (NYSE/LSE opening/closing auctions)
- Precious metals (LBMA gold/silver fixings)
- Industrial metals (LME ring)
- Energy (Brent MOC window)
- Why secondary auctions coexist with continuous markets

**[Continuous vs Auction Markets](docs/analysis/continuous-vs-auction-markets.md)**
- Historical evidence from 150+ years of markets
- Case studies: Flash crashes, institutional auction adoption
- Why auctions work: equities, bonds, commodities, spectrum

**[Bear Market Analysis](docs/analysis/bear-market.md)**
- Auction advantages in low-liquidity conditions
- Why auctions become more valuable as liquidity fragments

**[GTM Considerations](docs/analysis/gtm-considerations.md)**
- Strategic considerations for go-to-market
- Arbitrageur-focused bootstrap strategy
- Analysis of user segments and acquisition channels

### 📋 Architecture Decision Records

**[Unified Away Chain Architecture](docs/decisions/unified-away-chain-architecture.md)** ⭐
- Decision to use single architecture for all chains
- Why consistency over micro-optimization

**[Atomica Validator Timelock](docs/decisions/aptos-validator-timelock.md)** ⭐
- Decision to use Atomica validators for timelock encryption
- Outer Layer in N-layer onion architecture

**[Bid Validity Simplification](docs/decisions/bid-validity-simplification.md)**
- Post-decryption validation vs ZK pre-validation
- Economic deposits prevent spam

### 📚 Background & Context

**[Prior Art: Decentralized Exchanges](docs/background/prior-art.md)**
- Atomic swaps, DCLOBs, CPMMs, bridges
- Shortcomings of each approach
- Implications for Atomica

**[CoW Swap Analysis](docs/background/cow-swap-analysis.md)**
- How CoW Swap works (batch auctions, solvers)
- Key limitations (no cross-chain)
- Insights for Atomica design
