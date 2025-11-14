# Bid Visibility Attacks: Why Simultaneous Reveal is Critical

This document explains why simultaneous reveal of all bids at auction end is essential for secure uniform price auctions. Without proper reveal mechanisms, malicious actors can exploit bid visibility to manipulate clearing prices or selectively defect.

## Overview

Uniform price auctions are vulnerable to two critical attacks when bid information becomes visible before the auction finalizes:

1. **Under-subscription Exploitation**: Malicious actors observe unfilled auction capacity and strategically fill it with $0 bids to collapse the clearing price
2. **Sequential Reveal Defection**: In commit-reveal schemes with non-simultaneous reveals, the last revealer can defect after observing all other bids

Both attacks undermine the auction's price discovery mechanism and can result in catastrophic losses for the auctioneer.

## Attack 1: Under-Subscription Exploitation (Visible Bids During Auction)

### The Vulnerability

If bids become visible as the auction progresses (or before it closes), malicious actors can observe the current bid state and exploit any under-subscription.

### Attack Scenario

**Setup:**
- Auction for 100 units of ETH
- Bidder A: 40 units @ $2,000
- Bidder B: 10 units @ $1,950
- **Total bid volume: 50 units (50 units remain unbid)**

**Normal Expected Outcome (if auction closed now):**
- Only 50 units would clear
- Clearing price = $1,950
- Auctioneer sells only half their inventory at market price

**Malicious Actor's Strategy:**
1. Observe that 50 units remain unbid
2. Submit strategic bid: **50 units @ $0**

**Attack Result:**
- All 100 units now have bids (40 + 10 + 50 = 100)
- Clearing price = **$0** (lowest winning bid)
- **All bidders pay $0 per unit** (uniform pricing)
- Bidder A gets 40 units for free (saved $80,000)
- Bidder B gets 10 units for free (saved $19,500)
- Malicious actor gets 50 units for free
- **Auctioneer receives $0 for 100 units**

### Why This Works

The uniform price auction mechanism sets the clearing price at the **lowest winning bid** needed to fill the auction. By strategically filling the gap with a $0 bid, the attacker:

- Ensures the auction clears (all units allocated)
- Forces the clearing price to their $0 bid
- Benefits all bidders (including themselves) at the auctioneer's total expense

### Economic Incentives

**For the Malicious Actor:**
- Zero cost to execute (submitting a $0 bid costs nothing)
- Guaranteed profit if auction was under-subscribed
- No risk (worst case: they win units at $0)

**For Other Bidders:**
- Windfall benefit (units for free instead of market price)
- Creates perverse incentive for collusion or tacit coordination

**For the Auctioneer:**
- Catastrophic loss (entire inventory given away for free)
- Auction mechanism becomes completely unreliable

### Variations of the Attack

**Partial Exploitation:**
- If 80 units are bid, attacker bids remaining 20 units @ $0.01
- Clearing price drops from market rate to $0.01
- Still devastating for auctioneer

**Strategic Positioning:**
- Attacker waits until close to auction deadline to maximize information
- Submits $0 bid at last possible moment to prevent counter-bids
- In blockchain context: front-running the auction close block

## Attack 2: Sequential Reveal Defection (Non-Simultaneous Committed Reveals)

### The Vulnerability

Commit-reveal schemes are often used to hide bids during the auction window. However, if reveals happen sequentially rather than simultaneously, the last revealer gains significant strategic advantage.

### Commit-Reveal Background

**Standard Commit-Reveal Process:**

1. **Commit Phase**: Bidders submit `hash(bid, nonce)` to blockchain
2. **Reveal Phase**: Bidders submit `(bid, nonce)` to prove their commitment
3. **Settlement**: Auction clears based on revealed bids

This prevents bid visibility during the auction. However, the reveal phase introduces a new vulnerability.

### Attack Scenario

**Setup:**
- Auction for 100 units
- All bidders have committed bids (hashes on-chain)
- Reveals happen sequentially over time
- Malicious Bidder M is positioned to reveal last

**Sequential Reveal Timeline:**

1. **T1**: Bidder A reveals: 40 units @ $2,000
2. **T2**: Bidder B reveals: 30 units @ $1,980
3. **T3**: Bidder C reveals: 40 units @ $1,950
4. **T4**: Malicious Bidder M must reveal...

**At T4, Bidder M observes:**
- Current bids total: 110 units (over-subscribed)
- Clearing price would be: $1,950
- M's committed bid (only M knows): 20 units @ $1,900

**M's Strategic Decision:**

**Option 1: Reveal Honestly**
- M reveals: 20 units @ $1,900
- New clearing price: $1,900 (M's bid becomes marginal)
- M wins 20 units @ $1,900
- All other bidders also pay $1,900 (save $50 per unit)

**Option 2: Defect (Don't Reveal)**
- M abandons their committed bid
- Clearing price stays at $1,950
- A, B, C all pay $1,950 per unit
- M pays nothing, wins nothing
- **But**: If M also had a legitimate high bid (say 10 units @ $2,100), they would pay $1,950 instead of $1,900

**M's Calculation:**
- If revealing would lower the clearing price and M wants to minimize payment → **defect**
- If revealing would raise M's allocation at acceptable price → **reveal**
- If M can manipulate to disadvantage competitors → **strategic choice**

### Why This is Problematic

**Information Asymmetry:**
- Last revealer has complete information (all other bids known)
- Last revealer has optionality (reveal or defect based on outcomes)
- First revealers have no information (reveal blind)

**Auction Manipulation:**
- Rational actor may defect to avoid lowering clearing price
- Creates incentive to be the last revealer
- Undermines commitment mechanism entirely

**Game-Theoretic Instability:**
- If participants anticipate this, they may delay reveals
- Creates reveal coordination game separate from bidding
- No equilibrium strategy for honest participants

### Economic Incentives

**For the Last Revealer:**
- Free option value: observe all bids before deciding
- Can optimize their outcome based on complete information
- No penalty for defection in many implementations

**For Early Revealers:**
- Strictly disadvantaged (reveal without information)
- Rational strategy: delay revealing as long as possible
- Creates reveal deadline clustering and potential DoS

**For Auction Integrity:**
- Price discovery becomes dependent on reveal order
- Commitment scheme fails to prevent strategic behavior
- Auction outcome becomes unpredictable

## Mitigation: True Simultaneous Reveal

### The Solution

Both attacks are prevented by ensuring all bids are revealed simultaneously at a precise moment in time. No participant can observe others' bids before committing to their own reveal.

### Implementation Requirements

**1. Atomic Reveal Mechanism**

All reveals must happen in a single atomic operation:
- No sequential ordering of reveals
- No participant can observe partial reveal state
- Either all bids reveal simultaneously or auction fails

**2. Timelock Encryption (Recommended Approach)**

Use cryptographic timelock encryption (e.g., drand/tlock):

**Commit Phase:**
- Bidders encrypt their bids with future timelock
- Submit encrypted bids to blockchain
- Encryption key automatically becomes available at specified time

**Reveal Phase:**
- At auction end time T, timelock key is automatically released
- All encrypted bids become simultaneously decryptable
- No sequential reveal, no defection possible

**Settlement:**
- All bids decrypt at same moment
- Clearing price computed on complete bid set
- No information leakage before simultaneous reveal

**3. Trusted Execution Environment (Alternative)**

Use TEE (e.g., Intel SGX) to:
- Collect encrypted bids in sealed enclave
- Reveal all bids simultaneously at predetermined time
- Compute clearing price in private environment

### Why Timelock Works

**Removes Participant Control:**
- Decryption happens automatically (via drand)
- No participant can choose to defect
- No reveal ordering attacks possible

**Simultaneous by Design:**
- All bids become readable at same timestamp
- No information asymmetry between participants
- Perfect coordination of reveal timing

**Trustless Execution:**
- drand provides distributed randomness beacon
- No single party controls reveal timing
- Cryptographically guaranteed simultaneous reveal

## Attack Surface Comparison

| Mechanism | Under-subscription Attack | Sequential Reveal Defection | Information Leakage |
|-----------|--------------------------|----------------------------|---------------------|
| Visible Bids | **VULNERABLE** | N/A | Complete visibility |
| Sequential Commit-Reveal | Prevented | **VULNERABLE** | Gradual during reveal |
| Simultaneous Timelock | Prevented | Prevented | None until reveal |
| TEE-based Reveal | Prevented | Prevented | None until reveal |

## Conclusion

Simultaneous reveal is not optional—it is a critical security requirement for uniform price auctions. Without it:

1. **Under-subscription attacks** allow malicious actors to collapse clearing prices to $0 by observing and exploiting unfilled capacity
2. **Sequential reveal defection** allows the last revealer to manipulate outcomes by selectively revealing based on complete information

**Atomica's Approach:**

Atomica implements timelock encryption using drand for cryptographically guaranteed simultaneous reveal. This ensures:
- No bid visibility during auction window
- No sequential reveal vulnerabilities
- Trustless, automatic reveal at auction close
- Robust defense against both attack vectors

## Related Documents

- [Uniform Price Auctions](./uniform-price-auctions.md) - Core auction mechanism design
- [Shill Bidding Analysis](./shill-bidding-analysis.md) - Additional manipulation vectors
- [Timelock Encryption for Sealed Bids](../timelock-bids.md) - Technical implementation

## Academic References

- Milgrom, P. (2004). "Putting Auction Theory to Work." Cambridge University Press. - Chapter on information revelation in auctions

- Edelman, B., Ostrovsky, M., and Schwarz, M. (2007). "Internet Advertising and the Generalized Second-Price Auction: Selling Billions of Dollars Worth of Keywords." *American Economic Review*, 97(1), 242-259. - Analysis of sequential bidding vulnerabilities

- Sönmez, T. and Ünver, M.U. (2010). "Course Bidding at Business Schools." *International Economic Review*, 51(1), 99-123. - Discusses commit-reveal auction mechanisms and their strategic properties
