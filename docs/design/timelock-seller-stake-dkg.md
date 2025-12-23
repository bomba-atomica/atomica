# Design: N-Layer Onion Timelock Encryption

## 1. Project Brief & Architecture Evolution

**Previous Context:** The "Traitor's Bounty" mechanism (v1) was found to have critical MEV vulnerabilities.
**New Direction:** N-layer "Onion" encryption with pluggable key providers for maximum flexibility and security.

**Core Concept:** "The N-Layer Onion"
- Timelocks use **N-layer onion encryption** with configurable layer composition
- Each layer can use independent key providers (Validators, Sellers, Drand, etc.)
- Decryption requires cooperation from **ALL N layers** in sequential order
- Layer count, provider types, and ordering are configurable per auction
- **Key Innovation:** Attackers must compromise ALL layers to decrypt early; adding layers exponentially increases attack difficulty

**Example Configurations:**
- **Single-Layer**: Validator-only (baseline security)
- **Dual-Layer (Validator + Seller)**: Requires >67% validators AND >33% seller stake
- **Dual-Layer (Validator + Drand)**: Requires >67% validators AND Drand beacon reveal
- **Triple-Layer (Validator + Drand + Seller)**: Requires all three providers

---

## 2. N-Layer Onion Architecture

### 2.1 Generalized Multi-Layer Encryption

**Abstraction:** Support arbitrary N ≥ 1 encryption layers with pluggable providers

$$C = Enc_{L_1}(Enc_{L_2}(...Enc_{L_N}(Plaintext)...))$$

Where each layer $L_i$ is provided by an independent key source.

**Sequential Decryption:**
1. Decrypt Layer 1 (outermost) → reveals $C_{layer2}$
2. Decrypt Layer 2 → reveals $C_{layer3}$
3. ... Continue for N layers ...
4. Decrypt Layer N (innermost) → reveals Plaintext

**Key Provider Independence:**
- How each provider generates keys is orthogonal to the onion structure
- Validators use BIBE/IBE with time-based identity
- Sellers use threshold DKG with ElGamal
- Drand uses tlock public randomness beacon
- Future providers can be added without modifying core framework

### 2.2 Example: Dual-Layer (Validator + Seller)

**Implementation for v1.0:** Use **BLS12-381** for both layers to enable code reuse of the `aptos-dkg` crate.

$$C = Enc_{Validator\_BIBE}(Enc_{Seller\_BLS}(Bid))$$

1. **Layer 1 - Validator Layer (Outer):**
   - **Scheme:** BIBE (Boneh-Franklin IBE) on BLS12-381
   - **Threshold:** >67% of validators
   - **Logic:** Time-based identity encryption (auction end time)
   - **Key Generation:** Validators maintain BLS key pairs via consensus

2. **Layer 2 - Seller Layer (Inner):**
   - **Scheme:** Threshold BLS Encryption (ElGamal on G1)
   - **Curve:** BLS12-381 (same as validators)
   - **Threshold:** >33% of seller stake
   - **Logic:** Sellers perform DKG for group public key
   - **Key Generation:** Per-auction DKG among sellers
   - **UX Note:** Sellers use ephemeral "Session Key" derived from wallet signature

### 2.3 Example: Triple-Layer (Validator + Drand + Seller)

$$C = Enc_{Validator}(Enc_{Drand}(Enc_{Seller}(Bid)))$$

1. **Layer 1 - Validator Layer (Outer):** Same as above
2. **Layer 2 - Drand Layer (Middle):**
   - **Scheme:** Drand tlock (timelock encryption)
   - **Logic:** Public randomness beacon at specific round
   - **Key Generation:** Drand network provides public keys
   - **Threshold:** n/a (public beacon, deterministic reveal)
3. **Layer 3 - Seller Layer (Inner):** Same as above

**Security Benefit:** Attacker needs >67% validators AND Drand compromise AND >33% seller stake

### 2.4 Future: Heterogeneous Cryptography (v2.0+)
- Migration to different curves per layer (e.g., BLS12-381, BN254, secp256k1)
- Eliminates single-curve failure risks
- For v1.0, we prioritize implementation safety (code reuse) over crypto-diversity

### 2.5 Layer Dependency (The "Nested Vault" Model)

**Requirement:** Inner layer keys must be **functionally dependent** on outer layers.

**Mechanism: Functional Dependency via Onion Nesting**

For N layers, we treat decryption capability as:
$$K_{System} = K_1 \circ K_2 \circ ... \circ K_N$$

Where $\circ$ represents functional composition (sequential dependency).

**Key Properties:**

1. **Existential Independence:** Each layer's private key exists mathematically independent
   - Seller group secret $S_{Seller}$ is independent of validator keys
   - Drand randomness is independent of both

2. **Functional Dependence:** However, **utility** is strictly ordered
   - Inner layer keys are useless without outer layer decryption first
   - Example: Even if attackers reconstruct $S_{Seller}$ early, they lack the input ciphertext
   - They hold "a key to a door that is inside a locked vault inside another locked vault..."
   - Adding more layers exponentially increases attack complexity

3. **Sequential Unlocking:**
   - Cannot skip layers (cryptographically enforced)
   - Each layer reveals ciphertext for next layer only
   - Final layer reveals plaintext

**Note on PVSS:** Implementing stricter "Existential Dependency" (where inner keys cannot be reconstructed before outer layers) would require Time-Locked PVSS. We reject this due to complexity and liveness risks. Functional dependency via onion nesting provides equivalent application-layer security.

### 2.6 Layer Provider Participation

**Configurable Per Auction:** Auction creator specifies which layers to use and in what order.

**Example: Seller Layer Participation (When Used)**
-   **Selection:** Any seller attempting to sell assets in the auction *must* generate a DKG key share as part of their deposit transaction.
-   **Weighting:** Shares are weighted by the USD value of the assets locked.
    -   *Rationale:* Large sellers have the most to lose if the auction reputation is destroyed by collusion.
-   **Threshold:** $t_{sellers} = 33\%$ of total stake.

---

## 3. Security & Game Theory

### 3.1 Collusion Resistance (The "N-Way Cabal")

**General Case:** To decrypt early with N layers, an attacker needs:
- Compromise threshold for Layer 1 AND
- Compromise threshold for Layer 2 AND
- ... AND
- Compromise threshold for Layer N

**Example: Dual-Layer (Validator + Seller)**
1. **>67% of Validator Stake** (Standard BFT breakdown)
2. **PLUS >33% of Seller Stake** (Must bribe/control one-third of assets for sale)

**Example: Triple-Layer (Validator + Drand + Seller)**
1. **>67% of Validator Stake**
2. **PLUS Drand Network Compromise** (Requires attacking Drand beacon infrastructure)
3. **PLUS >33% of Seller Stake**

**Security Benefits:**
- **Independent Interest Groups:** Each layer has different economic incentives
  - Validators want fees
  - Sellers want high clearing prices
  - Drand is a public good (no direct economic interest in specific auctions)
- **Exponential Coordination Cost:** Coordinating N distinct groups off-chain without detection is exponentially harder
- **Sybil Resistance (Seller Layer):** Must lock real assets to gain shares (capital cost)
- **Attack Surface Diversification:** Different attack vectors required for each layer

### 3.2 Liveness Analysis (Multi-Layer)

**General Principle:** Each layer's threshold balances security vs liveness

**Example: Dual-Layer (Validator + Seller) Liveness**

**The 33% Seller Threshold Solution:**
- Seller decryption threshold set to just **33%** of stake
- To *stop* auction (liveness failure), **>67%** of sellers must refuse to sign
- Even if 60% of sellers are malicious/offline, remaining 40% can decrypt

| Scenario | Validator Threshold | Seller Threshold | Outcome |
| :--- | :--- | :--- | :--- |
| **Normal Op** | >67% Online | >33% Online | ✅ Success |
| **Validator Failure** | <67% Online | 100% Online | ❌ Fail (Chain Halt) |
| **Seller Failure** | 100% Online | <33% Online | ❌ Fail (Auction Halt) |

**Example: Triple-Layer (Validator + Drand + Seller) Liveness**

| Scenario | Validators | Drand | Sellers | Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **Normal** | >67% | ✅ Revealed | >33% | ✅ Success |
| **Drand Delay** | >67% | ⏳ Not Yet | >33% | ⏳ Wait for Drand |
| **Drand Failure** | >67% | ❌ Failed | >33% | ❌ Auction Halt |

**Griefing Mitigation (Applicable to Seller Layer):**
- **Defense:** Slashing for non-participation
- Sellers who fail to submit valid shares forfeit Security Fee + deposit penalty (e.g., 5%)
- Prevents free griefing attacks

**Layer-Specific Security vs Liveness Trade-offs:**

| Layer Type | Typical Threshold | Security Benefit | Liveness Risk |
| :--- | :--- | :--- | :--- |
| Validator | >67% | High (BFT security) | Low (validators incentivized) |
| Seller | >33% | Medium (capital cost) | Low (low threshold) |
| Drand | n/a (deterministic) | High (independent infrastructure) | Medium (depends on Drand uptime) |

**Attack Scenarios:**

| **Early Decrypt** | **Validators** | **Sellers** | **Outcome** |
| :--- | :--- | :--- | :--- |
| Validator Attack | **Colluding (>67%)** | Honest | ✅ **Safe** (Sellers block) |
| Seller Attack | Honest | **Colluding (>33%)** | ✅ **Safe** (Validators block) |
| Total Compromise | **Colluding (>67%)** | **Colluding (>33%)** | ❌ **Broken** (Early Reveal) |

### 3.3 The "Seller's Dilemma"
Why would a Seller collude?
-   **To Shill Bid?** Maybe, but uniform clearing price mitigates this.
-   **To Front-run?** If they front-run, they might get a better price *as a buyer*? But they are sellers.
-   **Alignment:** Sellers generally want the auction to be "fair and high volume". Collusion scares away buyers, lowering revenue.
-   **Conclusion:** Sellers are naturally "Checkers" on the Validators.

### 3.4 The "Scuttle Reward" (Traitor's Bounty)
To further disincentivize off-chain collusion, we introduce a high-stakes bounty mechanism.

**The Mechanism:**
If any single entity (Validator or Seller) manages to reconstruct the full secret key $S$ *before* the auction reveal time, they can claim a massive "Scuttle Reward".

**Funding Source (Atomic Insurance):**
The reward is funded by a **Security Fee** (e.g., 0.1% of auction value) charged to Sellers upon deposit *for this specific auction*.
-   **Atomic Design:** Fees do **not** accumulate between auctions. Each auction is an independent event.
-   **Payout:** If collusion occurs (early reveal) for Auction $ID$, the fees collected *for Auction $ID$* are paid to the whistleblower.
-   **Refund:** If no collusion occurs by $T_{reveal}$, the fees are **refunded** to the sellers (or burned/donated to DAO Treasury, depending on economic policy). This incentivizes participation as "honest sellers get their fee back".
-   *Note:* This ensures historical auctions do not create a "honeypot" for future ones. The bounty scales exactly with the value at risk in the current auction.

**Scuttle Consequence (The "Kill Switch"):**
If a valid Scuttle Reward claim is verified on-chain:
1.  The whistleblower receives the bounty immediately.
2.  The Auction matches enter an **Emergency Halt** state.
3.  All bids are effectively voided (since secrecy is broken).
4.  This prevents the leaked key from being used to snipe/front-run the auction in the remaining minutes.

**Economic Note (Moral Hazard):**
Current design implies Sellers' fees pay for the bounty even if *Validators* are the ones who colluded. This is a known trade-off acceptable for simplicity, viewing the fee as "Systemic Integrity Insurance".

**MEV Protection (Critical):**
To prevent bots from front-running the reward claim in the mempool (stealing the bounty without knowing the secret), the claim function **must not** accept the raw secret $S$.
-   **Requirement:** The claimer must submit a signature: $\sigma = Sign(S, ClaimerAddress)$.
-   **Verification:** The contract checks if $Verify(P_{Aggregate}, \sigma, msg.sender)$ is valid.
-   **Result:** The transaction is bound to the claimer's address. Bots cannot replay it to steal the funds.

**Game Theoretic Impact:**
-   If a cartel forms to reconstruct $S$, *every member* essentially holds a winning lottery ticket worth millions.
-   The dominant strategy is to race to claim the bounty immediately.
-   Knowing this, rational actors will refuse to reconstruct $S$ off-chain.

---

## 4. Implementation Notes

### 4.1 Key Generation (The "2-Step & Default" Flow)
**Philosophy:** Simplicity > UX Optimization.

1.  **Step 1: Deposit Phase**
    *   Sellers deposit assets. No reserve price is set yet.
    *   *Deadline passes.* Seller Set is finalized.

### 4.2 DKG Implementation Strategy (Direct Reuse)
**Decision:** We will use the existing `aptos-framework::dkg` without modification.

1.  **Current State:**
    *   `aptos-dkg` (Rust) and `dkg.move` are production-ready implementations of **BLS12-381** DKG.
2.  **Implementation Plan:**
    *   **No New Cryptography:** We do not need to write `ark-secp256k1` adapters.
    *   **Deployment:** We deploy a second instance of the DKG module (e.g., `0x1::seller_dkg`) or parameterize the existing one to handle the Seller Set.
    *   **Session Keys:** The client-side application will handle the derivation of BLS12-381 keypairs from the user's wallet signature (Metamask/Trezor). This ephemeral key is used for the DKG session.
3.  **Benefit:** Zero cryptographic development risk. We ship v1.0 with proven code.

### 4.3 Key Generation (The "2-Step & Default" Flow)

3.  **Step 3: Reserve & Bidding Phase**
    *   **Sellers:** Submit Reserve Price encrypted to **Group Key** (same as bidders).
        $$C_{Reserve} = Enc_{Validator\_BIBE}(Enc_{Group\_BLS}(R, P_{Group}))$$
    *   **Bidders:** Submit Bids encrypted to the same keys.
        $$C_{Bid} = Enc_{Validator\_BIBE}(Enc_{Group\_BLS}(B, P_{Group}))$$

**Default Condition (The UX Failsafe):**
*   If a Seller deposits but **fails** to submit a Reserve Price in Step 3:
*   The protocol treats the Reserve Price as **0 (Market Sell)**.
*   *Rationale:* This avoids "scrubbing" the auction. A lazy/disconnecting seller simply sells at market price. Client-side tooling can automate the Step 3 transaction to prevent accidental market sells.

### 4.2 Fallback
-   If <33% of sellers show up (Liveness failure), the auction mechanism should have a fallback.
-   **Timeout:** If bids are not decrypted within $X$ blocks, allow **Governance** or **Validators-Only** (with penalty) to decrypt?
-   *Decision:* **No fallback.** If <33% of sellers (by stake) act honestly, the market is broken anyway. Refund all bids. (Safety > Liveness).

---

## 5. Summary
This design meets the user's requirements:
1.  **Minimizes Collusion:** Adds a second, expensive, asset-locking layer (Sellers).
2.  **Liveness Safe:** Low (33%) threshold means "unhappy sellers can't scuttle".
3.  **Onion:** Technically sound cryptographic wrappings.
