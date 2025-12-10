# Design: Seller-Stake DKG Timelock (Collusion Resistance v2)

## 1. Project Brief & Pivot
**Previous Context:** The "Traitor's Bounty" mechanism (v1) was found to have critical MEV vulnerabilities.
**New Direction:** Leveraging the natural economic alignment of **Sellers** (who have inventory locked for sale) as a second layer of security.

**Core Concept:** "The Seller Check"
-   Timelocks are "Onion Encrypted": Layer 1 (Validators) + Layer 2 (Sellers).
-   Decryption requires cooperation from *both* the Validator Set (>67%) AND a subset of Sellers.
-   **Key Innovation:** We set the Seller threshold **low** (e.g., 33% by stake) to prioritize liveness while still forcing attackers to compromise two distinct groups.

---

## 2. Architecture

### 2.1 The Onion Lock ("Homogeneous v1.0")
**Decision:** For v1.0, we use **BLS12-381** for both layers to enable direct code reuse of the robust `aptos-dkg` crate.

$$C = Enc_{Validator\_BIBE}(Enc_{Seller\_BLS}(B))$$

1.  **Validator Layer (Outer):**
    *   **Scheme:** **BIBE** on BLS12-381.
    *   **Logic:** Standard validator timelock.
2.  **Seller Layer (Inner):**
    *   **Scheme:** **Threshold BLS Encryption** (ElGamal-on-G1).
    *   **Curve:** **BLS12-381** (Same as validators).
    *   **Logic:** Sellers perform DKG for $P_{Group}$ using the existing Aptos DKG protocol.
    *   **UX Note:** Since hardware wallets don't support threshold BLS, sellers generate a ephemeral "Session Key" (one-time app key) derived from their wallet signature to participate in the DKG.

**Future Roadmap (v2.0):**
*   Migration to **Heterogeneous Cryptography** (e.g., BN254 or secp256k1) is planned to eliminate single-curve failure risks.
*   For v1.0, we prioritize implementation safety (code reuse) over theoretical crypto-diversity.

To decrypt:
1.  **Validators** peel the Outer Layer.
2.  **Sellers** peel the Inner Layer via threshold decryption.

### 2.2 Key Dependency (The "Split-Key" Model)
**Requirement:** Seller Group key recovery must be **necessarily dependent** on the Validator Timelock.

**Mechanism: Functional Dependency via Onion Locking**
We treat the "Decryption Capability" as a single logical key $K_{System}$ split into two interdependent parts:
$$K_{System} \approx (K_{Validator} \oplus K_{Seller})$$

1.  **Existential Independence:** The Seller Private Key $S_{Group}$ exists mathematically independent of the Validator Key.
2.  **Functional Dependence:** However, the **utility** of $S_{Group}$ is strict time-dependent.
    *   The ciphertext $C$ is wrapped in the Validator Layer.
    *   Even if colluders reconstruct $S_{Group}$ at $T < T_{reveal}$, they lack the input ciphertext for their key.
    *   They hold a key to a door that is inside a locked vault.
    *   **Result:** Attempting to "discover the key in advance" yields a useless scalar that cannot decrypt the auction data.

*Note on PVSS:* Implementing stricter "Existential Dependency" (where $S_{Group}$ cannot even be reconstructed) would require Time-Locked Verifiable Secret Sharing (PVSS). We reject this due to high complexity and liveness risks (verifying encrypted shares). The Functional Dependency provides equivalent security for the application layer.

### 2.3 Seller Participation (The "Jury")

### 2.3 Seller Participation (The "Jury")
-   **Selection:** Any seller attempting to sell assets in the auction *must* generate a DKG key share as part of their deposit transaction.
-   **Weighting:** Shares are weighted by the USD value of the assets locked.
    -   *Rationale:* Large sellers have the most to lose if the auction reputation is destroyed by collusion.
-   **Threshold:** $t_{sellers} = 33\%$ of total stake.

---

## 3. Security & Game Theory

### 3.1 Collusion Resistance (The "Double Cabal")
To decrypt early (and front-run the auction), an attacker needs:
1.  **>67% of Validator Stake:** (Standard BFT breakdown).
2.  **PLUS >33% of Seller Stake:** The attacker must effectively "bribe" or control one-third of the assets for sale.

**Why this helps:**
-   **Independent Interest Groups:** Validators want fees. Sellers want high clearing prices. Their incentives to collude are not perfectly aligned.
-   **Increased Complexity:** Coordinating two large, distinct groups off-chain (without leaking) is exponentially harder than coordinating one.
-   **Sybil Resistance:** To become a "Seller" and gain shares, you must lock *real assets* for sale. This is an expensive way to attack (Capital Cost).

### 3.2 Liveness Analysis (The "Unhappy Seller" Defense)
**The concern:** What if Sellers withdraw or refuse to sign causing the auction to fail?

**The 33% Solution:**
-   We set the decryption threshold to just **33%** of seller stake.
-   **Meaning:** To *stop* the auction (liveness failure), a cartel of **>67%** of sellers must go offline or refuse to sign.
-   **Result:** Even if a majority (e.g., 60%) of sellers are "unhappy" or malicious/lazy, the remaining honest 40% can successfully decrypt everyone's bids.

| Scenario | Validator Threshold | Seller Threshold | Outcome |
| :--- | :--- | :--- | :--- |
| **Normal Op** | >67% Online | >33% Online | ✅ Success |
| **Validator Failure** | <67% Online | 100% Online | ❌ Fail (Chain Halt) |
| **Seller Failure** | 100% Online | <33% Online | ❌ Fail (Auction Halt) |

**Griefing Mitigation (The "Whale Penalty"):**
A single seller with >67% stake *could* theoretically block decryption by refusing to sign.
-   **Defense:** We implement **Slashing for Non-Participation**.
-   If the auction fails due to missing seller shares, any seller who failed to submit their valid share **forfeits their Security Fee** (and potentially a portion of their principal deposit, e.g., 5%).
-   This ensures that griefing is not free; it costs at least the posted security bond.
| **Early Decrypt** | **Colluding (>67%)** | Honest | ✅ **Safe** (Sellers block it) |
| **Early Decrypt** | Honest | **Colluding (>33%)** | ✅ **Safe** (Validators block it) |
| **Total Compromise** | **Colluding (>67%)** | **Colluding (>33%)** | ❌ **Broken** (Early Reveal) |

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
