# Design: Timelock Trust Optimization (DEPRECATED)
> [!WARNING]
> This document is **DEPRECATED**. The designs explored here (including the "Drand Onion" and "Swiss Cheese Model") have been superseded by the **Seller-Stake DKG** architecture.
> Please refer to **[Seller-Stake DKG Design](./timelock-seller-stake-dkg.md)** for the current, active specification (v1.0).

## 1. Project Brief

**Problem Definition**
The current Atomica timelock design relies on a threshold of >2/3 validators to be honest (or at least non-colluding). While this is consistent with BFT consensus safety, the "Offline Collusion" vector presents a unique challenge:
-   A supermajority of validators could coordinate off-chain to reconstruct the decryption key early.
-   They could use this information to front-run the auction or share it with preferred bidders.
-   Unlike a double-spend or invalid state transition, this action is **cyptographically invisible** to the chain until the key is officially revealed.

**Objective**
Design a protocol enhancement that minimizes the probability and impact of validator collusion on acquiring the timelock secret early.

**Constraints**
-   **Liveness:** The auction must eventually settle. We cannot create a situation where a single malicious actor can permanently brick the auction.
-   **UX:** Bidders should not need to govern the entire process manually.
-   **Cost:** Gas costs for verification should remain linear or constant-ish.

---

## 2. Long-List of Solutions

We explore avenues to distribute the trust beyond the validator set.

### A. "Onion" Layered Encryption (Multi-Service)
**Concept:**
Encrypt the bid $B$ with multiple layers of timelock encryption from independent networks.
$C = Enc_{Val}(Enc_{Drand}(B))$

**Pros:**
-   Attackers must compromise **both** the Validator set (67%) AND the Drand League (51%).
-   Independent security assumptions (BFT vs Beacon).

**Cons:**
-   **Liveness Risk:** If *either* network fails, the bid is undecryptable. Liveness is the intersection of all probabilities ($P_{success} = P_{val} \times P_{drand}$).
-   **Complexity:** Clients must fetch public parameters from multiple sources.

### B. Participant DKG (Seller/Bidder Inclusion)
**Concept:**
The auction participants themselves (specifically Sellers, who have the most to lose from low clearing prices) participate in the decryption key generation.
-   Sellers generate a key pair and publish the public key.
-   Bids are encrypted to $K_{Val} + K_{Sellers}$.
-   Decryption requires threshold signatures from validators AND a threshold of Sellers.

**Pros:**
-   Sellers are economically aligned to prevent early reveal (it harms their revenue).
-   True decentralization of trust to the parties with "skin in the game".

**Cons:**
-   **Liveness Risk:** Sellers are not professional node operators. They might go offline, lose keys, or hold the auction hostage.
-   **Sybil Risk:** Attackers could register as fake sellers to gain key shares.

### C. Verifiable Delay Functions (VDF) Backup
**Concept:**
Encrypt the bid such that it *can* be decrypted by validators, but *also* has a VDF layer that forces a minimum sequential computation time (e.g., 20 minutes) to decrypt without the key.
$C = Enc_{Val}(VDF(B, t=20min))$

**Pros:**
-   Even if validators collude, they still have to compute the VDF.
-   If the VDF time > auction remaining time, early decryption gives no advantage.

**Cons:**
-   **ASIC Risk:** Specialized hardware might compute VDF faster than expected.
-   **UX:** Users might have to compute VDF to verify? Or validators do it?
-   **Latency:** adds a fixed delay to settlement.

### D. Hardware Enclaves (TEE/SGX)
**Concept:**
Validators must run key generation inside SGX enclaves.
**Cons:**
-   Centralized trust in Intel/Hardware vendor.
-   Side-channel attacks frequently break TEEs. Not "information theoretic" security.

### E. Optimistic "Whistleblower" Game
**Concept:**
A mechanism where any single validator (or distinct entity) who possesses the reconstructed key *early* can submit it to a smart contract for a massive reward, effectively "slashing" the colliding group.

---

## 3. Filtered Solutions (Most Promising)

Based on the constraints, we select **Solution A (Onion)** and **Solution B (Participant DKG)** as the primary candidates, but with modifications to handle liveness.

### Candidate 1: Onion Layer (Validators + Drand)
This is the most robust engineering solution. It combines two high-quality, independent networks.
-   **Refinement:** Use "Threshold of Thresholds". The bid is decryptable if (Validators && Drand) OR (Validators && VDF_backup).
-   **Recommendation:** Simple Onion. $C = Enc_{Val}(Enc_{Drand}(B))$.
    -   Requires both to collude.
    -   Liveness failure of Drand is a known risk, but acceptable given the League of Entropy's track record.

### Candidate 2: Seller-Involved DKG (The "Jury")
Sellers are the natural check on Validator power.
-   **Refinement:** We don't need *all* sellers. We verify a random subset of "Jury" members (Sellers) to hold key shares.
-   **Liveness Fix:** If the Jury refuses to sign for > $T$ hours, the Validators can bypass them (Time-delayed escape hatch).
    -   *Critique:* This re-enables validator collusion if they just wait for the timeout.
    -   *Counter:* The timeout makes the decryption *late*, destroying the front-running advantage which relies on speed.

---

## 4. Game Theoretic Mechanic: "The Traitor's Bounty"

To increase trust in the Validator Timelock specifically, we can design a mechanism that makes **collusion unstable**.

### The Mechanism
1.  **Key Generality:** The Validator DKG produces a single master secret $S$ per epoch.
2.  **Collusion Requirement:** To decrypt early, validators must exchange shares $s_i$ to reconstruct $S$.
3.  **The Bounty:** The blockchain contract has a standing offer:
    > "If anyone publishes the secret $S$ *before* the official block height $H_{reveal}$, they receive 50% of the total Validator Stake as a reward, and the remaining 50% is burned."

### The Logic (Prisoner's Dilemma)
-   If a cartel forms to reconstruct $S$ off-chain, **every single member** of that cartel now possesses $S$.
-   Any **one** of them can anonymously submit $S$ to the chain immediately.
-   The submitter collects a massive bounty (potentially millions of dollars).
-   The rest of the cartel gets slashed.

**Equilibrium:**
The moment the key is reconstructed off-chain, the dominant strategy for *every* participant is to immediately race to publish it on-chain to claim the bounty before someone else does.
Knowing this, rational validators will **refuse to reconstruct the key off-chain** because doing so creates a "race to the bottom" that guarantees their own slashing.

**Implementation Nuance:**
-   We need to ensure $S$ is verifiable *before* the reveal time.
-   *Solution:* Use a verifiable secret sharing scheme or DKG where the public key $P = G \times S$ is known. The contract verifies $G \times S_{submitted} == P$.
-   **Impact:** Offline collusion becomes financially suicidal.

---

## 5. Proposed Hybrid Architecture

We recommend a **Swiss Cheese Model**:

1.  **Layer 1:** **Validator Timelock** with **Traitor's Bounty**.
    -   Makes collusion economically irrational.
2.  **Layer 2:** **Drand Onion Encryption**.
    -   Requires compromising a totally separate network (League of Entropy).
    -   Provides defense-in-depth if Validator game theory fails.

**Final Protocol:**
`Bid_Ciphertext = Encrypt_Validator( Encrypt_Drand( Bid_Payload, Round_N ), Epoch_X )`

-   Requires Validator Key for Epoch X.
-   Requires Drand Key for Round N.
-   Validator Key protected by Slashing mechanism.
