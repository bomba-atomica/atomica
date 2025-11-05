# Atomica Documentation

**Atomica enables trustless cross-chain atomic swaps via daily batch auctions with futures delivery.**

This repository contains the product requirements, design documentation, and technical specifications for Atomica's atomic auction protocol.

## Quick Start

**New readers should start here:**

1. **[Product Requirements Document (PRD)](Prd.md)** - High-level product specification (~15 min read)
2. **[CPMM vs Auction Comparison](cpmm-vs-auction.md)** - Why we chose auctions over AMMs (~20 min read)
3. **[Timelock Encryption for Sealed Bids](timelock-bids.md)** - How sealed bids work technically (~15 min read)

## Documentation Structure

### 📋 Product Specification

**[Prd.md](Prd.md)** - Complete product requirements document
- Executive summary and problem statement
- Solution overview: Atomic Auctions with futures delivery
- Daily batch auction architecture (Phase 1 launch strategy)
- Technical architecture summary
- Game theory & economics
- Evolution roadmap (Phases 1-4)
- Open questions

### 📊 Economic & Mechanism Analysis

**[cpmm-vs-auction.md](cpmm-vs-auction.md)** - Comprehensive comparison of exchange mechanisms
- CPMM analysis (advantages, challenges, economic viability)
- Spot auction analysis
- **Futures market model** (daily batch auction approach)
- Comparative analysis across all dimensions
- Scenario analysis and recommendations

**[docs/game-theory/uniform-price-auctions.md](docs/game-theory/uniform-price-auctions.md)** - Auction mechanism details
- Uniform price auction mechanics
- Theoretical foundation (Vickrey, Milgrom, Wilson)
- Shill bidding problem and mitigations
- Game-theoretic properties
- Phased implementation strategy

**[shill-bidding-analysis.md](shill-bidding-analysis.md)** - Formal analysis of manipulation attacks
- Attack vectors and scenarios
- Mitigation strategies
- Game-theoretic proofs

### 🔧 Technical Specifications

**[timelock-bids.md](timelock-bids.md)** - Sealed bid implementation (⚠️ Large file: 500+ lines)
- Timelock encryption using drand
- Zero-knowledge proof requirements
- ZK-friendly encryption (Poseidon-based)
- Circuit design and implementation
- Client-side prover and on-chain verifier architecture

**[atomic-guarantee-mechanism.md](atomic-guarantee-mechanism.md)** - Cross-chain atomicity
- Cross-chain transaction verification
- Merkle proof inclusion
- ZK proof of away-chain state
- Atomic settlement flow

**[docs/technical/technology-limitations.md](docs/technical/technology-limitations.md)** - Privacy constraints
- Why fully private auctions aren't feasible
- Limitations of commit-reveal, ZK proofs, homomorphic encryption
- Atomica's pragmatic approach

### 🎯 Design & Requirements

**[docs/design/ideal-characteristics.md](docs/design/ideal-characteristics.md)** - Requirements with tradeoffs
- Ideal solution characteristics
- Tradeoffs for each property
- How Atomica addresses each characteristic
- Design philosophy

### 📚 Background & Context

**[docs/background/prior-art.md](docs/background/prior-art.md)** - Existing DEX mechanisms
- Atomic swaps, DCLOBs, CPMMs, bridges
- Shortcomings of each approach
- Combined bridge + exchange risks

**[docs/background/cow-swap-analysis.md](docs/background/cow-swap-analysis.md)** - CoW Swap case study
- How CoW Swap works
- Evaluation against ideal characteristics
- Key limitations
- Insights for Atomica

### 🗄️ Other Documents

**[liquidity-provision.md](liquidity-provision.md)** - Liquidity provision strategies
**[payment-channel-option.md](payment-channel-option.md)** - Alternative payment channel approach
**[Prd-v1-archive.md](Prd-v1-archive.md)** - Original PRD (archived, 719 lines)

## Key Concepts

### Atomic Auctions
A novel design combining atomic swaps' trustless cross-chain execution with auction-based competitive price discovery. No bridges, no wrapped tokens, no custodians.

### Futures Market Model
Users participate in a single daily batch auction with delivery X hours after auction close (not spot market). This embraces cross-chain latency rather than fighting it, enabling:
- Better market maker economics (hedging opportunities)
- Liquidity concentration (single large auction vs. fragmented)
- Simpler mechanism (no reserve prices needed)
- Clear user expectations

### Sealed Bids via Timelock Encryption
Bids remain cryptographically sealed until auction close, then automatically decrypt via drand randomness beacon. Prevents shill bidding, timing games, and information asymmetry.

### Uniform Price Auction
All winning bidders pay the same clearing price (the lowest qualifying bid), regardless of their original bid. Similar properties to Vickrey auctions under certain conditions.

### Self-Sustaining Economics
Market makers earn through bid-ask spreads (competitive returns, not excess rents). No protocol fees, no subsidies, no token emissions required.

## Evolution Roadmap

**Phase 1 (Launch):** Single daily batch auction per pair, sealed bids, futures delivery (12-24hr settlement), no reserve prices

**Phase 2 (Growth):** Multiple daily auctions (different geographies), bid automators

**Phase 3 (Maturity):** Hybrid spot + futures options, reserve prices for large orders

**Phase 4 (Advanced):** Market-driven frequency, dynamic parameters, sophisticated order types

## Document Change Log

**2025-01 - Major Refactor:**
- Created new streamlined PRD (344 lines, down from 719 lines - 52% reduction)
- Extracted background material to `docs/background/`
- Extracted technical specs to `docs/technical/`
- Extracted design docs to `docs/design/`
- Extracted game theory to `docs/game-theory/`
- Added futures market model analysis to cpmm-vs-auction.md
- Archived original PRD as Prd-v1-archive.md

## Contributing

This is design documentation for Atomica. For questions or suggestions:
- Open an issue for discussion
- Propose changes via pull request
- Ensure technical claims are well-sourced

## Design Principles

Atomica prioritizes:
1. **Trustlessness over convenience** - Cryptographic guarantees, no custodians
2. **Economic sustainability over UX familiarity** - Self-sustaining market maker economics
3. **Practical deployability over theoretical privacy ideals** - Timelock encryption, not FHE
4. **Market-driven liquidity over protocol subsidies** - Competitive bidding, no token emissions

## References

Key academic foundations:
- **Vickrey (1961)** - Revenue equivalence theorem (Nobel Prize 1996)
- **Wilson (1979)** - Uniform-price multi-unit auctions
- **Milgrom & Wilson (2020)** - Auction theory improvements (Nobel Prize 2020)

See individual documents for complete citations and additional references.
