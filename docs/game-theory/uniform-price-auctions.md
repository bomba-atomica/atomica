# Uniform Price Auctions: Game-Theoretic Design

This document describes the uniform price auction mechanism used in Atomica's Atomic Auctions, including its theoretical foundations, strategic properties, and mitigations for manipulation attacks.

## Overview

The uniform price multi-unit auction (also known as a "Treasury Auction" after its use in US government bond sales) is designed to function effectively in a partially public environment while maintaining competitive pricing and preventing manipulation.

## The Auction Mechanism

### Single-Sided Auction Structure

The auction operates as follows:

**Auctioneer (Away Chain User)**
- User on Away chain (e.g., Ethereum) initiates auction to sell a quantity of their native asset (e.g., ETH)
- Assets are locked in temporary escrow (via HTLC or similar mechanism) on the Away chain
- Escrow is released at auction conclusion based on settlement outcome

**Bidders (Home Chain Participants)**
- Professional bidders on Home chain bid for units of the Away chain asset
- Bidders use unlocked balances from ordinary wallets—no capital lock-up required until auction clears
- Each bidder submits bids specifying quantity and price for units they wish to purchase

**Clearing Price Determination**
- All qualifying bids are aggregated and sorted by price (highest to lowest)
- The clearing price is set at the **lowest qualifying bid price** that satisfies the total quantity being auctioned
- **All winning bidders pay the same clearing price**, regardless of their original bid
- This uniform pricing is the key distinguishing feature

### Example

**Scenario:**
- Auctioneer sells 100 ETH units
- Bidder A: 40 units @ $2,000
- Bidder B: 30 units @ $1,980
- Bidder C: 40 units @ $1,950

**Result:**
- All three bids clear (40+30+40 = 110 units > 100 needed)
- Clearing price = $1,950 (lowest qualifying bid)
- All bidders pay $1,950 per unit, even though A and B bid higher

## Theoretical Foundation

### Why This Auction Design?

The uniform price auction may seem counterintuitive—why should high bidders benefit from low bids? However, foundational research in auction theory demonstrates that uniform price auctions can achieve properties similar to sealed-bid Vickrey auctions under certain conditions.

**Revenue Equivalence to Vickrey Auctions:**

- **William Vickrey** won the 1996 Nobel Prize in Economics for his work on the revenue equivalence theorem, which proved that various auction formats yield equivalent expected revenues under benchmark conditions

- **Robert Wilson** (1979) provided the seminal game-theoretic analysis of uniform-price multi-unit auctions, demonstrating their properties and strategic considerations

- **Paul Milgrom and Robert Wilson** won the 2020 Nobel Prize in Economics "for improvements to auction theory and inventions of new auction formats," including work on uniform-price mechanisms

In a Vickrey auction, bidders pay the second-highest price, incentivizing truthful bidding. The uniform price auction achieves similar properties: bidders are incentivized to bid near their true valuation because they pay the market-clearing price, not their bid price. This mechanism enables price discovery even when the auction operates partially in public.

### Tolerance for Public Information

Unlike DCLOBs where full transparency creates winner's curse and adverse selection, the uniform price auction's design makes public information less exploitable:

- Bidders benefit from others' high bids (raises clearing price) but are protected by paying only the marginal price
- Information about existing bids helps price discovery rather than enabling front-running
- The auction clears at a single point in time, limiting MEV opportunities

## The Shill Bidding Problem

However, low-liquidity anonymous marketplaces introduce a specific vulnerability: **last-minute bid lowering** (shill bidding). A strategic bidder who knows they will receive units could lower their bid below the current lowest bid just before auction close, reducing the clearing price for all bidders (including themselves).

**Attack Scenario:**
- Current bids: A @ $2,000, B @ $1,980, C @ $1,950 (clearing at $1,950)
- Bidder C realizes they'll win and lowers bid to $1,900 at the last second
- New clearing price: $1,900 (all bidders save $50 per unit)
- This collusive behavior undermines price discovery

## Shill Bidding Mitigations

Atomica employs four complementary mitigations:

### 1. No Bid Lowering Policy

- Once a bid is submitted to an auction, it cannot be lowered
- Bidders can increase bids or add new bids, but cannot reduce existing commitments
- This prevents the last-minute bid lowering attack
- Enforced cryptographically through auction smart contract logic

### 2. Bid Automators (Always-Online Agents)

**Note:** This mitigation is less critical for the current daily batch auction with sealed bids.

- Market participants can submit bids through always-online bid automators
- These are effectively online wallets running on desktops or commodity servers
- Automators can respond quickly to auction opportunities and adjust strategies programmatically
- Reduces the advantage of sophisticated actors with better infrastructure
- Creates more competitive bidding environment

### 3. Reserve Price with Commit-Reveal

**Status:** Not currently implemented. Potential future feature for large individual orders requiring guaranteed minimum prices.

**Mechanism:**
- Auctioneer could set a reserve price (minimum acceptable clearing price) using commit-reveal scheme
- During auction setup, auctioneer commits to a hash of their reserve price
- Auction proceeds normally with this commitment on-chain
- **Default behavior**: If auctioneer does nothing, escrow releases and auction settles normally
- **Active rejection**: If clearing price < reserve, auctioneer must actively submit proof (reveal) that auction failed to meet reserve, triggering fund return
- This prevents strategic reserve price manipulation after seeing bids

**Use Case:** Large individual orders (e.g., institutional trades) that require execution guarantees and can afford to pay for this protection.

### 4. Reserve Price Cost (Auctioneer Penalty)

**Status:** Not currently implemented. Applies only if reserve prices are added in future.

**Mechanism:**
- Exercising the reserve price rejection would incur a cost to the auctioneer: **5% of (reserve price × volume)**
- Note: The fee is calculated on the reserve price, not the final auction clearing price
- This creates an incentive to lower the reserve price (making auctions more attractive to bidders) to reduce insurance costs
- The penalty is distributed to qualifying bidders as compensation for wasted time and opportunity cost
- Creates economic disincentive for auctioneers to set unrealistic reserves
- Ensures auctioneers only reject auctions when clearing price is genuinely unacceptable
- Aligns incentives: auctioneers want auctions to succeed; bidders are protected against time-wasting

## Game-Theoretic Properties

This design achieves several desirable properties:

### Incentive Compatibility

- Bidders are incentivized to bid near their true valuation (uniform price protects them from winner's curse)
- Auctioneers incentivized to set realistic reserves when used (penalty for rejection)
- No advantage to strategic delay or last-minute manipulation (no bid lowering + sealed bids)

### Sybil Resistance

- Multiple bids from same party don't provide advantage (all pay same clearing price)
- Bid splitting or consolidation strategies are economically neutral

### Collusion Resistance

- Bidders cannot profitably collude to lower clearing price (no bid lowering policy)
- Auctioneer cannot collude with bidders to manipulate reserve (commit-reveal with default release)
- Sealed bids prevent coordination during auction window

### Bidder Participation

- No capital lock-up until auction clears (low opportunity cost)
- Competitive auction ensures market-rate pricing (no adverse selection)
- Always-online automators can lower barriers to entry

## Current Implementation

**Active Mitigations:**
- No bid lowering policy (enforced in smart contract)
- Sealed bids via timelock encryption (prevents shill bidding entirely)
- No reserve prices (relies on competitive bidding and liquidity concentration)

**Rationale:** Sealed bids make most other mitigations unnecessary during auction window.

**Potential Future Enhancements:**
- Bid automators for increased competition
- Reserve prices for large individual orders requiring execution guarantees
- Reserve price penalty mechanism to prevent abuse

## Conclusion

The uniform price auction mechanism enables Atomic Auctions to function effectively in a partially public environment while maintaining competitive pricing and preventing manipulation, even in thin markets with anonymous participants.

## Related Documents

- [Shill Bidding: Formal Analysis](../../shill-bidding-analysis.md) - Detailed game-theoretic analysis
- [Timelock Encryption for Sealed Bids](../../timelock-bids.md) - Technical implementation of bid privacy
- [CPMM vs Auction Analysis](../../cpmm-vs-auction.md) - Comparative analysis of exchange mechanisms
- [Atomica PRD](../../Prd.md) - Overall product design

## Academic References

**Nobel Prize Winners in Auction Theory:**

- Vickrey, W. (1961). "Counterspeculation, Auctions, and Competitive Sealed Tenders." *Journal of Finance*, 16(1), 8-37. — Awarded 1996 Nobel Prize in Economics for foundational work on auction theory and revenue equivalence theorem.

- Wilson, R. (1979). "Auctions of Shares." *Quarterly Journal of Economics*, 93(4), 675-689. — Seminal game-theoretic analysis of uniform-price multi-unit auctions.

- Milgrom, P. and Wilson, R. (2020). Awarded Nobel Prize in Economics "for improvements to auction theory and inventions of new auction formats."

**Additional Resources:**

- The Nobel Prize Committee. (2020). "Scientific Background on the Sveriges Riksbank Prize in Economic Sciences in Memory of Alfred Nobel 2020: Improvements to Auction Theory and Inventions of New Auction Formats." Available at: https://www.nobelprize.org/uploads/2020/09/advanced-economicsciencesprize2020.pdf
