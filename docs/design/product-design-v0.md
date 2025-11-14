# Atomica Call Auction - Product Design v0

## Overview

The Atomica Call Auction is a daily mechanism for discovering fair market prices and executing trades across multiple blockchain networks. Using time-lock encryption and atomic settlement, it provides a transparent and efficient marketplace for digital assets.

## Core Mechanics

### 1. Auction Schedule

- **Frequency**: Daily event at 12:00 noon EST
- **Prime Trading Window**: One hour (12:00 - 1:00 PM EST)
- **Asset Capacity**: Maximum 10 assets during prime hour
- **Duration per Asset**: 6 minutes per auction

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

### 6. Auction Sequencing

Auctions are ordered to maximize global trading volume:

- **Order**: Highest value assets → Lowest value assets
- **Rationale**: Bidders with rejected bids on popular assets can participate in subsequent auctions
- **Goal**: Maximize total volume across all auctions, not individual asset revenue

**Design Consideration**: This sequencing strategy should be reviewed empirically. Alternative: if auctions ran in reverse order, participants might hold capital for last items, potentially reducing aggregate volume.

### 7. Asset Trading Limits

- **One auction per asset** per day
- **6-minute duration** per auction
- **10 assets maximum** during prime hour (12:00-1:00 PM EST)

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
6. **No Protocol Extraction**: Protocol generates no revenue; all fees redistributed to participants

## Open Questions

1. Should auction sequencing be reversed based on empirical data?
2. What is the optimal distribution formula for reserve price and deposit forfeit fees among buyers?
3. When should migration from drand.love to alternative time-lock encryption occur?
4. How should prime hour capacity (currently 10 assets) scale with demand?

---

**Version**: 0.1
**Last Updated**: 2025-11-14
**Status**: Draft
