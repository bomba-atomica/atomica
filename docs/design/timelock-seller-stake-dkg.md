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

### 2.1 The Onion Lock ("Crypto-Diversity")
We employ **Heterogeneous Cryptography** to prevent supply-chain attacks or single-curve vulnerabilities.

$$C = Enc_{Validator}(Enc_{Seller}(B))$$

1.  **Validator Layer (Outer):**
    *   **Scheme:** **Boneh-Franklin Identity-Based Encryption (BIBE)**.
    *   **Curve:** **BLS12-381** (Pairing-friendly).
    *   **Logic:** Standard timelock mechanism (see [Aptos Validator Timelock](../decisions/aptos-validator-timelock.md)) where key is derived from `auction_id`.
2.  **Seller Layer (Inner):**
    *   **Scheme:** **Threshold ECIES (Hybrid Encryption)**.
    *   **Curve:** **secp256k1** (Standard Elliptic Curve, non-pairing).
    *   **Logic:** Sellers perform DKG for $P_{Sellers}$. Payload $B$ is symmetric-encrypted (AES-GCM); key $K$ is encrypted to $P_{Sellers}$.
    *   **Benefit:** A bug in the pairing engine or a breakthrough in solving DLP on one curve family does not compromise the other. ECIES avoids DLOG decryption traps.

To decrypt:
1.  **Validators** peel the BIBE layer (BLS12-381).
2.  **Sellers** peel the ElGamal layer (secp256k1) via threshold decryption.

### 2.2 Enforced Reveal Sequence (Temporal Dependency)
**Requirement:** Information leakage from the Seller set (e.g., collusion >33%) must remain unintelligible until the Validators reveal their key.

**Mechanism:** $C = Enc_{Outer\_Validator}(Enc_{Inner\_Seller}(B))$

**Security Property:**
-   If 33% of Sellers collude at $T < T_{reveal}$, they can reconstruct the inner private key $S_{Seller}$.
-   However, they **cannot** apply this key to the ciphertext $C$ because the inner payload $Enc_{Seller}(B)$ is cryptographically obfuscated by the Outer Validator Layer.
-   The Seller Key $S_{Seller}$ is mathematically useless without the "entropy" (decryption transform) from the Validator set.
-   **Result:** The secrets remain secure even if the sellers are effectively compromised, as long as the validators are honest (and vice versa).

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

### 4.1 Key Generation
-   **Sellers:** Perform DKG during the "Deposit/Registration" phase (e.g., 6 hours before auction).
-   **Finalization:** At $T_{auction\_start}$, the Seller Set is finalized. The Aggregate Public Key $P_{Sellers}$ is published.
-   Note: This requires a *fast* DKG (e.g., simplified Feldman VSS) because churn is higher than validators.

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
