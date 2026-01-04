# Bitcoin Integrat- [x] Pivot Proposal to Federated Multisig (Rewrite) <!-- id: 10 -->
- [x] Pivot Proposal to Federated Multisig (Rewrite) <!-- id: 10 -->
- [x] CTO Strategic Review & Risk Assessment <!-- id: 11 -->
- [x] Prior Art & Ecosystem Comparison <!-- id: 12 -->
    - [x] Refine ThorChain CPMM Analysis <!-- id: 13 -->
    - [x] Analyze ThorChain Fee Structure <!-- id: 14 -->
    - [x] Document Aggregator "Long Tail" Strategy <!-- id: 15 -->
- [x] Engineering Implementation Review <!-- id: 16 -->Custody

This document evaluates architectures for integrating Bitcoin into Atomica's cross-chain auction system.

**Executive Summary:**
After analyzing the requirements for **Multi-Unit / Fractional Auctions** (where a single selling lot is split among multiple winners), we conclude that **Federated Threshold Custody (FROST)** is the **ONLY** viable architecture for Phase 1.

Alternative approaches like Discrete Log Contracts (DLCs) are mathematically incompatible with fractional auction outcomes due to the combinatorial explosion of pre-signed transactions.

---

---

## Prior Art & Competitive Analysis

To validate our architectural choice, we evaluated existing solutions in the Bitcoin ecosystem.

### 1. ThorChain (RUNE)
*   **Architecture:** TFROST/TSS (Threshold Signature Scheme).
*   **Trust Model:** Federated Custody (Validators hold keys).
*   **Relevance:** **Direct Precedent.** ThorChain successfully processes billions in volume using essentially the same model we are proposing. It proves that the market accepts "Federated Custody" if the UX (Native Swap) is superior to wrapping.
*   **Difference:** Atomica focuses on **Auctions**, not AMM Swaps, requiring different intent matching logic.
*   **Mechanism Detail:** ThorChain nodes operate a **TSS (Threshold Signature Scheme)** vaulted on the Bitcoin network.
    1.  **Vault:** User funds are held in a massive multisig UTXO controlled by the current validator set ("Asgard").
    2.  **Native CPMM:** The "Smart Contract" logic is **integral to the blockchain consensus** (Cosmos SDK state machine), not an EVM contract.
        -   It uses standard **Constant Product Market Maker ($x*y=k$)** logic.
        -   **Implication:** It suffers from the same capital efficiency constraints (Slippage, Impermanent Loss) as Uniswap V2.
    3.  **Observation:** Validators independently observe the Bitcoin chain (running full nodes) to detect incoming deposits.
    4.  **State Machine:** When >2/3 observe a deposit, the state machine executes the CPMM math and mints/burns RUNE.
    5.  **Outbound:** The state machine instructs validators to cooperatively sign an outbound Bitcoin transaction.
    -   This is the **exact architectural blueprint** for Atomica: replace "Native CPMM Logic" with "Native Auction Logic" but key management remains identical.
*   **Fee Structure Analysis:**
    The $55M revenue figure (~0.1%) mentioned above is deceptive because it only counts *Protocol Revenue*. The effective cost to the user is significantly higher:
    1.  **Liquidity Fee (Slip-Based):** Dynamic fee paid to LPs. Minimum was raised to **15 bps** (0.15%) in 2024.
    2.  **Affiliate Fee:** Frontends (THORSwap, etc.) charge an additional **0-50 bps**.
    3.  **Outbound Fee:** Users pay ~3x gas cost for the outbound transaction.
    -   **Total effective take rate:** Roughly **20-70 bps** (0.2% - 0.7%) per swap.
    -   **Implication:** Users are willing to pay >50 bps for trust-minimized, native cross-chain settlement. Atomica's auction fees can likely command a similar premium.

### 2. tBTC (Threshold Network)
*   **Architecture:** Threshold Custody with rotating signer sets.
*   **Trust Model:** "Honest Majority" of a random subset of nodes.
*   **Relevance:** Validation of the cryptographic approach (threshold ECDSA/Schnorr).
*   **Critique:** High complexity in "random beacon" selection. Atomica simplifies this by using the entire weighted validator set (Stake weighted).

### 3. DLC.Link / 10101
*   **Architecture:** Discreet Log Contracts (DLCs).
*   **Trust Model:** Oracle Attestation (Non-Custodial).
*   **Relevance:** The path not taken. These protocols excel for **Binary Options** or **CFDs** (Alice vs Bob betting on price).
*   **Why we differ:** They cannot handle "Splitting a UTXO among 50 winners." They are constrained to 1-vs-1 financial contracts, whereas Atomica is a "Many-to-Many" auction protocol.

### 4. WBTC (BitGo)
*   **Architecture:** Single-Entity Custody.
*   **Trust Model:** "Trust BitGo."
*   **Relevance:** The baseline. Atomica is strictly superior in security (Federated vs Centralized) but matches the UX convenience.

### Summary of Landscape
| Project | Key Management | Use Case | Multi-Unit Capable? |
| :--- | :--- | :--- | :--- |
| **Atomica** | **Federated FROST** | **Auctions / RFQs** | **YES** |
| ThorChain | Federated TSS | AMM Swaps | YES |
| DLC.Link | Oracle / DLC | Derivatives (1v1) | NO |
| WBTC | Centralized | Wrapping | YES (via Mint) |

**Conclusion:** We are aligned with the successful "Native Swap" category (ThorChain/tBTC) rather than the "Derivative Contract" category (DLCs). This is the correct lane for a liquidity protocol.

---

## The Core Constraint: Multi-Unit Auctions

Atomica auctions are fundamentally **Multi-Unit**:
-   **Seller:** Alice sells **10 BTC**.
-   **Bidders:** 50 people bid for random amounts (0.1 BTC, 2.5 BTC, etc.).
-   **Outcome:** The 10 BTC is distributed to the top $N$ bidders at the clearing price.
    -   *Example:* Bob gets 3.2 BTC, Carol gets 1.8 BTC, Dave gets 5.0 BTC.

### Why DLCs Fail (The "Combinatorial Explosion")
In a DLC, the seller must **pre-sign** a transaction for every possible outcome.
-   **Single-Winner (NFT):** Outcomes = $N$ bidders. (Feasible).
-   **Multi-Unit (Split):** The "Outcomespace" is every permutation of how 10 BTC can be split among $N$ people.
    -   *Permutations:* Infinite for all practical purposes.
    -   **Result:** You cannot pre-sign the winning transaction because you don't know the split ratios until the auction ends.

**Therefore, DLCs are rejected.** They can only support "Whole Lot" (All-or-Nothing) auctions, which cripples Atomica's product utility.

---

## The Solution: Federated Threshold Custody (FROST)

We must use a **Dynamic Signing** model where the transaction is constructed *after* the auction result is known. This requires a quorum of signers to hold the funds.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Bitcoin Network                                    │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Seller Deposit UTXO                          │  │
│  │  Address: Shared Validator Key (FROST)        │  │
│  │  Script: 2/3 Multi-Sig (Schnorr Aggregated)   │  │
│  └───────────────────────────────────────────────┘  │
│         │                                           │
│         │ (After Auction)                           │
│         ▼                                           │
│  ┌───────────────────────────────────────────────┐  │
│  │  Settlement Transaction                       │  │
│  │  Input: Deposit UTXO                          │  │
│  │  Output 1: Winner A (3.2 BTC)                 │  │
│  │  Output 2: Winner B (1.8 BTC)                 │  │
│  │  Output 3: Winner C (5.0 BTC)                 │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Protocol Flow

1.  **Key Generation:** Validators run a DKG (Distributed Key Gen) protocol to create a stable Bitcoin public key. No single validator knows the private key.
2.  **Deposit:** Seller sends BTC to this address.
3.  **Auction:** Bidding happens on the Atomica chain.
4.  **Finalization:** The auction engine calculates the exact split (Who gets how much).
5.  **Signing:** Validators independently verify the result and sign the specific Settlement Transaction (splitting the UTXO).
6.  **Broadcast:** The aggregated signature is broadcast to Bitcoin.

### Trust Model

This is a **Custodial Bridge** model.

*   **Assumption:** We assume **2/3+ of the stake is honest**.
*   **Risk:** If >1/3 are malicious, they can halt the system (Liveness failure). If >2/3 are malicious, they can **steal funds** to any address.
*   **Mitigation:**
    *   **Stake Slashing:** Validators intentionally signing a fraud tx lose their Atomica stake.
    *   **ZK Audit:** The auction result is ZK-proven. Any signature that deviates from the proven result is cryptographic evidence of fraud.

---

## Evaluated Alternatives (Rejected)

| Option | Verdict | Reason for Rejection |
| :--- | :--- | :--- |
| **DLC Oracle** | **Rejected** | **Incompatible with Splits.** Only works for single-winner "All-or-Nothing" flows. O(N) setup friction is also poor. |
| **BitVM** | **Rejected** | **Not Production Ready.** Too experimental, lengthy challenge periods (7+ days). |
| **OP_CAT** | **Rejected** | **Not Active.** Requires a Bitcoin soft fork that may never happen. |

---

## CTO Strategic Review & Risk Assessment

**Role:** Chief Technology Officer
**Date:** 2026-01-04
**Subject:** Risk Acceptance for Federated Custody Model

While I agree that **Federated Custody** is the *only* technical path to support Multi-Unit Auctions, it introduces significant non-technical risks that the organization must accept.

### 1. The "Honeypot" Risk (Security)
*   **Risk:** We are aggregating user funds into a single Multisig address controlled by ~100 validators.
*   **Severity:** **Critical**. A successful collusion attack (or key leakage in 67% of validators) results in **Total Loss of Funds**.
*   **Mitigation:** We must implement "Defense in Depth" beyond just the consensus layer:
    *   **Hardware Enclaves:** Require validators to run key shares in SGX/Nitro enclaves.
    *   **Rate Limiting:** The signature aggregator should limit total outbound volume per block.

### 2. The "VASP" Risk (Regulatory)
*   **Risk:** "Validators holding keys" looks identical to a "Custodial Exchange" (CEX) or "Bridge" in the eyes of regulators (e.g., MiCA, SEC).
*   **Severity:** **High**. Validators might be classified as VASP (Virtual Asset Service Providers) and require KYC/AML compliance, effectively killing the "permissionless" nature of the protocol.
*   **Mitigation:** We must argue that no *single* entity holds the key (Threshold Cryptography). However, legal counsel validation is mandatory before mainnet.

### 3. The "Trust" Risk (Market Competitiveness)
*   **Risk:** Competitors (like ThorChain or specialized BTC L2s) are moving toward trust-minimized bridges. Launching a "Multisig Bridge" in 2026 is technically regressive.
*   **Severity:** **Medium**. Users care about liquidity and friction more than decentralization purity. If our UX (Splits + Open participation) is superior, the market will likely accept the trust trade-off.

### 4. Technical Debt Avoidance
*   **Recommendation:** We must design the `BitcoinInterface` trait such that the *Signing Backend* is swappable.
*   **Why:** When BitVM or Covenants mature, we want to swap the "FROST Signer" for a "ZK-Proof Verifier" without rewriting the auction engine.
*   **Action Item:** Ensure the `AuctionEngine` knows *nothing* about how the BTC is moved, only that "Outcome X requires Transfer Y".
    
### 5. Scalability Bottleneck (The "ThorChain Scaling Trap")
*   **The Flaw:** In the Federated Custody model, every validator must run a full node for every supported chain to verify deposits. This leads to massive hardware bloat.
*   **The Consequence:** adding new chains becomes **Permissioned** and **Slow**.
    *   *Reference:* ThorChain has only supported ~8 chains in 4+ years because of this vertical scaling limit.
*   **Risk to Atomica:** By adopting this architecture, we inherit this flaw. We will be technically unable to support the "long tail" of new L1s/L2s natively.
*   **Negative Externality:** This forces us to rely on third-party **Aggregators** (Li.Fi, Rango) for reach, leaking value and user experience control outside the protocol. This is a significant competitive disadvantage compared to lightweight "Message Bridge" protocols.

### Final Sign-off
Proceed with **Federated Custody** as the pragmatic MVP to unlock the Multi-Unit product requirement. Immediate priority is **Legal Review** of the custody model and **Security Audits** of the DKG ceremony.

---

## Engineering Implementation Review

**Role:** Lead Protocol Engineer
**Subject:** Implementation Viability & Critical Path

From an implementation perspective, "Federated Custody" is mechanically simpler than DLCs but operationally harder (distributed systems complexity).

### 1. Cryptography Stack (FROST)
*   **Library Choice:** We shouldn't roll our own. Recommendation: Use `frost-secp256k1` (identifiable aborts are crucial for slashing).
*   **Key Aggregation (Schnorr/Taproot):**
    *   **Requirement:** We **MUST** use Taproot (BIP-340).
    *   **Why:** A 2/3 FROST signature looks like a single standard Schnorr signature on-chain. This keeps fees constant ($O(1)$) regardless of whether we have 10 or 1000 validators.
    *   **Fallback:** If we used ECDSA (SegWit), we'd be limited to multisig size caps and massive fees.

### 2. The P2P Signing Layer
*   **Challenge:** Consensus blocks are too slow (1-2s) for a multi-round signing ceremony (2 rounds per signature).
*   **Solution:** We need a dedicated **P2P Gossip Subnet** effectively acting as a "Mempool" for signature shares.
*   **Timeout Handling:** If a DKG or Signing round hangs (user disconnection), we need a robust `ViewChange` protocol (similar to PBFT) to rotate the "Aggregator" role immediately.

### 3. Dust & UTXO Management
*   **Attack Vector:** "Dusting Attack" - User sends 546 satoshis to the vault.
*   **Impact:** If we spend 500 inputs to pay one winner, fees > value.
*   **Defense:**
    1.  **Minimum Deposit:** Enforce a strict minimum (e.g., 0.01 BTC) via the Observation logic. Ignore anything smaller.
    2.  **Consolidation:** The validators must periodically sign "Housekeeping" transactions to merge small UTXOs during low-fee windows.

**Engineer's Verdict:** Feasible, but the **P2P Networking** for signing shares is the "Iceberg" task everyone underestimates. Estimates need to buffer 30% for networking stability.

---

## Conclusion

To build a usable, liquidity-efficient auction protocol that supports **fractional fills**, we have no choice but to accept the trust assumptions of **Federated Custody**.

The physics of Bitcoin Script (specifically the lack of covenants) prevents us from building a trustless, dynamic-split mechanism today. We obtain **Functionality** (Splits) and **Scalability** (Open Bidding) by trading off **Trust** (Custody).
