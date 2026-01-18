# Trustless Cross-Chain Swap Mechanism

## Overview

Atomica ensures trustless cross-chain asset swaps without relying on custodial bridges, wrapped tokens, or trusted intermediaries. This is achieved through a **Dual-Layer Verification** system combined with **Hash Time-Locked Contracts (HTLCs)** and **Identity-Based Encryption (IBE)**.

The core philosophy is "**Fail Only**": if any part of the process fails or is malicious, atomic guarantees ensure that users simply get their funds back (refund), rather than suffering a broad loss of funds (exploit).

## Architectural Components

### 1. Dual-Layer Verification
Atomica requires two independent confirmations for every cross-chain action, preventing attack vectors where a single layer is compromised.

- **Layer 1: Consensus (BLS Threshold Signatures)**
  - **Mechanism:** The specific Atomica Validator Set (Bomba) signs the roots of events that happened on the home chain.
  - **Requirement:** A supermajority (>67% of stake) must attest to the event.
  - **Role:** Provides fast "optimistic" confirmation and liveness.

- **Layer 2: Computation (Zero-Knowledge Proofs)**
  - **Mechanism:** A ZK light client (e.g., verifying Ethereum headers on Atomica) proves that a specific event occurred on the away chain.
  - **Requirement:** Mathematical proof of inclusion in the away block header.
  - **Role:** Provides trustless correctness. Even if 100% of validators are malicious, they cannot forge a ZK proof of a non-existent away-chain transaction.

### 2. Hash Time-Locked Contracts (HTLCs)
Standard HTLCs enforce atomicity.

- **On Home Chain (Atomica):** The user/bidder locks funds conditional on knowledge of a secret `S` (where `Hash(S) = H`).
- **On Away Chain (e.g., Ethereum):** The counterparty locks funds conditional on the SAME secret hash `H`.
- **Execution:** When the secret `S` is revealed to claim funds on one chain, it becomes visible to claim funds on the other chain.
- **Fail-Safe:** If `S` is not revealed within the timeout, both parties reclaim their original funds.

### 3. Timelock Identity-Based Encryption (IBE)
To prevent "Free Option" griefing (where a counterparty sees the outcome and decides whether to proceed), Atomica uses Timelock IBE.

- **Encryption:** Bids and secrets are encrypted towards a *future timestamp* (the auction clearing time).
- **Decryption:** The network (Validators + Drand + optional Sellers) automatically generates the decryption key at that timestamp.
- **Result:** No interactive "reveal" phase is needed. The "reveal" is forced by the passage of time, preventing parties from backing out effectively.

## The Swap Lifecycle

1.  **Commit (Away Chain):** User locks USDC on Ethereum into a smart contract, specifying the Atomica auction ID.
2.  **Verify (Atomica):** Atomica validators observe the lock event via ZK proof + consensus signature.
3.  **Bid (Atomica):** User submits a sealed bid on Atomica (signature from Eth wallet mapped to Atomica account).
4.  **Clear (Atomica):** Auction clears at 12:00. Winning bids are determined.
5.  **Settlement (Atomica):**
    - Winning bidder sends Atomica tokens to User.
    - Protocol reveals the secret `S` required to unlock User's USDC on Ethereum.
6.  **Claim (Away Chain):** Winning bidder uses secret `S` to claim USDC on Ethereum.

## Failure Modes & Safety

| Scenario | Outcome | User Impact |
|----------|---------|-------------|
| **Bidder defaults** | Swap cancels | Refund (minus gas fees) |
| **Validator collusion** | ZK proof fails | Refund (safety fallback) |
| **ZK Prover failure** | Timeout expiry | Refund |
| **Bridge Hack** | N/A | Impossible (no bridge) |

## Related Documentation
- [Architecture Overview](architecture-overview.md)
- [Timelock Encryption](../design/timelock-seller-stake-dkg.md)
- [Prior Art: Bridges](../background/prior-art.md)
