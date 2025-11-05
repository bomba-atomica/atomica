# Prior Art: Decentralized Exchanges

This document provides background on existing decentralized exchange mechanisms and their limitations, which inform the design of Atomica's atomic auction system.

## DEX Modalities

### Atomic Swaps (circa 2013)
- First trustless peer-to-peer cryptocurrency exchange mechanism
- Used Hash Time-Locked Contracts (HTLCs) to enable direct trades between parties
- Solved the counterparty risk problem—no trusted intermediary needed
- Enabled true cross-chain exchanges without bridges

### Decentralized Central Limit Order Books (DCLOBs)
- Replicated traditional exchange order book models on-chain (e.g., Serum, dYdX)
- Brought familiar maker-taker dynamics to decentralized trading
- Achieved superior capital efficiency compared to CPMMs through price-specific liquidity provision
- Provided better price discovery through order matching

### Constant Product Market Makers (CPMMs)
- Popularized by Uniswap (2018) using the x*y=k formula, though Bancor (2017) launched the first AMM
- Eliminated need for order matching and direct counterparty interaction
- Automated liquidity provision through pooled assets
- Drastically simplified user experience—just swap against a pool
- Later iterations (Uniswap v3) introduced concentrated liquidity with price range thresholds, creating complex UX for liquidity providers and resulting in lumpy liquidity distribution that degrades trading experience

### Cross-Chain Bridges
- Enable asset transfers between blockchains by locking/burning assets on source chain and minting wrapped tokens on destination chain
- **Trusted/Custodial Bridges**: Rely on central operators (e.g., WBTC via BitGo) or federations to custody assets and issue wrapped tokens
- **Interchain Messaging (IBC)**: Trustless general-purpose protocol enabling cross-chain data and token transfers via light clients (used by 115+ chains in Cosmos ecosystem)
- **Optimistic Bridges**: Use fraud-proof mechanisms similar to optimistic rollups, requiring 30min-2 week challenge periods before finality
- Orthogonal approach to cross-chain liquidity for DCLOBs and CPMMs, but introduce significant additional risks and complexity

## Shortcomings

### Atomic Swaps
- Requires both parties online simultaneously (availability problem)
- Complex negotiation and coordination between counterparties
- Poor user experience for discovering trading partners
- Limited liquidity—purely peer-to-peer matching

### Decentralized Central Limit Order Books
- Vulnerable to MEV attacks (front-running, sandwich attacks) and censorship by block producers
- Full transparency exposes trading strategies and large orders publicly, enabling predatory behavior and eliminating privacy tools like dark pools
- Transparency-induced game theory problems discourage bidders from revealing true prices and scare off certain market participants due to winner's curse and adverse selection risks
- Requires active market making—no passive liquidity provision like AMMs, demanding continuous order management
- Capital lock-up in escrow contracts for unfilled orders creates idle capital and smart contract custody risk
- High gas costs for frequent on-chain operations (order placement, cancellation, updates)
- Liquidity fragmentation across multiple order books and on-chain latency slower than centralized exchanges

### Constant Product Market Makers
- Impermanent loss for liquidity providers
- Adverse selection through Loss-Versus-Rebalancing (LVR)—LPs constantly trade at stale prices against informed arbitrageurs, with fees often insufficient to compensate
- Poor capital efficiency (liquidity spread across entire price curve in v2)
- JIT (Just-in-Time) liquidity attacks in v3 allow sophisticated players to capture fees without risk, disadvantaging passive LPs
- LPs effectively provide free options to traders due to discrete price updates versus continuous market price movements
- Vulnerable to sandwich attacks and other MEV exploitation
- Slippage increases significantly for large trades
- Requires substantial capital to provide meaningful liquidity

### Cross-Chain Bridges
- Severe counterparty risk with trusted/custodial bridges—if custodian (e.g., BitGo for WBTC) is hacked, insolvent, or forced to freeze funds, all wrapped token holders lose value
- Wrapped tokens can depeg from native assets due to market inefficiencies, liquidity issues, or loss of confidence in custodian
- Smart contract vulnerabilities enable exploits (e.g., Wormhole $320M hack, Ronin Bridge $600M hack)
- Minting contract governance on destination chains controlled by small multisig groups—compromised keys enable unlimited minting, and control can be transferred to controversial parties (e.g., WBTC governance changes caused mass redemptions as users lost confidence in new custodians)
- Contract maintenance and upgradability create ongoing centralization risks—over 60% of upgradeable protocol breaches exploit weak upgrade permissions
- Wrapped tokens on "away" chains lose native functionality and composability of home chain assets
- Optimistic bridges introduce significant latency (30min-2 weeks) due to fraud-proof challenge periods
- Centralization of trusted bridges contradicts decentralization ethos and creates single points of failure

### Combined Bridge + Exchange Risks

When users need to exchange assets across chains (e.g., ETH on Ethereum for SOL on Solana), they face compounded risks from both bridges and exchanges:

- **Multiple transaction steps** expose users to all bridge risks (counterparty, depegging, exploits) plus all DEX risks (MEV, slippage, adverse selection) sequentially
- **Liquidity fragmentation** means wrapped tokens have significantly worse liquidity on destination chains (e.g., wETH on Solana has different liquidity pools than native ETH on Ethereum), increasing slippage
- **Increased price impact** from routing through multiple hops: source chain swap → bridge → destination chain swap
- **Accumulated fees** from multiple transactions: bridge fees + gas on source chain + gas on destination chain + DEX swap fees on both sides
- **Time-based risk** as multi-step processes take minutes to hours, exposing users to price volatility between steps
- **Multiple smart contract risk surfaces** across bridge contracts, wrapped token contracts, and DEX contracts on both chains
- **Opacity in cross-chain routing** makes it difficult for users to understand true execution costs and risks
- **Price inefficiencies** due to asset fragmentation across chains, where even small trades can significantly impact prices of wrapped tokens
- **Fragmented UX requiring multiple products**—users must juggle separate wallets for each chain, interact with different bridge and DEX dApps, and manage wrapped tokens in one wallet while native assets sit in another, creating confusion and increasing error risk

## Implications for Atomica

These shortcomings motivate Atomica's design:
1. **No bridges or wrapped tokens** (addressing bridge risks)
2. **Batch auctions with sealed bids** (addressing MEV and transparency issues)
3. **Active market maker participation** (addressing adverse selection)
4. **Native cross-chain settlement** (addressing fragmentation)

For a detailed comparison of different exchange mechanisms in the context of cross-chain swaps, see [CPMM vs Auction Analysis](../../cpmm-vs-auction.md).
