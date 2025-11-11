# Plonky3 Research Summary: PLONK Support and Architecture

## Executive Summary

**What is Plonky3?**
- Plonky3 is a **modular toolkit for polynomial IOPs (PIOPs)**, primarily designed for STARK-based systems
- It is **NOT a PLONK prover** - it is a STARK toolkit
- It is the successor to Plonky2 (which was PLONK-based)
- Actively maintained by Polygon Zero and used in production systems

**Can Plonky3 be used for PLONK?**
- Theoretically: Yes, Plonky3 provides the building blocks
- Practically: The PLONK PIOP is explicitly marked as unchecked (`[ ] PLONK`) in the README
- Currently: No native PLONK support implemented
- To build PLONK with Plonky3: You would need to implement the PLONK constraint system yourself

---

## 1. Plonky3 vs Plonky2: The Fundamental Shift

### Plonky2 (Deprecated)
- **Proof System**: PLONK-based SNARK
- **Commitment Scheme**: PlonKty commitment
- **Constraint System**: PLONK protocol
- **Status**: ❌ **DEPRECATED** (no longer maintained)
- **Use Case**: General-purpose SNARK proofs
- **Curve**: BN254 (pairing-based cryptography)

### Plonky3 (Current)
- **Proof System**: STARK-based (transparency focused)
- **Commitment Scheme**: FRI (Fiat-Shamir Reduction)
- **Constraint System**: Univariate AIR (Algebraic Intermediate Representation)
- **Status**: ✅ **Active Development** (production-ready)
- **Use Case**: zkVMs, transparent proofs, high performance
- **Fields**: Baby Bear, KoalaBear, Mersenne-31, Goldilocks (no elliptic curves)

### Key Architectural Difference
```
Plonky2:                    Plonky3:
┌─────────────────┐         ┌─────────────────────┐
│ PLONK Protocol  │         │ AIR + Univariate    │
│ (Interactive)   │         │ STARK Framework     │
├─────────────────┤         ├─────────────────────┤
│ Commitment PCS  │         │ FRI Commitment      │
│ PlonKty scheme  │         │ Polynomial scheme   │
├─────────────────┤         ├─────────────────────┤
│ BN254 Curve     │         │ Hash-based fields   │
│ Pairing-based   │         │ Post-quantum secure │
└─────────────────┘         └─────────────────────┘
```

---

## 2. Plonky3 Architecture Overview

### Core Components

Plonky3 is organized as a monorepo of modular crates:

```
p3-air              - AIR trait definitions for constraint systems
p3-uni-stark        - Univariate STARK prover & verifier
p3-commit           - Polynomial commitment scheme traits
p3-fri              - FRI-based commitment implementation
p3-field            - Field arithmetic (Baby Bear, KoalaBear, etc.)
p3-matrix           - Matrix operations for traces
p3-challenger       - Fiat-Shamir randomness generation
p3-merkle-tree      - Merkle tree commitment structures
p3-dft              - Discrete Fourier Transform implementations
p3-lookup           - Lookup argument implementations (LogUp)
```

### Proof System Stack

```
┌─────────────────────────────────────────────────┐
│         AIR Definition (Your Circuit)            │
│  impl Air<AB: AirBuilder> for YourCircuit {     │
│      fn eval(&self, builder: &mut AB) { ... }  │
│  }                                              │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│      Univariate STARK Prover (p3-uni-stark)    │
│  - Constraint evaluation                        │
│  - Quotient polynomial generation               │
│  - FRI encoding                                 │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│    FRI Commitment Scheme (p3-fri)               │
│  - Polynomial commitment                        │
│  - Merkle tree folding                          │
│  - Query responses                              │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│         STARK Proof (256+ KB)                   │
│  - Committed polynomials                        │
│  - Merkle proofs                                │
│  - Query evaluations                            │
└─────────────────────────────────────────────────┘
```

---

## 3. Does Plonky3 Have Native PLONK Support?

### Status: ❌ NO (Explicitly Not Implemented)

From the official Plonky3 README:
```
PIOPs Status:
- [x] univariate STARK
- [ ] multivariate STARK
- [ ] PLONK                    <-- Unchecked, not implemented
```

### Why Plonky3 Focused on STARKs Instead of PLONK

1. **Transparency**: STARKs don't require trusted setup (PLONK does for SRS)
2. **Post-Quantum Security**: No reliance on elliptic curves
3. **Performance**: STARKs optimized for high-speed proving
4. **Modularity**: AIRs are more flexible than PLONK's single constraint system
5. **Production Use**: Aligned with zkVM requirements (Polygon Zero, Starkware)

### Could You Build PLONK with Plonky3?

**Theoretically: YES**
- Plonky3 provides the building blocks:
  - ✅ Polynomial commitment schemes (FRI PCS)
  - ✅ Field arithmetic
  - ✅ Hash functions
  - ✅ Challenge generation
  - ✅ Proof serialization

**Practically: CHALLENGING**
- Would require implementing:
  - PLONK permutation argument
  - PLONK constraint system (not AIR-compatible)
  - Selector polynomial handling
  - Copy constraints
  - Custom gates
  
- The mismatch: PLONK uses interactive polynomial proofs, Plonky3 is optimized for AIR-based univariate proofs

---

## 4. How to Use Plonky3 (The Right Way)

Plonky3 is designed to be used with the AIR framework:

### Step 1: Define Your AIR

```rust
impl<AB: AirBuilder> Air<AB> for YourAir {
    fn eval(&self, builder: &mut AB) {
        let main = builder.main();
        let local = main.row_slice(0);
        let next = main.row_slice(1);
        
        // Define constraints
        builder.assert_zero(local[0] + local[1] - next[0]);
    }
}
```

### Step 2: Generate Execution Trace

```rust
let trace = RowMajorMatrix::new(
    vec![/* row-major values */],
    num_cols
);
```

### Step 3: Prove with STARK

```rust
let config = StarkConfig::default();
let proof = prove::<BA, _, _>(&config, &your_air, &challenger, trace)?;
```

### Step 4: Verify

```rust
verify::<BA>(&config, &your_air, &challenger, &proof)?;
```

### Example from Repository

From your existing implementation (`diem-prover-plonk/host/src/eq_air.rs`):

```rust
impl<AB: AirBuilder> Air<AB> for EqualityAir {
    fn eval(&self, builder: &mut AB) {
        let main = builder.main();
        let local = main.row_slice(0);
        let a = local[0];
        let b = local[1];
        
        // Constraint: a == b (a - b == 0)
        builder.assert_zero(a - b);
    }
}
```

---

## 5. Plonky3 vs Other Proving Systems

### Comparison Matrix

| Feature | Plonky2 (PLONK) | Plonky3 (STARK) | Stwo (STARK) | Circom+Groth16 |
|---------|-----------------|-----------------|--------------|----------------|
| **Type** | SNARK (PLONK) | STARK | STARK | SNARK |
| **Status** | ❌ Deprecated | ✅ Active | ✅ Active | ✅ Maintained |
| **Setup** | Trusted | Transparent | Transparent | Trusted |
| **Post-Quantum** | ❌ No | ✅ Yes | ✅ Yes | ❌ No |
| **Proof Size** | ~128 bytes | ~128 KB | ~128 KB | ~200 bytes |
| **Proving Time** | Fast | Medium | Medium | Fast |
| **Verification** | Fast | Medium | Medium | Fast |
| **Recursion** | ✅ Good | ✅ Good | ✅ Good | ✅ Excellent |
| **Language** | Rust + Circuit | Rust AIR | Rust AIR | Circuit DSL |
| **EVM Verifier** | ✅ Easy | ⚠️ Need Wrapper | ⚠️ Need Wrapper | ✅ Native |

### When to Use Plonky3

✅ **Choose Plonky3 when you want:**
- Transparent proofs (no trusted setup)
- Post-quantum security
- High-speed proving (STARK optimizations)
- Flexibility in circuit design (AIR framework)
- No circuit compiler dependency

❌ **Don't choose Plonky3 if you want:**
- Small proof size critical (<1KB)
- Native EVM verification (without wrapper)
- Fastest verification on-chain
- PLONK-specific features

---

## 6. What You've Implemented (diem-prover-plonk)

Your current implementation correctly uses Plonky3:

```
diem-prover-plonk/
├── host/src/eq_air.rs           ← AIR definition ✅
│   └── EqualityAir implements Air<AB>
│
├── host/src/verifier/
│   ├── native_stark.rs          ← STARK verification ✅
│   └── plonk_wrapper.rs         ← STARK-in-SNARK wrapper ⚠️
│
└── Dual verification approach
    ├── Method 1: Native STARK (transparent, large proofs)
    ├── Method 2: STARK-in-Groth16 (EVM-compatible, small)
```

### Key Observations

1. **Your AIR is correct**: You've properly implemented the Plonky3 AIR framework
2. **STARK verification works**: Native Plonky3 verification is straightforward
3. **SNARK wrapper approach**: Using Groth16 (not PLONK) to wrap STARK is pragmatic
   - Groth16 is battle-tested and production-ready
   - PLONK hasn't been implemented in Plonky3
   - This gives you EVM compatibility while using STARKs

---

## 7. Did You Miss Any Native PLONK Functionality?

### Direct Answer: **NO, you didn't miss anything**

**Reasons:**
1. Plonky3 does NOT have native PLONK support
2. The PLONK PIOP is explicitly marked as "TODO" in the codebase
3. The architecture is optimized for STARKs, not PLONK
4. Using Groth16 as a wrapper is the right approach for EVM compatibility

### What Would Be Required for PLONK

If you wanted native PLONK in Plonky3, you would need:

```rust
// 1. Implement PLONK protocol traits
pub trait PlonkGates { /* ... */ }

// 2. Define constraint system (different from AIR)
pub trait PlonkConstraint { /* ... */ }

// 3. Add permutation argument
pub trait PermutationArgument { /* ... */ }

// 4. Implement custom gate system
pub trait CustomGate { /* ... */ }

// 5. Add support for lookup tables (for PLONK)
// (Already exists in p3-lookup but would need adaptation)
```

This would essentially be creating a new PLONK implementation within Plonky3, which is **not a priority** for the Polygon Zero team.

---

## 8. Plonky3 Building Blocks You Can Use

Despite no native PLONK, Plonky3 provides excellent components:

### Polynomial Commitment Schemes
- ✅ FRI-based PCS (fully implemented)
- ❌ Tensor PCS (marked TODO)
- ❌ KZG/IPA (not in scope for Plonky3)

### Constraint Systems
- ✅ Univariate STARK (fully implemented)
- ❌ Multivariate STARK (marked TODO)
- ❌ PLONK (marked TODO)

### Lookup Arguments
- ✅ LogUp lookup (fully implemented)
- Could theoretically be used for PLONK lookups

### Fields
- ✅ Baby Bear (32-bit, optimized)
- ✅ KoalaBear (32-bit, alternative)
- ✅ Mersenne-31 (31-bit)
- ✅ Goldilocks (64-bit)
- ✅ BN254 (254-bit, for EVM compatibility)

### Hash Functions
- ✅ Poseidon / Poseidon2
- ✅ BLAKE3
- ✅ Keccak-256
- ✅ Rescue

---

## 9. Relationship Between Plonky2 and Plonky3

### Timeline

```
2021-2022: Plonky2 Released (PLONK-based SNARK)
           │
           ├─ Used in production for some projects
           ├─ PLONK protocol with FRI
           ├─ BN254 field
           └─ Interactive proofs

2023: Plonky3 Development Begins (STARK-focused)
           │
           ├─ Modular architecture
           ├─ Univariate STARK framework
           ├─ Hash-based fields (post-quantum)
           └─ Transparent setup

2023-2024: Plonky2 Deprecation Notice
           │
           └─ Official recommendation to migrate to Plonky3
           └─ No longer receiving updates

2024-Present: Plonky3 Active Development
             │
             └─ Production use in Polygon Zero zkVM
             └─ Continuous performance improvements
             └─ Community ecosystem growth
```

### Why Did Polygon Zero Switch?

1. **Transparency**: STARKs are transparent (no trusted setup)
2. **Performance**: STARKs faster for high-throughput proving
3. **Modularity**: AIR framework more flexible than fixed PLONK
4. **Future-proofing**: Post-quantum security (hash-based, not pairing-based)
5. **zkVM focus**: STARKs better for VM execution proving

---

## 10. Recommendations for Your Implementation

### Current Status ✅
You have correctly identified that:
1. Plonky3 is a STARK toolkit, not PLONK
2. Using dual verification (STARK + Groth16 wrapper) is pragmatic
3. Your AIR implementation is correct for Plonky3

### Suggestions

1. **Document the distinction clearly**
   - Add comments explaining why you're using STARK + Groth16, not PLONK
   - Document that native PLONK is not available in Plonky3

2. **Consider Plonky2 if PLONK is critical**
   - If you specifically need PLONK protocol (not STARK), use Plonky2
   - Accept that it's deprecated but still functional
   - Or implement your own PLONK layer on Plonky3

3. **Leverage STARK advantages**
   - Highlight transparent setup (no trusted ceremony needed)
   - Emphasize post-quantum security
   - Showcase modular constraint system (AIRs)

4. **Plan for production**
   - STARK verification on-chain requires a verifier contract
   - Your Groth16 wrapper approach handles this well
   - Consider gas costs for different proof sizes

---

## 11. Resources and References

### Official Documentation
- **Plonky3 Repository**: https://github.com/Plonky3/Plonky3
- **Plonky3 README**: Architecture overview and status
- **CHANGELOG.md**: Active development tracking

### Papers and Protocols
- **FRI** (Fiat-Shamir Reduction): Commitment scheme used
- **STARK** (STark-friendly Transparent ARguments of Knowledge): Proof system
- **Plonky2 Original Paper**: Available in Plonky2 repo (deprecated protocol)

### Comparison Projects
- **Plonky2** (PLONK-based, deprecated): https://github.com/mir-protocol/plonky2
- **Stwo** (STARK alternative): https://github.com/starkware-libs/stwo
- **Circom** (Circuit DSL): Alternative approach

### Key Takeaway
**Plonky3 is intentionally NOT a PLONK implementation.** It's a STARK toolkit. If you need PLONK specifically, you have three options:
1. Use deprecated Plonky2
2. Implement PLONK on top of Plonky3 (non-trivial)
3. Use a different prover (Circom+Groth16, Plonk-KZG, etc.)

---

## Summary Table

| Question | Answer |
|----------|--------|
| **Does Plonky3 have PLONK?** | ❌ No, explicitly marked TODO |
| **Is Plonky3 a STARK toolkit?** | ✅ Yes, primary use case |
| **Can PLONK be built with Plonky3?** | ⚠️ Theoretically yes, practically difficult |
| **Should you use Plonky3 for PLONK?** | ❌ No, use Plonky2 or PLONK-specific prover |
| **What you implemented is correct?** | ✅ Yes, STARK + SNARK wrapper is right approach |
| **Did you miss native PLONK?** | ✅ No, it doesn't exist in Plonky3 |
| **What replaced Plonky2?** | ✅ Plonky3 (STARK-based alternative) |

