# Decision: Use Halo2 with KZG (Axiom Fork)

**Date:** 2025-12-04
**Status:** ACCEPTED
**Decision Makers:** Core team

---

## Decision

**We will use the Halo2 proving system with the KZG commitment scheme, specifically leveraging the Axiom fork (`halo2-axiom`) and their `snark-verifier-sdk` for generating EVM verifiers.**

This decision entails:
1.  Using `halo2-axiom` as our core proving stack.
2.  Using the KZG commitment scheme (requiring a trusted setup).
3.  Using `snark-verifier-sdk` to generate Solidity verifier contracts.
4.  Adopting the "SHPLONK" accumulation scheme for proof aggregation/verification.

---

## Context

### The Need for EVM Verification

Our application requires generating zero-knowledge proofs that attest to the correctness of off-chain computations. These proofs must be verified on the Ethereum Virtual Machine (EVM) to trigger on-chain actions (settlement).

**Key Constraints:**
*   **Verification Cost**: Gas costs on Ethereum are high. The verification process must be as cheap as possible.
*   **Proof Size**: Smaller proofs are cheaper to transmit and verify.
*   **Performance**: Proving time should be reasonable to ensure a good user experience.
*   **Tooling**: We need reliable tools to generate Solidity verifiers automatically.

### The Landscape

*   **Halo2 (Zcash)**: Originally designed with Inner Product Arguments (IPA) to avoid trusted setups. Great for recursion, but IPA verification is expensive on the EVM.
*   **KZG Commitment**: A polynomial commitment scheme that offers constant-sized proofs and constant-time verification. It requires a trusted setup (Structured Reference String).
*   **Groth16**: Very small proofs and cheap verification, but requires a circuit-specific trusted setup (inconvenient for upgrades).

---

## Analysis

### Why Halo2?

Halo2 is a modern, PLONKish proving system maintained by the **Zcash team**. This provides a robust, battle-tested foundation. Axiom's fork benefits from this strong upstream source while adding EVM-specific optimizations.

It supports:
*   **Custom Gates**: Allows optimizing specific operations (like hashing or heavy arithmetic).
*   **Lookups**: efficient for range checks and bitwise operations.
*   **Flexibility**: No circuit-specific trusted setup (unlike Groth16).

### Why KZG over IPA?

**Constraint: Ethereum Precompiles.**
To achieve efficient verification on Ethereum, we must "work backward" from the available precompiles. Ethereum supports BN254 pairing checks, which enables efficient verification for **Groth16** and **KZG**.

| Feature | IPA (Original Halo2) | KZG (Our Choice) |
| :--- | :--- | :--- |
| **Trusted Setup** | Not required (Transparent) | **Required** (Universal) |
| **EVM Verification Cost** | High (Linear with circuit size) | **Low** (Constant ~200k-500k gas) |
| **Proof Size** | Large | **Small** |

**Conclusion**: Halo2 with its default Inner Product Arguments (IPA) backend is **inefficient and not recommended for Ethereum** due to high gas costs. KZG is the clear winner for EVM use cases, as it leverages pairing precompiles for cheap, constant-time verification. The requirement for a trusted setup is mitigated by using a universal setup (Powers of Tau).

### Why Axiom's Fork?

There are multiple forks of Halo2 that support KZG (PSE, Scroll, Axiom). We chose **Axiom** because:
1.  **`snark-verifier-sdk`**: Axiom provides excellent tooling for generating Solidity verifiers and managing the "native" vs "EVM" verification flows.
2.  **Performance**: They have implemented significant optimizations for proving speed.
3.  **SHPLONK**: They support the SHPLONK accumulation scheme, which further optimizes the verification process.
4.  **Audited Codebase**: The Axiom stack (including `halo2-lib`) has undergone professional security audits (e.g., by Trail of Bits), providing a higher level of assurance for production use.
5.  **Documentation & Examples**: Their repositories provide clear examples of how to bridge the gap between Rust circuits and Solidity contracts.

---

## Alternatives Considered

### Alternative 1: Original Zcash Halo2 (IPA)

**Rejected because:**
*   EVM verification is prohibitively expensive.
*   Not practical for mainnet Ethereum deployments.

### Alternative 2: Circom + Groth16

**Rejected because:**
*   **High Trust Assumptions (Per-Circuit Setup)**: Groth16 requires a trusted setup **twice**: once for the Phase 1 (Powers of Tau) and **again for Phase 2 (per circuit)**. This introduces high trust assumptions for *every single circuit update*. If the Phase 2 ceremony for a specific circuit is compromised (e.g., low participation), the security of that circuit is broken. This contrasts with the Universal Setup (used by KZG), which relies on a massive, one-time ceremony with thousands of participants (like the Hermez or Perpetual Powers of Tau), offering significantly stronger security guarantees.
*   **Operational Overhead**: Running a secure MPC ceremony for every code change is operationally infeasible for an evolving protocol.
*   **Expressivity**: While Circom is good, Halo2's PLONKish arithmetization offers more power for complex logic.

### Alternative 3: STARKs (Pure or Wrapped)

**Rejected because:**
*   **Pure STARKs**: A pure STARK verifier on Ethereum would be the "holy grail" (transparent, no trusted setup, quantum resistant). However, there is currently **no efficient, standardized EVM verifier** for modern STARK systems (like Stwo). Verification costs are typically high without massive optimization.
*   **STARK wrapped in Groth16**: A common pattern (used by some rollups) is to wrap a STARK proof inside a Groth16 SNARK to make it cheap to verify on-chain. However, this **re-introduces the downsides of Groth16**: specifically, the **per-circuit trusted setup** for the wrapper circuit.
*   **STARK wrapped in Halo2 (PLONK)**: It is theoretically possible to wrap a STARK proof inside a Halo2 circuit (which uses a universal setup). While this avoids the per-circuit setup issue, it represents a **massive engineering challenge**. We would need to implement a STARK verifier as a Halo2 circuit. This is an active area of research (e.g., Plonky2, Stwo) but is not yet a mature, "off-the-shelf" solution like the Axiom stack.

### Alternative 4: Plonky3 (with KZG)

**Rejected because:**
*   **Tooling Maturity for KZG**: While Plonky3 is a production-ready framework (audited by Least Authority), its primary focus has been on FRI-based commitments. Native KZG support is currently less mature than its FRI components.
*   **Missing EVM Verifier Generator**: Unlike Axiom's `snark-verifier-sdk`, which automatically generates a Solidity contract to verify your specific circuit, Plonky3 **does not yet have a standard, off-the-shelf tool** to generate EVM verifiers for its KZG proofs. We would likely need to build this generator ourselves or manually implement the verification logic in Solidity, which is a significant security risk and engineering burden.
*   **Comparison**: Axiom's stack is specifically optimized for this exact use case (Halo2 circuits -> EVM verification) and provides "off-the-shelf" tooling that dramatically reduces integration risk and development time.

### Alternative 5: PSE (Privacy & Scaling Explorations) Halo2 Fork

**Rejected because:**
*   While a strong contender, Axiom's `snark-verifier-sdk` offered a more streamlined developer experience for our specific goal of "Rust Circuit -> Solidity Verifier".

---

## Consequences

### Positive

1.  **Cheap Verification**: We achieve low gas costs for verifying proofs on-chain.
2.  **Universal Setup**: We can upgrade our circuits without running new trusted setup ceremonies (as long as `k` stays within the bounds of the setup we downloaded).
3.  **Developer Experience**: `snark-verifier-sdk` automates the complex task of writing EVM verifiers.

### Negative

1.  **Trusted Setup Dependency**: We rely on the security of the Hermez Powers of Tau ceremony. (Mitigated by the "1-of-N" security property and the large number of participants).
2.  **Fork Dependency**: We are tied to Axiom's maintenance of their fork. If they diverge significantly from upstream or stop maintaining it, we may need to migrate.
3.  **Complexity**: The stack (Halo2 + KZG + SHPLONK) is complex and requires deep cryptographic understanding to tune and debug.

---

## References

*   [Axiom Halo2](https://github.com/axiom-crypto/halo2)
*   [Snark Verifier SDK](https://github.com/axiom-crypto/snark-verifier)
*   [Hermez Trusted Setup](https://github.com/hermeznetwork/trusted-setup-pse-halo2)
