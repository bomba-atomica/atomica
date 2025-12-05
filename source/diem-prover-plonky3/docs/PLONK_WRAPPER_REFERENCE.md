# Plonky3 in PLONK Wrapper Reference

## Canonical Example: SP1 (Succinct)

The most prominent production example of wrapping Plonky3 STARKs in a PLONK SNARK is **SP1** by Succinct Labs.

While **Polygon** develops the Plonky3 toolkit (providing the primitives for STARKs and PLONK), they do not currently provide a canonical, standalone "STARK-in-PLONK" wrapper example in their public repositories. SP1 fills this gap by demonstrating a production-grade integration.

### Architecture
1.  **Inner Layer**: Plonky3 STARKs (BabyBear/M31 fields).
2.  **Recursion**: STARK-in-STARK recursion to reduce many shard proofs into a single STARK proof.
3.  **Wrapper Layer**: The final STARK proof is wrapped in a **PLONK SNARK** (over BN254) for efficient on-chain verification.

### Implementation Details
-   **Implementation Note**: SP1 currently uses **Gnark** (Go) for the final PLONK wrapper circuit generation.
-   **Our Goal**: Since we require a pure Rust stack (avoiding Go/Gnark), we will implement the equivalent wrapper logic using a **Rust-based PLONK system** like `halo2` or `ark-plonk`.
-   **Verifier**: The `sp1-verifier` crate is in Rust and verifies the generated PLONK proof.
-   **Circuits**: The wrapper circuit can be implemented using **any Rust-based PLONK system** that supports BN254 and Universal Setup (e.g., `ark-plonk`, `halo2`, or custom implementations).
-   **Trusted Setup**: PLONK requires a Universal Setup (Powers of Tau). SP1 uses standard BN254 setups (like the Hermez or Aztec ceremonies).

### Relevance to Diem Prover
This confirms our architectural choice in `SPEC.md`:
-   **Inner**: Plonky3 (M31/BabyBear).
-   **Outer**: PLONK (BN254) with Universal Setup (`hermez-raw-9`).

### Key Differences
-   **Groth16 vs PLONK**: SP1 supports both. Groth16 is cheaper for gas (~200k) but requires a circuit-specific setup (per program). PLONK uses a Universal Setup but is slightly more expensive (~300k-500k gas) or requires a specific verifier. However, modern PLONK variants (like Halo2-KZG) are very efficient.
-   **Our Goal**: We specifically want PLONK to avoid the per-circuit trusted setup, aligning with the "Universal Setup" requirement.

### Action Plan
To implement our `SnarkWrapper` as PLONK:
1.  **Reference**: Study `sp1-verifier` and `halo2` implementations of STARK verifiers.
2.  **Tooling**: Select a PLONK backend (e.g., `ark-plonk`, `halo2`, or others) that integrates well with the Rust stack.
3.  **Gadgets**: Implement the Plonky3 Verifier (FRI, M31 arithmetic) as gadgets in the chosen PLONK system.
