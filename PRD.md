# Atomica Product Requirements Document

## Prior Art: Decentralized Exchanges

### DEX Modalities

**Atomic Swaps (circa 2013)**
- First trustless peer-to-peer cryptocurrency exchange mechanism
- Used Hash Time-Locked Contracts (HTLCs) to enable direct trades between parties
- Solved the counterparty risk problem—no trusted intermediary needed
- Enabled true cross-chain exchanges without bridges

**Decentralized Central Limit Order Books (DCLOBs)**
- Replicated traditional exchange order book models on-chain (e.g., Serum, dYdX)
- Brought familiar maker-taker dynamics to decentralized trading
- Achieved superior capital efficiency compared to CPMMs through price-specific liquidity provision
- Provided better price discovery through order matching

**Constant Product Market Makers (CPMMs)**
- Popularized by Uniswap (2018) using the x*y=k formula, though Bancor (2017) launched the first AMM
- Eliminated need for order matching and direct counterparty interaction
- Automated liquidity provision through pooled assets
- Drastically simplified user experience—just swap against a pool
- Later iterations (Uniswap v3) introduced concentrated liquidity with price range thresholds, creating complex UX for liquidity providers and resulting in lumpy liquidity distribution that degrades trading experience

**Cross-Chain Bridges**
- Enable asset transfers between blockchains by locking/burning assets on source chain and minting wrapped tokens on destination chain
- **Trusted/Custodial Bridges**: Rely on central operators (e.g., WBTC via BitGo) or federations to custody assets and issue wrapped tokens
- **Interchain Messaging (IBC)**: Trustless general-purpose protocol enabling cross-chain data and token transfers via light clients (used by 115+ chains in Cosmos ecosystem)
- **Optimistic Bridges**: Use fraud-proof mechanisms similar to optimistic rollups, requiring 30min-2 week challenge periods before finality
- Orthogonal approach to cross-chain liquidity for DCLOBs and CPMMs, but introduce significant additional risks and complexity

### Shortcomings

**Atomic Swaps**
- Requires both parties online simultaneously (availability problem)
- Complex negotiation and coordination between counterparties
- Poor user experience for discovering trading partners
- Limited liquidity—purely peer-to-peer matching

**Decentralized Central Limit Order Books**
- Vulnerable to MEV attacks (front-running, sandwich attacks) and censorship by block producers
- Full transparency exposes trading strategies and large orders publicly, enabling predatory behavior and eliminating privacy tools like dark pools
- Transparency-induced game theory problems discourage bidders from revealing true prices and scare off certain market participants due to winner's curse and adverse selection risks
- Requires active market making—no passive liquidity provision like AMMs, demanding continuous order management
- Capital lock-up in escrow contracts for unfilled orders creates idle capital and smart contract custody risk
- High gas costs for frequent on-chain operations (order placement, cancellation, updates)
- Liquidity fragmentation across multiple order books and on-chain latency slower than centralized exchanges

**Constant Product Market Makers**
- Impermanent loss for liquidity providers
- Adverse selection through Loss-Versus-Rebalancing (LVR)—LPs constantly trade at stale prices against informed arbitrageurs, with fees often insufficient to compensate
- Poor capital efficiency (liquidity spread across entire price curve in v2)
- JIT (Just-in-Time) liquidity attacks in v3 allow sophisticated players to capture fees without risk, disadvantaging passive LPs
- LPs effectively provide free options to traders due to discrete price updates versus continuous market price movements
- Vulnerable to sandwich attacks and other MEV exploitation
- Slippage increases significantly for large trades
- Requires substantial capital to provide meaningful liquidity

**Cross-Chain Bridges**
- Severe counterparty risk with trusted/custodial bridges—if custodian (e.g., BitGo for WBTC) is hacked, insolvent, or forced to freeze funds, all wrapped token holders lose value
- Wrapped tokens can depeg from native assets due to market inefficiencies, liquidity issues, or loss of confidence in custodian
- Smart contract vulnerabilities enable exploits (e.g., Wormhole $320M hack, Ronin Bridge $600M hack)
- Minting contract governance on destination chains controlled by small multisig groups—compromised keys enable unlimited minting, and control can be transferred to controversial parties (e.g., WBTC governance changes caused mass redemptions as users lost confidence in new custodians)
- Contract maintenance and upgradability create ongoing centralization risks—over 60% of upgradeable protocol breaches exploit weak upgrade permissions
- Wrapped tokens on "away" chains lose native functionality and composability of home chain assets
- Optimistic bridges introduce significant latency (30min-2 weeks) due to fraud-proof challenge periods
- Centralization of trusted bridges contradicts decentralization ethos and creates single points of failure

**Combined Bridge + Exchange Risks**

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

## Ideal Solution Characteristics

An improved cross-chain exchange mechanism would address the shortcomings above with the following properties. Ideally, all information would remain private to maximize game-theoretic fairness and prevent exploitation. However, given current technology limitations (detailed below), a practical solution requires compromise: some public knowledge will be necessary for trustless execution, and some strategies must remain off-chain to preserve critical competitive advantages.

**Private Strategies and Prices**
- Trading strategies and price information remain hidden from other participants and block producers, preventing strategy copying and predatory behavior
- *Tradeoff: Privacy mechanisms may reduce transparency for auditing and regulatory compliance*
- *Tradeoff: Privacy often requires additional cryptographic overhead, increasing computational costs*

**MEV Resistance**
- Orders cannot be front-run, sandwiched, or censored by block producers
- *Tradeoff: Strong MEV protection may require off-chain components or trusted execution environments*
- *Tradeoff: Eliminating all MEV may reduce arbitrage efficiency, potentially leading to worse price discovery*

**Native Cross-Chain Asset Exchange**
- Direct trading of native assets across chains without wrapped tokens or intermediary bridges
- *Tradeoff: Atomic cross-chain protocols require both parties online simultaneously or introduce latency*
- *Tradeoff: May have limited blockchain compatibility compared to bridge-based solutions*

**Passive Liquidity Provision**
- Liquidity providers can earn fees or must be subsidized by the platform, without requiring active order management or suffering adverse selection
- *Tradeoff: Passive mechanisms may be less capital efficient than active market making*
- *Tradeoff: Protecting LPs from adverse selection may reduce execution quality for traders*
- *Tradeoff: Platform subsidies introduce additional costs and may require governance mechanisms for funding allocation*

**No Systematic Adverse Selection**
- Eliminates scenarios where informed traders consistently profit at the expense of liquidity providers or where transparency causes winner's curse effects that discourage participation
- *Tradeoff: Protecting against adverse selection may require limiting information available to all participants*
- *Tradeoff: Reducing information asymmetry may decrease overall market efficiency and price discovery*

**Unified User Experience**
- Single interface for cross-chain trading without managing multiple wallets or wrapped tokens
- *Tradeoff: Abstraction of complexity may reduce user control and transparency into execution*
- *Tradeoff: Unified interfaces may create centralization points or single points of failure*

**No Counterparty or Custodial Risk**
- Trustless execution without relying on centralized custodians or multisig governance
- *Tradeoff: Pure trustlessness may require longer settlement times or complex cryptographic protocols*
- *Tradeoff: Eliminating all trusted parties may limit recourse mechanisms in case of user error*

**Capital Efficiency**
- Liquidity concentrated where trading occurs, minimizing idle capital
- *Tradeoff: Concentrated liquidity may create gaps in price ranges, increasing slippage for large trades*
- *Tradeoff: Highly optimized systems may be more complex and harder to audit for security*

**Protection Against Illiquidity**
- Guaranteed execution quality even in thin markets with unknown participants, preventing catastrophic slippage when legitimate bidders are scarce
- *Tradeoff: Liquidity guarantees may require reserve capital to be set aside, reducing overall capital efficiency*
- *Tradeoff: Backstop mechanisms introduce additional parties who must be compensated, increasing costs*
- *Tradeoff: Protection mechanisms may limit throughput if trades must wait for sufficient liquidity conditions*

## Technology Limitations

Private marketplaces that would enable hidden strategies and prices are not feasible with current state-of-the-art technologies:

**Commit-Reveal Schemes**
- Require high threshold for interactivity—participants must be online for both commit and reveal phases
- Vulnerable to manipulation where parties can strategically fail to reveal, scuttling deals when market moves against them
- Creates timing games where late revealers gain information advantage from early revealers

**Zero-Knowledge Proofs**
- Current ZK implementations for order matching require a trusted operator who knows all participants' bids and orders
- The prover must have access to private inputs to generate proofs, centralizing sensitive information
- No existing ZK schemes enable fully private bilateral matching without a trusted intermediary

**Homomorphic Encryption**
- Requires an operator with decryption keys to either decrypt all individual bids or decrypt the result of homomorphic operations
- Specialized secret sharing and multi-party computation (MPC) systems can distribute trust across operators, but introduce significant coordination overhead
- Cannot be retrofitted to generalized smart contract platforms—requires purpose-built execution environments
- MPC approaches face liveness challenges if any party in the computation goes offline

**Functional Encryption**
- Similar to homomorphic encryption—inputs remain encrypted but function results are publicly readable
- Still in early research phase with no production-ready implementations
- No maintained open-source implementations exist
- Significant performance and security concerns remain unresolved

These limitations mean that achieving truly private strategies and prices while maintaining decentralization, liveness, and trustlessness remains an open research problem. Therefore, a practical solution must leverage **game theory** to design auction mechanisms that function effectively even with public knowledge, combined with **minimal-interaction cryptography** that prevents participants from strategically slowing or scuttling deals.

## Case Study: CoW Swap

CoW Swap (Coincidence of Wants) is a DEX protocol that attempts to address some of the shortcomings identified above by extending the peer-to-peer matching paradigm with batch auctions and competitive solvers.

### How CoW Swap Works

**Batch Auctions**
- Orders are collected over a time period (typically a few minutes) and grouped into batches for simultaneous settlement
- Uniform clearing prices ensure identical token pairs settle at consistent prices within each batch, making transaction order irrelevant

**Coincidence of Wants Matching**
- When two traders want to swap complementary assets (e.g., Alice sells ETH for DAI, Bob sells DAI for ETH), they are matched directly peer-to-peer
- Matched orders execute off-chain without touching AMM liquidity, saving LP fees and gas costs
- Only unmatched portions of orders are routed to on-chain AMMs or DEX aggregators

**Solver Competition**
- Independent third-party "solvers" compete to find the best execution for each batch
- Solvers propose settlement solutions that optimize prices across all orders
- Winning solver must deliver users their signed limit price or better, absorbing any MEV risk
- Competition incentivizes solvers to find optimal routing and CoW matches

**Cross-Chain Approach**
- CoW Swap does NOT support native cross-chain swaps
- Cross-chain functionality relies on integrating with external bridge providers (e.g., Bungee Exchange)
- Users face the same bridge risks (custody, depegging, wrapped tokens) documented earlier

### Evaluation Against Ideal Characteristics

**✓ Partial Success: Private Strategies and Prices**
- Users sign orders with limit prices off-chain, keeping strategies hidden during order collection
- However, orders become public when submitted to solvers and on-chain when settled
- Solvers see all orders in a batch, creating information asymmetry

**✓ Strong Success: MEV Resistance**
- Batch auctions with uniform clearing prices eliminate most MEV opportunities
- Transaction order within batch is irrelevant, preventing front-running
- Solvers absorb MEV risk rather than users
- However, sophisticated solvers could still exploit information advantage from seeing all batch orders

**✗ Failure: Native Cross-Chain Asset Exchange**
- CoW Swap operates on single chains (Ethereum, Gnosis Chain, etc.) in isolation
- Cross-chain swaps require external bridge providers with all associated risks
- No native cross-chain CoW matching—bridges create wrapped tokens and fragmented liquidity

**✓ Partial Success: Passive Liquidity Provision**
- CoW matching eliminates need for LPs when counterparties are found
- However, unmatched orders still rely on underlying AMMs with their LP requirements
- No alternative liquidity provision mechanism for thin markets

**✓ Success: No Systematic Adverse Selection (for matched orders)**
- CoW-matched trades avoid LVR and adverse selection since counterparties trade directly
- Uniform clearing prices within batches reduce information asymmetry
- However, unmatched orders routed to AMMs still suffer from LVR and adverse selection

**✗ Failure: Unified User Experience**
- Cross-chain swaps require separate bridge interfaces
- Users must still manage different wallets for different chains
- Wrapped tokens still create fragmentation

**✓ Partial Success: No Counterparty or Custodial Risk**
- On-chain settlement through smart contracts is trustless
- However, solvers are trusted to compete fairly and not collude
- Cross-chain functionality introduces full bridge custodial risks

**✓ Success: Capital Efficiency**
- CoW matching uses zero capital—pure peer-to-peer exchange
- However, depends on sufficient order flow to create meaningful CoW opportunities
- Low-volume pairs fall back to inefficient AMM routing

**✗ Failure: Protection Against Illiquidity**
- No guarantees of execution quality in thin markets
- If no CoW match exists and AMM liquidity is poor, users face high slippage
- Solver competition may help but provides no hard guarantees

### Key Limitations

**Single-Chain Focus**
- CoW Swap's core mechanism works only within individual blockchains
- Cross-chain requires bridges, inheriting all bridge problems: custody risk, wrapped tokens, governance centralization, depegging

**Dependence on Order Flow**
- CoW matching only works when complementary orders exist in the same batch
- Thin markets or uncommon trading pairs receive minimal benefit
- Falls back to traditional AMM routing with all associated problems

**Solver Centralization Risk**
- Small number of sophisticated solvers creates potential for collusion
- Solvers see all orders in batch before execution, enabling potential exploitation
- Barrier to entry for running competitive solver infrastructure

**Interactivity Requirements**
- Users must wait for batch window to close before execution
- Introduces latency compared to instant AMM swaps
- Market conditions can change during batch window, though limit prices provide protection

### Conclusion

CoW Swap successfully addresses MEV resistance and adverse selection for matched orders through its innovative batch auction and CoW mechanism. However, it fundamentally **does not solve the cross-chain problem**—it relies on external bridges with all their risks. Additionally, its benefits are highly dependent on sufficient order flow, limiting effectiveness for long-tail assets or thin markets. The protocol represents a significant improvement for high-volume pairs on single chains but does not achieve the full vision of trustless, native cross-chain exchange with protection against illiquidity.

## Atomic Auctions: A Novel Design Space

CoW Swap demonstrates a powerful insight: **single-sided auctions** where market makers (termed "solvers") compete to clear user orders can provide MEV protection and capital efficiency without requiring passive liquidity providers. This competitive auction mechanism successfully aligns incentives while avoiding the adverse selection problems that plague AMMs.

However, CoW Swap's single-chain limitation reveals an unexplored design space: what if we could combine the best properties of atomic swaps with the auction clearing mechanisms that make CoW Swap successful?

### The Atomic Auction Paradigm

We propose **Atomic Auctions** as a super-set design that extends the auction-based clearing model to native cross-chain exchanges. Atomic Auctions preserve the key advantages of both atomic swaps and order book markets while introducing competitive market maker dynamics.

**Core Properties:**

**Trustless Walk-Away (from Atomic Swaps)**
- Users can exit transactions at any point without penalty
- No escrowed funds locked in smart contracts waiting for matches
- No wrapped tokens or synthetic assets on destination chains
- Zero counterparty risk—no custodians, bridges, or multisig governance
- Native asset delivery on both chains

**Capital Efficiency (from DCLOBs)**
- Capital is only locked for the specific assets being traded
- No requirement to provide liquidity across entire price curves
- Market makers bring their own capital only when clearing specific auctions
- No compensation required for inactive liquidity providers sitting idle
- Capital efficiency comparable to traditional order books without on-chain escrow risks

**Auction-Based Price Discovery (from CoW Swap)**
- Competitive market makers bid to clear user orders
- Single-sided auction mechanism where users specify desired trades and market makers compete on price
- Market maker competition drives prices toward true market rates
- Eliminates systematic adverse selection since market makers actively choose which auctions to bid on

**Cross-Chain Native Execution**
- Atomic settlement across chains without bridges or wrapped tokens
- Direct delivery of native assets on both source and destination chains
- No liquidity fragmentation from wrapped token variants
- No governance risk from bridge minting contracts

### Key Advantages Over Prior Art

Unlike atomic swaps, Atomic Auctions do not require finding a direct counterparty with complementary needs—professional market makers provide liquidity through competitive bidding. Unlike DCLOBs, no on-chain escrow is needed since atomic settlement guarantees prevent counterparty risk. Unlike bridges, no wrapped tokens or custodians are introduced. And unlike AMMs, no passive LPs suffer from adverse selection since market makers actively evaluate and bid on specific opportunities.

The Atomic Auction design space represents a novel synthesis: leveraging game theory and auction mechanisms to enable trustless cross-chain exchange with capital efficiency comparable to centralized order books, but without their custody risks or geographic limitations.

### Critical Questions

This proposal naturally raises two fundamental questions that must be addressed:

**1. Is this technically possible?**

Given the technology limitations documented earlier—commit-reveal schemes requiring high interactivity, ZK proofs needing trusted operators, homomorphic encryption requiring decryption keys—how can Atomic Auctions achieve cross-chain atomic settlement with competitive auctions? The challenge is coordinating atomic execution across chains while enabling market maker competition without introducing trusted intermediaries or vulnerabilities to strategic manipulation.

**2. Is this game theoretically sound?**

Will market makers actually participate in these auctions? What prevents them from colluding or manipulating the mechanism? How do we ensure users receive competitive prices? Can the auction design handle thin markets where few market makers are active? Are there perverse incentives that could cause the system to fail under certain conditions?

The following sections address these questions by detailing the technical mechanisms that enable Atomic Auctions and analyzing the game-theoretic properties that ensure their robustness.

## Technical Feasibility: Cross-Chain Transaction Verification

The primary technical challenge for Atomic Auctions is **trustless verification of transactions on other chains**. Fortunately, this problem is largely solved through cryptographic accumulator techniques already deployed in production systems.

### The Cross-Chain Verification Model

Consider a high-throughput **Home chain** (where Atomic Auctions are coordinated) and a low-throughput **Away chain** such as Ethereum (where user assets originate). The key insight is that the Home chain can maintain a cryptographic **accumulator** containing the block headers (merkle roots) of the Away chain.

**How It Works:**

**Step 1: Away Chain Header Commitment**
- The Home chain maintains an on-chain record of Away chain block headers (merkle roots)
- These headers are verified trustlessly using Zero-Knowledge Proofs
- This approach is exemplified by Optimism's fraud-proof system and other ZK-rollup architectures
- **Importantly, substantial production software already exists for ZKP rollups that is directly applicable to this case**, including implementations from Succinct Labs and Optimism chain

**Step 2: Transaction Inclusion Proofs**
- Once Away chain merkle roots are trustlessly accessible on the Home chain, any transaction from the Away chain can be proven to have occurred
- Standard merkle tree inclusion proofs demonstrate that a specific transaction was included in a specific Away chain block
- The Home chain can verify these proofs against the committed block headers

**Step 3: Trustless Verification**
- No trusted oracles or bridge operators are needed
- Cryptographic proofs provide mathematical certainty that Away chain transactions occurred
- The verification happens entirely on-chain on the Home chain

### Addressing Performance Constraints

**Known Issue: Gas Costs**
- Verifying merkle inclusion proofs on-chain consumes significant CPU and memory, resulting in high gas costs
- This could make individual transaction verification prohibitively expensive

**Solution 1: ZKP Batching and Compression**
- The Home chain can employ additional Zero-Knowledge Proof systems to batch and compress multiple verification operations
- A single ZK proof can verify many Away chain transactions simultaneously, amortizing gas costs across all verifications
- Compression techniques reduce the on-chain data footprint

**Solution 2: Public Good Subsidization**
- The Home chain protocol can subsidize gas costs for cross-chain verification as a public good
- Gas fee reimbursement programs ensure users don't bear the full cost of maintaining cross-chain security
- This is economically viable if verification costs are spread across many transactions

### Why This Enables Atomic Auctions

With trustless cross-chain transaction verification, Atomic Auctions can:

1. **Verify Away chain deposits** - Confirm users have locked assets on Away chain before auction execution
2. **Prove atomic settlement** - Demonstrate that both sides of the cross-chain swap completed successfully
3. **Eliminate trusted intermediaries** - No bridges, custodians, or oracles needed
4. **Maintain security guarantees** - Cryptographic proofs provide the same security as native on-chain verification

The technology for trustless cross-chain verification exists and is battle-tested. The remaining challenge is not "can we verify cross-chain transactions" but rather "how do we design auctions that leverage this capability to achieve game-theoretic soundness."

For detailed technical implementation of cross-chain atomicity, see [Atomic Guarantee Mechanism](atomic-guarantee-mechanism.md).

## Game-Theoretic Design: Uniform Price Auctions

The second critical question is whether we can design an auction mechanism that functions effectively in a partially public environment while maintaining competitive pricing and preventing manipulation. We propose using a **Uniform Price Multi-Unit Auction** (also known as a "Treasury Auction" after its use in US government bond sales).

### The Auction Mechanism

**Single-Sided Auction Structure**

The auction operates as follows:

**Auctioneer (Away Chain User)**
- User on Away chain (e.g., Ethereum) initiates auction to sell a quantity of their native asset (e.g., ETH)
- Assets are locked in temporary escrow (via HTLC or similar mechanism) on the Away chain
- Escrow is released at auction conclusion based on settlement outcome

**Bidders (Home Chain Market Makers)**
- Professional market makers on Home chain bid for units of the Away chain asset
- Bidders use unlocked balances from ordinary wallets—no capital lock-up required until auction clears
- Each bidder submits bids specifying quantity and price for units they wish to purchase

**Clearing Price Determination**
- All qualifying bids are aggregated and sorted by price (highest to lowest)
- The clearing price is set at the **lowest qualifying bid price** that satisfies the total quantity being auctioned
- **All winning bidders pay the same clearing price**, regardless of their original bid
- This uniform pricing is the key distinguishing feature

**Example:**
- Auctioneer sells 100 ETH units
- Bidder A: 40 units @ $2,000
- Bidder B: 30 units @ $1,980
- Bidder C: 40 units @ $1,950

Result: All three bids clear (40+30+40 = 110 units > 100 needed). Clearing price = $1,950 (lowest qualifying bid). All bidders pay $1,950 per unit, even though A and B bid higher.

### Why This Auction Design?

**Revenue Equivalence to Vickrey Auctions**

The uniform price auction may seem counterintuitive—why should high bidders benefit from low bids? However, foundational research in auction theory demonstrates that uniform price auctions can achieve properties similar to sealed-bid Vickrey auctions under certain conditions.

**Theoretical Foundation:**
- William Vickrey won the 1996 Nobel Prize in Economics for his work on the revenue equivalence theorem, which proved that various auction formats yield equivalent expected revenues under benchmark conditions
- Robert Wilson (1979) provided the seminal game-theoretic analysis of uniform-price multi-unit auctions, demonstrating their properties and strategic considerations
- Paul Milgrom and Robert Wilson won the 2020 Nobel Prize in Economics "for improvements to auction theory and inventions of new auction formats," including work on uniform-price mechanisms

In a Vickrey auction, bidders pay the second-highest price, incentivizing truthful bidding. The uniform price auction achieves similar properties: bidders are incentivized to bid near their true valuation because they pay the market-clearing price, not their bid price. This mechanism enables price discovery even when the auction operates partially in public.

**Tolerance for Public Information**

Unlike DCLOBs where full transparency creates winner's curse and adverse selection, the uniform price auction's design makes public information less exploitable:
- Bidders benefit from others' high bids (raises clearing price) but are protected by paying only the marginal price
- Information about existing bids helps price discovery rather than enabling front-running
- The auction clears at a single point in time, limiting MEV opportunities

### The Shill Bidding Problem

However, low-liquidity anonymous marketplaces introduce a specific vulnerability: **last-minute bid lowering** (shill bidding). A strategic bidder who knows they will receive units could lower their bid below the current lowest bid just before auction close, reducing the clearing price for all bidders (including themselves).

**Attack Scenario:**
- Current bids: A @ $2,000, B @ $1,980, C @ $1,950 (clearing at $1,950)
- Bidder C realizes they'll win and lowers bid to $1,900 at the last second
- New clearing price: $1,900 (all bidders save $50 per unit)
- This collusive behavior undermines price discovery

### Shill Bidding Mitigations

We propose four complementary mitigations:

**1. No Bid Lowering Policy**
- Once a bid is submitted to an auction, it cannot be lowered
- Bidders can increase bids or add new bids, but cannot reduce existing commitments
- This prevents the last-minute bid lowering attack
- Enforced cryptographically through auction smart contract logic

**2. Bid Automators (Always-Online Agents)**
- Market participants submit bids through always-online bid automators
- These are effectively online wallets running on desktops or commodity servers
- Automators can respond quickly to auction opportunities and adjust strategies programmatically
- Reduces the advantage of sophisticated actors with better infrastructure
- Creates more competitive bidding environment

**3. Reserve Price with Commit-Reveal**
- Auctioneer can set a reserve price (minimum acceptable clearing price) using commit-reveal scheme
- During auction setup, auctioneer commits to a hash of their reserve price
- Auction proceeds normally with this commitment on-chain
- **Default behavior**: If auctioneer does nothing, escrow releases and auction settles normally
- **Active rejection**: If clearing price < reserve, auctioneer must actively submit proof (reveal) that auction failed to meet reserve, triggering fund return
- This prevents strategic reserve price manipulation after seeing bids

**4. Reserve Price Cost (Auctioneer Penalty)**
- Exercising the reserve price rejection incurs a cost to the auctioneer: **5% of (reserve price × volume)**
- Note: The fee is calculated on the reserve price, not the final auction clearing price
- This creates an incentive to lower the reserve price (making auctions more attractive to bidders) to reduce insurance costs
- The penalty is distributed to qualifying bidders as compensation for wasted time and opportunity cost
- Creates economic disincentive for auctioneers to set unrealistic reserves
- Ensures auctioneers only reject auctions when clearing price is genuinely unacceptable
- Aligns incentives: auctioneers want auctions to succeed; bidders are protected against time-wasting

### Game-Theoretic Properties

This design achieves several desirable properties:

**Incentive Compatibility**
- Bidders are incentivized to bid near their true valuation (uniform price protects them from winner's curse)
- Auctioneers are incentivized to set realistic reserves (penalty for rejection)
- No advantage to strategic delay or last-minute manipulation (no bid lowering + reserve cost)

**Sybil Resistance**
- Multiple bids from same party don't provide advantage (all pay same clearing price)
- Bid splitting or consolidation strategies are economically neutral

**Collusion Resistance**
- Bidders cannot profitably collude to lower clearing price (no bid lowering policy)
- Auctioneer cannot collude with bidders to manipulate reserve (commit-reveal with default release)

**Market Maker Participation**
- No capital lock-up until auction clears (low opportunity cost)
- Competitive auction ensures market-rate pricing (no adverse selection)
- Always-online automators lower barriers to entry

This auction design enables Atomic Auctions to function effectively in a partially public environment while maintaining competitive pricing and preventing manipulation, even in thin markets with anonymous participants.

For detailed game-theoretic analysis of shill bidding attacks and their mitigations, see [Shill Bidding: Formal Analysis](shill-bidding-analysis.md).

## Open Questions

1. **Data Availability Risk**
   - How is data availability of the away chain guaranteed for home-chain verifiers when only block headers are submitted?

2. **Fraud Proof Latency**
   - What is the expected time window for submitting fraud proofs, and how does this affect finality and UX?

3. **Validator Incentives**
   - Since no extra reward is provided, what prevents rational home-chain validators from ignoring away-chain header submissions or fraud proofs?

4. **Sybil Resistance for Bidders**
   - Without KYC or reputation, what mechanisms limit Sybil bidding beyond griefing cost?

5. **DoS on Auction Participation**
   - Can an attacker cheaply spam fake bids or commitments to delay auction clearing or inflate verification load?

6. **Economic Bounds on Griefing**
   - What is the maximum griefing cost an attacker can impose vs. the minimum stake they must lock?

7. **Misbehavior of Away-Chain Validators**
   - If the away chain reorganizes or censors deposits, how is this detected and resolved on the home chain?

8. **Handling Header Submission Failure**
   - What happens if staked home-chain validators fail (collude or go offline) and headers stop being submitted?

9. **Auction Liveness Guarantees**
   - If no valid bids can be decrypted or verified due to fraud proof disputes, is the auction canceled, delayed, or force-closed?

10. **Cross-Chain Fork Choice Conflicts**
    - How does the home chain decide which away-chain header branch is canonical in the presence of competing submissions?

11. **Upgrade & Parameter Change Governance**
    - Who decides fee parameters, bid commitment formats, fraud proof circuits, etc., and how are upgrades coordinated across chains?

12. **State Blowup from Multiple Auctions**
    - How is storage growth managed if many auctions run in parallel and commitments must remain accessible until fraud windows close?

13. **Partial Participation Strategy**
    - If bidders only participate in select auctions, does this create exploitable patterns (e.g., inference attacks on private bids)?

14. **Replay or Double-Use of Commitments**
    - Can a malicious bidder reuse a valid commitment across auctions to create confusion or extract unintended optionality?

## References

**Nobel Prize Winners in Auction Theory:**

- Vickrey, W. (1961). "Counterspeculation, Auctions, and Competitive Sealed Tenders." *Journal of Finance*, 16(1), 8-37. — Awarded 1996 Nobel Prize in Economics for foundational work on auction theory and revenue equivalence theorem.

- Wilson, R. (1979). "Auctions of Shares." *Quarterly Journal of Economics*, 93(4), 675-689. — Seminal game-theoretic analysis of uniform-price multi-unit auctions.

- Milgrom, P. and Wilson, R. (2020). Awarded Nobel Prize in Economics "for improvements to auction theory and inventions of new auction formats."

**Additional Resources:**

- The Nobel Prize Committee. (2020). "Scientific Background on the Sveriges Riksbank Prize in Economic Sciences in Memory of Alfred Nobel 2020: Improvements to Auction Theory and Inventions of New Auction Formats." Available at: https://www.nobelprize.org/uploads/2020/09/advanced-economicsciencesprize2020.pdf
