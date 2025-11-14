# Atomica Call Auction - Product Design v0

## Overview

The Atomica Call Auction is a daily mechanism for discovering fair market prices and executing trades across multiple blockchain networks. Using time-lock encryption and atomic settlement, it provides a transparent and efficient marketplace for digital assets.

## Core Mechanics

### 1. Auction Schedule

- **Frequency**: Daily event with reveal at 12:00 PM (noon) ET
- **Encryption Key Generation**: 24 hours before auction day
- **Asset Listing Deadline**: 11:30 AM ET
- **Bid Submission Deadline**: 12:00 PM (noon) ET
- **Revelation & Clearing**: 12:00 PM (noon) ET
- **Next Day Key Reveal**: 12:00 PM (noon) ET (simultaneous with decryption, enables next day's bidding)
- **Asset Capacity**: Maximum 10 assets per day
- **Submission Window**: Anytime before respective deadlines

### 2. Multi-Chain Architecture

The auction system supports both single-chain and cross-chain trading scenarios:

#### 2a. Single-Chain Auctions
When all buyers and sellers operate on the same chain (e.g., Ethereum):
- Auction execution occurs natively on that chain
- Only auction **metadata** is registered on the Open Libra chain
- Settlement is direct and efficient within the native chain

#### 2b. Cross-Chain Auctions
When buyers and sellers are distributed across different chains:
- Auction execution is conducted on the **Open Libra chain**
- Cross-chain atomic swaps enable settlement
- See [Cross-Chain Swap Mechanism](./cross-chain-swap.md) for implementation details

### 3. Seller Asset Locking

All sellers must lock their assets before participating:

- **Mechanism**: Hashed Time-Locked Contract (HTLC) on the asset's native chain
- **Release Condition**: Successful auction conclusion
- **Fallback**: Automatic refund if auction fails or asset doesn't clear
- **Optional Feature**: Sellers may stipulate a reserve price

### 4. Reserve Price Economics

Reserve prices function as seller insurance with the following properties:

- **Cost Structure**: Charged **after** auction conclusion
- **Fee Calculation**: Based on Root Mean Square (RMS) delta from clearing price
- **Fee Application**: Only charged to sellers whose assets did **not** find a match
- **Revenue Distribution**: Proceeds distributed to buyers whose bids cleared
- **Protocol Revenue**: The protocol itself generates **no revenue** from this mechanism

**Rationale**: This creates an incentive alignment where sellers pay for the privilege of setting floor prices, while buyers who successfully participated are compensated for market-making.

### 5. Privacy and Encryption

Bid and reserve price confidentiality is maintained using time-lock encryption:

- **Encryption Service**: tlock provided by [drand.love](https://drand.love)
- **Privacy Duration**: Temporary, until auction conclusion
- **Decryption**: Simultaneous reveal at predetermined time
- **Future Plans**: Migration to more suitable system when available
- **Transparency Note**: No expectation of infinite privacy; revealed data serves as statistical information for future auctions

### 6. Auction Sequencing and Multi-Asset Clearing

**Encryption Key Generation**: Time-lock encryption key created 24 hours before auction day

**Asset Listing**: Sellers can list assets anytime, but listings must be submitted by 11:30 AM ET

**Bidding**: Buyers can submit bids anytime, but bids must be submitted by 12:00 PM (noon) ET

**Revelation**: All bids and listings decrypt simultaneously at 12:00 PM (noon) ET (no information cascades during submission)

**Next Day Key Reveal**: At 12:00 PM (noon) ET, simultaneous with current auction decryption, the encryption key for the next day's auction is revealed, enabling immediate bidding for the following day

**Clearing Order**: Auctions clear sequentially in predetermined order: **Smallest market → Biggest market**
- Order: DOGE → LINK → UNI → DOT → ATOM → AVAX → MATIC → SOL → BTC → ETH
- **Rationale**: Prioritize liquidity for underserved small/niche markets where users have fewer alternatives
- **Strategic Focus**: Major markets (ETH/BTC) already have deep liquidity on CEXs/DEXs. Atomica's competitive advantage is providing price discovery for long-tail assets.

**Smart Bidding Mechanism**:
- Since all bids reveal simultaneously, users can bid on multiple assets with total bids exceeding their balance to make capital more efficient
- If `sum(bids) > balance`, protocol charges 5% fee on budget shortfall (`total_bids - balance`) upfront
- Net budget = balance - fee
- Auctions clear sequentially; when user's net budget exhausted, remaining wins forfeited
- Fee enables capital efficiency in simultaneous reveal auctions while deterring griefing attacks

**Example**:
```
User has 100k USDC, bids 150k total (50% over-budget)
Fee: 5% × 50k shortfall = 2.5k USDC (collected upfront)
Net budget: 97.5k USDC

Clearing sequence:
1. DOGE clears: User wins 5k → 92.5k remaining
2. SOL clears: User wins 40k → 52.5k remaining
3. BTC clears: User wins, needs 60k → FORFEITED (only 52.5k left)
4. ETH clears: User wins, needs 50k → FORFEITED

Result: User receives DOGE + SOL, forfeits BTC + ETH
```

**Design Rationale**:
- Simultaneous revelation eliminates sequential timing games during bidding
- Sequential clearing (smallest→biggest) with global priority provides simplest smart contract implementation
- Fee-based griefing deterrent (economic, not algorithmic)
- Focus on underserved markets differentiates Atomica from incumbent venues

**Reference**: See [Sequential Auction Analysis](../game-theory/sequential-auction-analysis.md) for full game theory analysis and alternative designs considered.

### 7. Asset Trading Limits

- **One auction per asset** per day
- **10 assets maximum** per auction window

### 8. Decryption Event

At the conclusion of the auction period:

- **Key Provider**: drand service provides decryption key
- **Timing**: Simultaneous reveal for all bids and reserve prices
- **Transparency**: All encrypted data becomes readable at once

### 9. Price Revelation

The decryption transaction is permissionless:

- **Submission**: Anyone can submit decryption key to auction smart contract
- **Authority**: No special permissions required
- **Practice**: Oracle service will trigger scheduled reveal for reliability
- **Chain**: Occurs on whichever chain hosts the auction execution

### 10. Bid Deposits and Spam Prevention

Bidders must stake value to prevent griefing:

- **Deposit Type**: HTLC deposit at time of bid submission
- **Timing**: Must be placed before auction ends (not necessarily before auction starts)
- **Spam Prevention**: Flat fee deposit required for all bids
- **Honest Bidder Refund**: Deposit returned to sincere participants
- **Penalty Mechanism**: Bidders with high RMS deviation in price or units forfeit deposits
- **Fee Distribution**: Forfeited deposits distributed to bidders whose products cleared (similar to reserve price fee distribution)

**Rationale**: This prevents zero-unit, zero-price bids designed to DOS the auction while not penalizing honest price discovery.

### 11. Clearing Mechanism

Upon decryption, the smart contract executes price discovery:

1. **Ranking**: Sort all sell offers and buy offers
2. **Demand Curve**: Construct supply and demand curves from orders
3. **Clearing Price**: Identify price where supply meets demand
4. **Uniform Pricing**: All clearing bidders pay the same clearing price
5. **Matching**: Determine which units are matched between buyers and sellers

### 12. Settlement

Asset transfer occurs based on auction type:

#### Single-Chain Settlement
- **Execution**: Direct transfer from sellers to buyers
- **Destination**: Assets sent to buyer-specified addresses
- **Speed**: Immediate settlement

#### Cross-Chain Settlement
- **Synchronization**: Wait for cross-chain state confirmation
- **Mechanism**: Atomic swap executed across chains
- **Reference**: See [Cross-Chain Swap Design](./cross-chain-swap.md)

### 13. Auction Atomicity

All auctions are isolated and self-contained:

- **No Persistent State**: No data carries over between auctions
- **No Escrow**: No ongoing custody of assets
- **No Rollover Deposits**: All deposits resolved within auction
- **Complete Settlement**: All participants receive assets or refunds
- **Isolation**: Each auction is independent and atomic

## Design Principles

1. **Fairness**: Uniform clearing price ensures all participants receive equal treatment
2. **Transparency**: Time-lock encryption provides temporary privacy followed by full revelation
3. **Efficiency**: Atomic settlement eliminates counterparty risk
4. **Incentive Alignment**: Fee structures encourage honest participation and discourage spam
5. **Volume Maximization**: Sequencing and design choices optimize for total market volume
6. **Strategic Market Focus**: Prioritize liquidity for underserved small/niche markets (Atomica's competitive advantage)
7. **Protocol Sustainability**: Over-budget fees (3-5%) create protocol revenue while deterring griefing attacks

## Open Questions

1. What is the optimal over-budget fee percentage? (3% base with scaling, or higher?)
2. Should user-defined priority rankings be added in v2 for users who demand preference control?
3. What is the optimal distribution formula for reserve price and deposit forfeit fees among buyers?
4. When should migration from drand.love to alternative time-lock encryption occur?
5. How should auction capacity (currently 10 assets) scale with demand?
6. Which specific markets to include? Start with top 20 altcoins, or focus on more niche assets?

---

**Version**: 0.2
**Last Updated**: 2025-11-14
**Status**: Draft - Multi-Asset Clearing Design Complete

**Changes in v0.2**:
- Updated auction sequencing to sequential clearing with global priority order (smallest→biggest)
- Added over-budget fee mechanism (3-5% fee on over-committed bidders)
- Clarified simultaneous bid revelation with sequential settlement
- Strategic focus: prioritize liquidity for underserved small/niche markets
- Reference to full game theory analysis document
