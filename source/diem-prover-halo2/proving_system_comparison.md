# Proving System Comparison

The user requires a system that is:
1.  **Production Ready**
2.  **Cheap Verification on Ethereum**
3.  **Fast Proving Times**

Here is a comparison of the top contenders:

| Feature | **Halo2 (PSE Fork)** | **SP1 (Succinct)** | **Gnark (Consensys)** |
| :--- | :--- | :--- | :--- |
| **Language** | Rust | Rust (zkVM) | Go |
| **Production Status** | **High** (Used by Scroll, Axiom, Taiko) | **High** (Mainnet launched, widely adopted) | **Very High** (Used by Linea, StarkNet DAI bridge) |
| **EVM Verification** | **Cheap** (KZG + Solidity Verifier) | **Cheap** (Groth16 Wrapper) | **Cheap** (Groth16/Plonk) |
| **Proving Speed** | **Fastest** (Hand-optimized circuits) | **Slower** (General purpose VM overhead) | **Fast** (Highly optimized constraint system) |
| **Dev Experience** | Hard (Complex circuit engineering) | Easy (Write standard Rust) | Medium (Go-based circuit DSL) |
| **Canonical Repo?** | No (Fork of Zcash) | Yes | Yes |

| **Stwo (StarkWare)** | Rust | **High** (Live on Starknet Mainnet) | **Complex** (Requires SHARP or custom wrapper) | **Fastest** (Circle STARKs) | Hard (Low-level API or Cairo) | Yes |
| **Plonky3 (Polygon)** | Rust | **High** (Used by SP1, Valida) | **Medium** (Toolkit for building zkVMs) | **Very Fast** (Mersenne31/BabyBear) | Hard (Low-level Toolkit) | Yes |

## Analysis

### 1. Halo2 (PSE Fork)
*   **Pros**: The industry standard for high-performance ZK-EVMs. It offers the most control and speed.
*   **Cons**: It is a fork. The "canonical" Zcash repo does not support KZG/EVM natively.
*   **Production Examples (Exact Dependencies)**:
    *   **Scroll**: Uses `halo2-ce` (Community Edition), a fork of PSE Halo2 maintained by the zkEVM community.
    *   **Taiko**: Uses `halo2` (PSE fork) directly in their `raiko` prover.
    *   **Axiom**: Uses `halo2-axiom`, their own optimized fork of PSE Halo2 for faster proving.
    *   **PSE Projects**: Privacy & Scaling Explorations group at Ethereum Foundation uses this fork for almost all their projects (e.g., zk-email).
*   **Verdict**: If you need raw speed and are okay with the complexity, this is still the best choice for Rust. The "experimental" label is misleading; it secures billions in TVL.

### 2. SP1 (Succinct)
*   **Pros**: You write normal Rust code. No circuits. It handles the EVM verification wrapper for you automatically.
*   **Cons**: Proving is slower than a hand-written circuit (10x-100x overhead depending on the task), though hardware acceleration is closing the gap.
*   **Verdict**: The best "modern" choice. If your auction logic isn't extremely compute-heavy, the dev velocity gains outweigh the proving time cost.

### 3. Gnark
*   **Pros**: Rock-solid, canonical, very fast.
*   **Cons**: It's in **Go**. You would need to switch languages or use FFI.
*   **Verdict**: Excellent if you are open to Go.

### 4. Stwo (StarkWare)
*   **Pros**: **Fastest** proving times (Circle STARKs over M31 field). Live on Starknet Mainnet.
*   **Cons**: Designed primarily for the Starknet ecosystem (Cairo). Verifying custom Rust circuits on EVM is not "plug-and-play" yet; it typically requires using the Shared Prover (SHARP) service or writing a complex custom verifier wrapper.
*   **Verdict**: Too complex for a standalone Rust demo unless you are building on Starknet.

### 5. Plonky3 (Polygon)
*   **Pros**: Extremely fast, modular toolkit. It is the engine *underneath* SP1 and Valida.
*   **Cons**: It is a **toolkit**, not a high-level framework. You typically use it to build a zkVM (like SP1), not to write a simple circuit directly unless you want to implement your own constraint system from scratch.
*   **Verdict**: Great if you are building a zkVM. For an application developer, it's better to use **SP1** (which uses Plonky3 internally).

## Recommendation

**Pivot to SP1.**
*   It keeps us in **Rust**.
*   It solves the "production ready" concern (canonical repo, VC backed, mainnet).
*   It solves the "cheap verification" concern (Groth16 wrapper included).
*   It simplifies the codebase massively (no more `SimpleCircuit` boilerplate).
*   **Bonus**: It uses **Plonky3** under the hood for speed!

**Alternative**: Stick with **Halo2 (PSE)** if proving speed is the absolute #1 bottleneck (e.g., high-frequency auction clearing).
