# SNARK Prover Recommendation

## Executive Summary

For Atomica's auction clearing circuit, we recommend **Halo2 (with KZG commitments)**.

**Why:**
1.  **Pure SNARK**: It is a direct SNARK system (Plonkish arithmetization + KZG polynomial commitments) with no STARK components.
2.  **EVM Native**: It uses the **BN254** curve, which has precompiles on Ethereum. This allows for cheap, direct verification on-chain without complex wrappers.
3.  **Universal Setup**: It relies on the Powers of Tau (universal trusted setup), satisfying the requirement to avoid circuit-specific setups (like Groth16).
4.  **Performance**: While generally slower than STARKs on CPU, it is fast enough ("seconds") for moderately sized circuits (like auction clearing) and has excellent GPU acceleration support if needed.

## Comparison of Options

| Feature | **Halo2 (KZG)** | **Plonky2** | **Groth16** |
| :--- | :--- | :--- | :--- |
| **Type** | **Pure SNARK** | Hybrid (SNARK of STARK) | Pure SNARK |
| **Setup** | **Universal** (Trusted) | Transparent | ❌ Circuit-Specific |
| **EVM Verifier** | ✅ **Native & Cheap** | ❌ Expensive (needs wrapper) | ✅ Native & Cheapest |
| **Proving Speed** | ⚡ Fast (Seconds) | 🚀 Fastest (Milliseconds) | 🐢 Slower for large circuits |
| **Complexity** | Medium | High (Recursion/Wrapping) | Low |

### 1. Halo2 (KZG) - Recommended
- **Pros**:
    - **Direct EVM Compatibility**: The proof is natively verifiable on Ethereum using the BN254 curve. No "proof-of-proof" wrapping is required.
    - **Universal Setup**: Uses the widely available "Perpetual Powers of Tau" ceremony. No new ceremony is needed for circuit upgrades.
    - **Mature Ecosystem**: Used by major L2s (Scroll, Taiko, Axiom).
- **Cons**:
    - Slower proving than Plonky2, but acceptable for our use case.

### 2. Plonky2 (Discarded)
- **Reason**: Requires wrapping in a BN254 SNARK for efficient EVM verification. The user prefers a pure system to avoid this added complexity and potential overhead.

### 3. Groth16 (Discarded)
- **Reason**: Requires a circuit-specific trusted setup. This makes upgrades difficult and is explicitly disqualified by the "Universal Setup" requirement.

## Implementation Strategy

1.  **Library**: Use the `halo2_proofs` crate (maintained by the Privacy Scaling Explorations team) with the `halo2_kzg` backend.
2.  **Curve**: Configure the circuit to use the **BN254** (alt_bn128) curve.
3.  **Circuit Design**: Implement the auction clearing logic using Halo2's Plonkish arithmetization.
    - Use "Lookup Tables" for efficient range checks (crucial for bid sorting).
    - Use "Custom Gates" for the clearing price logic.
4.  **Verification**: Generate the solidity verifier contract directly from the Halo2 tooling.

## Conclusion

**Halo2 (KZG)** is the optimal choice for a **pure SNARK** system that requires a **universal setup** and **EVM compatibility**. It strikes the right balance between performance and architectural simplicity.
