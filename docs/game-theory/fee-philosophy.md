# Fee Philosophy: Constitutional Principles for Atomic Auctions

## Overview

This document establishes the foundational principles for fee design in Atomica's Atomic Auctions. These principles are intended to be constitutional—guiding all current and future mechanism design decisions.

The core insight: auction venues that maximize deal-making achieve better price discovery, which attracts more participants, which further improves price discovery. This creates a virtuous cycle, but only if the fee structure is designed to reinforce rather than undermine it.

## The Three Constitutional Principles

### 1. Independence: Self-Sufficient Isolation

**Principle:** Each auction must be cryptographically isolated and economically self-sufficient, with no dependencies on external protocols, subsidies, or obligations.

**Rationale:**

Atomic Auctions operate in a trustless cross-chain environment where security boundaries must be absolute. Any dependency on external services or protocols introduces:

- **Attack vectors:** Unknown vulnerabilities from protocol composition
- **Economic risk:** Exposure to external protocol failures or exploits
- **Trust assumptions:** Reliance on oracle feeds, governance decisions, or third-party incentives
- **Operational overhead:** Fixed costs requiring ongoing subsidies or treasury management

True atomic settlement requires that at auction conclusion:
- All obligations are settled cryptographically
- No party owes anything to anyone outside the auction participants
- No external subsidy or insurance pool is needed
- No protocol token or governance structure has claims on auction proceeds

**Design Implications:**

- **100% cryptographic guarantees:** Settlement must be enforceable through smart contract logic alone, with no external dependencies
- **No external fees:** No portion of auction value should flow to protocol treasuries, governance tokens, or external stakeholders
- **Minimal fixed costs:** By eliminating external service dependencies, operational costs approach zero (gas fees excepted)
- **No ongoing subsidies:** The auction must be profitable to operate without requiring liquidity mining, grants, or other subsidy mechanisms

This isolation principle ensures auctions can operate indefinitely without protocol politics, treasury depletion, or evolving external dependencies.

### 2. Deal-Making Maximization: Priority Above Revenue

**Principle:** Fee structures should prioritize making deals happen over extracting maximum protocol revenue.

**Rationale:**

The value of an auction venue is measured by:
1. **Price discovery quality:** How accurately does the clearing price reflect true market value?
2. **Liquidity depth:** How much volume can be executed without significant price impact?
3. **Participation:** How many bidders and sellers actively use the venue?

These metrics are interdependent. Better price discovery attracts more participants. More participants provide deeper liquidity. Deeper liquidity improves price discovery. This network effect is the fundamental source of value in any exchange venue.

**The venue that facilitates the most deals wins**, because:
- More completed transactions → more data points for price discovery
- More satisfied participants → stronger network effects and reputation
- More liquidity → better pricing for everyone
- Better pricing → more participants choose this venue over alternatives

**Design Implications:**

- **Variable fees should be minimal:** Gas costs cover the marginal cost of operating auctions; no additional extraction is needed
- **Zero protocol revenue extraction:** Taking fees for protocol treasuries reduces deal-making efficiency without improving service
- **Incentivize participation:** Fee structures should reward active participation rather than penalize it
- **Avoid artificial friction:** No unnecessary locks, delays, or capital requirements that reduce participation

This principle recognizes that exchange venues are natural monopolies—the best venue captures the majority of flow. Therefore, optimizing for deal volume rather than per-deal revenue is the correct long-term strategy.

### 3. Deal-Breakers Pay Deal-Makers

**Principle:** Costs imposed by deal-breaking behavior should be redistributed to participants whose deals succeeded.

**Rationale:**

Some behaviors waste the time and opportunity cost of honest participants:

**Griefing:** Submitting bids with no intention to settle, forcing auction failures and wasting bidder effort.

**Unrealistic reserves:** Auctioneers setting reserve prices far above market clearing price, causing auction rejection after bidders have committed time and capital.

**Strategic delays:** Parties who could settle but intentionally delay, imposing opportunity costs on counterparties.

These behaviors impose negative externalities on deal-makers. Standard economic theory suggests that efficient markets internalize externalities through pricing mechanisms. In our case, the parties who impose costs (deal-breakers) should compensate those who bear costs (deal-makers).

**Where do these fees go?**

Not to:
- ❌ Protocol treasury (violates independence principle)
- ❌ Governance token holders (introduces external dependencies)
- ❌ External insurance pools (creates ongoing subsidy obligations)

Instead:
- ✅ **Pro-rata distribution to clearing bidders** based on units purchased

This approach maintains independence while creating appropriate economic incentives.

**Design Implications:**

**Griefing penalties:**
- Bidders who fail to settle after winning must forfeit their bid deposit
- Forfeited deposits distributed pro-rata to bidders who successfully settled
- Penalty size calibrated to make griefing attacks unprofitable

**Reserve price insurance:**
- If reserve prices are implemented (currently not active), exercising the reserve to reject an auction incurs a cost
- Cost calculated as percentage of (reserve price × volume), e.g., 5%
- Distributed to qualifying bidders as compensation for time and opportunity cost
- Incentivizes realistic reserve setting (lower reserve = lower insurance cost)

**Sybil/spam deterrence:**
- Invalid or spam bids require forfeiting small deposits
- Creates economic cost to blockchain pollution without excluding legitimate participation

**Bidder benefit:**
- Deal-makers receive compensation for time wasted by deal-breakers
- Creates positive incentive to participate in auctions even when some participants may be unreliable
- Improves expected returns for honest bidders, attracting more participation

### Why Pro-Rata Distribution?

Distribution proportional to units purchased is the simplest and fairest allocation mechanism:

**Simplicity:** No complex calculations or discretionary judgments required.

**Incentive alignment:** Bidders who committed more capital (larger purchases) absorbed more opportunity cost, so larger compensation is appropriate.

**Game-theoretic neutrality:** Pro-rata distribution doesn't create perverse incentives to manipulate bid sizes or fragment orders.

**Implementation efficiency:** Straightforward to calculate and distribute in smart contract logic.

Alternative approaches (equal distribution, lottery, governance vote) introduce complexity, potential manipulation vectors, or governance dependencies that violate the independence principle.

## Historical Precedent: US Treasury Primary Dealers

The principle of subsidizing deal-makers is not novel—it has proven precedent in traditional finance.

### The Primary Dealer System

The US Treasury auction system employs **primary dealers**: a select group of broker-dealers authorized to trade directly with the Federal Reserve. These dealers receive privileged access and economic benefits in exchange for market-making obligations:

**Primary Dealer Privileges:**
- **Direct bidding access:** Can submit bids directly in Treasury auctions
- **Non-competitive bid allocation:** Guaranteed allocation at the clearing price without bidding
- **Information access:** Early notification of auction schedules and results
- **Fed relationship:** Direct counterparty status with the Federal Reserve for open market operations

**Primary Dealer Obligations:**
- **Participation requirement:** Must bid in every Treasury auction
- **Market-making:** Provide continuous liquidity in Treasury securities
- **Reporting:** Submit trading data and market intelligence to the Fed
- **Capital requirements:** Maintain substantial capital bases and operational capacity

### Economic Rationale

Why does the Treasury subsidize these dealers?

**Liquidity provision:** Primary dealers commit to participate in every auction, ensuring reliable demand even in stressed markets.

**Price discovery:** Guaranteed participation creates competitive bidding and efficient price formation.

**Market stability:** Dealers absorb initial auction risk and redistribute securities to end investors, smoothing market impact.

**Reduced funding costs:** Reliable liquidity allows the Treasury to fund government operations at lower interest rates—the subsidy is more than offset by improved borrowing terms.

The key insight: **subsidizing reliable deal-makers improves market efficiency enough to justify the cost**.

### Parallel to Atomic Auctions

Our fee philosophy implements a similar principle through a decentralized, cryptographic mechanism:

**Traditional Primary Dealers:**
- Centralized selection process (Fed approves ~25 firms)
- Explicit subsidies through privileged access
- Formal obligations enforced by Fed relationship
- Benefits concentrated among designated institutions

**Atomic Auctions Deal-Maker Subsidy:**
- **Permissionless participation:** Anyone can be a "primary dealer" by successfully settling
- **Distributed subsidies:** Penalties from deal-breakers flow to all clearing bidders pro-rata
- **Cryptographic enforcement:** Settlement obligations enforced by smart contracts, not regulatory relationships
- **Benefits proportional to participation:** Larger bidders receive larger share of redistributed penalties

In both systems, the fundamental economic principle is the same: **compensating reliable market participants improves liquidity and price discovery, creating positive-sum outcomes**.

The difference is implementation:
- **Treasury system:** Centralized selection, regulatory enforcement, explicit subsidy budget
- **Atomic Auctions:** Permissionless access, cryptographic enforcement, self-funded through penalty redistribution

### Why This Works

Both systems succeed because they solve the same market failure:

**The free-rider problem:** In any auction, there's a tension between showing up reliably (providing liquidity) and cherry-picking only the best opportunities. If everyone cherry-picks, liquidity collapses and price discovery fails.

**The solution:** Subsidize participants who commit to reliable settlement, funded by penalties on those who waste market participants' time.

Treasury primary dealers receive subsidies (privileged access, Fed relationship value) funded implicitly by taxpayers and the monetary system. In return, they commit to participate in every auction.

Atomic Auction bidders receive subsidies (penalty redistribution) funded explicitly by deal-breakers. In return, they commit to settle when they win.

**Result in both cases:** More reliable participation → better liquidity → better price discovery → lower costs for all participants.

The US Treasury system validates our fee philosophy: subsidizing deal-makers with costs imposed by deal-breakers is sound economic design with 80+ years of proven success in the world's deepest and most liquid bond market.

## Application to Current Design

### Active Mechanisms

**No external fees:** Gas costs only—no protocol revenue extraction.

**Sealed bids via timelock encryption:** Prevents deal-breaking through bid manipulation.

**No bid lowering:** Once submitted, bids cannot be reduced—prevents shill bidding attacks that break price discovery.

**Bid deposits (spam prevention):** Invalid bids forfeit deposits, currently burned (could be redistributed to clearing bidders in future).

### Potential Future Mechanisms

**Reserve price penalty (if reserves are added):**
- Auctioneer pays 5% of (reserve price × volume) if rejecting auction
- Fee distributed pro-rata to qualifying bidders
- Incentivizes realistic reserve setting without requiring external subsidy

**Griefing penalties:**
- Bidders who win but fail to settle forfeit deposits
- Forfeited deposits redistributed to bidders who successfully settled
- Makes griefing attacks economically unprofitable

**Reputation systems (future consideration):**
- Could track settlement reliability without requiring fees
- Allows bidders to filter out unreliable participants
- Maintains independence by not requiring centralized scoring

## Game-Theoretic Properties

This fee philosophy achieves several desirable properties:

### Economic Efficiency

- **No deadweight loss:** Fees only apply to deal-breaking behavior, not successful transactions
- **Internalized externalities:** Those who impose costs pay those who bear costs
- **Minimal rent extraction:** No protocol revenue reduces friction and maximizes surplus for participants

### Incentive Compatibility

- **Honest bidding incentivized:** No advantage to manipulation when deal-makers are compensated for deal-breaker costs
- **Realistic reserves:** Auctioneers set reserves carefully to avoid insurance penalties
- **Settlement reliability:** Griefing penalties ensure commitment to settle

### Independence & Security

- **No external dependencies:** Fees flow only between auction participants
- **No ongoing subsidies needed:** Auctions are self-sufficient without treasury support
- **Minimal attack surface:** No protocol token or governance can be exploited

### Network Effects

- **Attracts honest participants:** Deal-makers benefit from deal-breaker penalties
- **Repels malicious actors:** Griefing and manipulation become unprofitable
- **Maximizes liquidity:** Low friction and fair compensation attract more participation
- **Better price discovery:** More participants and more deals improve market efficiency

## Canonical Status

These three principles are intended to be **constitutional**—they should guide all future mechanism design decisions:

1. **Independence:** Maintain cryptographic isolation and economic self-sufficiency
2. **Deal-Making Maximization:** Prioritize facilitating transactions over extracting revenue
3. **Deal-Breakers Pay Deal-Makers:** Internalize negative externalities through pro-rata redistribution

Future protocol changes should be evaluated against these principles. Any mechanism that:
- Introduces external dependencies or subsidy requirements → violates principle 1
- Extracts protocol revenue or adds friction to successful deals → violates principle 2
- Allows deal-breakers to impose costs without compensation → violates principle 3

...should be rejected or redesigned.

## Conclusion

The fee philosophy for Atomic Auctions is simple: **create the best venue for making deals happen**.

This requires:
- **Independence:** No external dependencies, subsidies, or obligations
- **Minimal friction:** No protocol revenue extraction on successful deals
- **Aligned incentives:** Deal-breakers compensate deal-makers directly

By following these principles, Atomica creates auction venues that maximize price discovery, liquidity, and participant welfare—making them the natural choice for cross-chain atomic settlement.

## Related Documents

- [Uniform Price Auctions](uniform-price-auctions.md) - Core auction mechanism design
- [Shill Bidding Remediation](shill-bidding-remediation.md) - Defense against manipulation
- [Shill Bidding Analysis](shill-bidding-analysis.md) - Formal game-theoretic analysis
- [CPMM vs Auction Comparison](cpmm-vs-auction-comparison.md) - Why auctions over automated market makers

## References

**Economic Theory:**

- Coase, R. H. (1960). "The Problem of Social Cost." *Journal of Law and Economics*, 3, 1-44. — Foundational work on externalities and property rights.

- Vickrey, W. (1961). "Counterspeculation, Auctions, and Competitive Sealed Tenders." *Journal of Finance*, 16(1), 8-37. — Incentive compatibility in auction design.

**Mechanism Design:**

- Myerson, R. B. (1981). "Optimal Auction Design." *Mathematics of Operations Research*, 6(1), 58-73. — Revenue equivalence and optimal mechanism properties.

- Milgrom, P. and Wilson, R. (2020). Nobel Prize in Economics "for improvements to auction theory and inventions of new auction formats."

**Market Microstructure:**

- Kyle, A. S. (1985). "Continuous Auctions and Insider Trading." *Econometrica*, 53(6), 1315-1335. — Price discovery in market mechanisms.
