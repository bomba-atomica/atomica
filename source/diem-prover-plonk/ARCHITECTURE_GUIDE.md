# Plonky3 Architecture Guide: STARK vs PLONK

This document clarifies the architecture of Plonky3 and explains why it's a STARK toolkit, not PLONK.

## Quick Reference

```
PLONKY3 ARCHITECTURE:

┌─────────────────────────────────────────────┐
│  What You Define: AIR (Algebraic             │
│  Intermediate Representation)                │
│                                              │
│  impl Air<AB> for MyCircuit {               │
│      fn eval(&self, builder: &mut AB) {     │
│          // Constraints go here             │
│      }                                       │
│  }                                           │
└───────────┬─────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────┐
│  What Plonky3 Does: Proves AIR with STARK   │
│                                              │
│  - Generate execution trace                 │
│  - Evaluate constraints on trace            │
│  - Compute quotient polynomial              │
│  - Commit via FRI                           │
│  - Generate STARK proof                     │
└───────────┬─────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────┐
│  Result: STARK Proof                        │
│  - ~128 KB proof size                       │
│  - Post-quantum secure                      │
│  - No trusted setup                         │
└─────────────────────────────────────────────┘
```

## PLONK vs STARK in Plonky3

### PLONK Protocol (NOT in Plonky3)

```rust
// PLONK would look like this (HYPOTHETICAL - NOT IMPLEMENTED):

impl<C> Plonk<C> for MyCircuit {
    fn setup(k: u32) -> (ProvingKey, VerifyingKey) {
        // SRS generation (trusted setup required)
        // Permutation polynomial computation
        // Lookup table setup
    }
    
    fn prove(pk: &ProvingKey, witness: &[F]) -> Proof {
        // Commit to permutation argument
        // Compute witness polynomials
        // Apply PLONK constraints
        // KZG commitments
        // Query responses
    }
}

// Key characteristics:
// - Requires trusted setup ceremony
// - Interactive protocol (multiple rounds)
// - PLONK constraints (permutation + arithmetic)
// - KZG or IPA polynomial commitments
// - Small proofs (~128 bytes)
// - Fast verification
```

### STARK Protocol (WHAT PLONKY3 HAS)

```rust
// STARK in Plonky3 looks like this (ACTUAL IMPLEMENTATION):

impl<AB: AirBuilder> Air<AB> for MyCircuit {
    fn eval(&self, builder: &mut AB) {
        // Define constraints using AIR
        let main = builder.main();
        let local = main.row_slice(0);
        let next = main.row_slice(1);
        
        // Example: state transition constraint
        builder.assert_zero(next[0] - (local[0] + 1));
    }
}

// Key characteristics:
// - Transparent (no trusted setup)
// - Non-interactive (Fiat-Shamir)
// - AIR constraints (row-based, flexible)
// - FRI polynomial commitments
// - Larger proofs (~128 KB)
// - Post-quantum secure
```

## Why The Difference Matters

### PLONK Constraint System

PLONK works with **fixed constraint types**:

```rust
// PLONK constraints are typically:
// 1. Permutation argument: σ(x) permutation
// 2. Polynomial identity: q_L(x)*a(x) + q_R(x)*b(x) + q_O(x)*c(x) + q_M(x)*a(x)*b(x) + q_C(x) = 0
// 3. Copy constraints: linking values via permutation

// The constraint structure is rigid:
pub struct PlonkGate {
    selector_left: F,
    selector_right: F,
    selector_mul: F,
    selector_out: F,
    selector_const: F,
}
```

### AIR Constraint System

AIR works with **arbitrary polynomial constraints**:

```rust
// AIR constraints can be ANY polynomial:
impl<AB: AirBuilder> Air<AB> for MyCircuit {
    fn eval(&self, builder: &mut AB) {
        let main = builder.main();
        let local = main.row_slice(0);
        let next = main.row_slice(1);
        
        // Can do complex polynomial expressions:
        let constraint = next[0] - (local[0].square() + local[1] * local[2]);
        builder.assert_zero(constraint);
        
        // Can add conditional constraints:
        builder.when(local[3]).assert_zero(next[1] - local[1]);
        
        // Much more flexible than PLONK
    }
}
```

## Proof Workflow Comparison

### PLONK Workflow (Plonky2)

```
Circuit Definition (fixed PLONK constraints)
    ↓
Setup Phase (trusted ceremony, output SRS)
    ↓
Generate Witness Polynomials
    ↓
Permutation Polynomial
    ↓
KZG Commitments (batch evaluation + proof)
    ↓
Polynomial Identity Check
    ↓
Query/Challenge Round
    ↓
Response Polynomials
    ↓
Final Verification
    ↓
SNARK Proof (~128 bytes)
```

### STARK Workflow (Plonky3)

```
AIR Definition (flexible constraints)
    ↓
Execution Trace Generation
    ↓
Constraint Evaluation
    ↓
Quotient Polynomial Computation
    ↓
FRI Folding (polynomial encoding)
    ↓
Merkle Tree Commitment
    ↓
Fiat-Shamir Challenge Round
    ↓
Query/Response Phase
    ↓
Verification Checks
    ↓
STARK Proof (~128 KB)
```

## When Would You Use Each?

### Use PLONK (Plonky2) When:

```rust
// You have traditional circuit constraints
// Example: Fixed arithmetic gates

fn verify_signature() {
    // This fits PLONK well:
    // - Fixed number of arithmetic operations
    // - Standard gate operations
    // - Need small proof size
    // - Can tolerate trusted setup
}
```

### Use STARK (Plonky3) When:

```rust
// You need flexible, program-like constraints
// Example: State machine execution

impl<AB: AirBuilder> Air<AB> for VirtualMachine {
    fn eval(&self, builder: &mut AB) {
        // VM state transitions
        // Flexible constraint structure
        // No trusted setup needed
        // Can scale to large traces
    }
}
```

## Field Arithmetic Differences

### PLONK (Plonky2) - Pairing-Based

```rust
// Uses large prime field for EVM compatibility
type F = BN254Fr;  // ~254 bits

// Pairing-friendly curve
// Slower arithmetic
// Larger field elements
// Better for commitments
```

### STARK (Plonky3) - Hash-Based

```rust
// Uses smaller fields optimized for STARK
type F = BabyBear;  // 32 bits

// Fast field arithmetic
// Optimized for FRI
// Vectorizable operations (SIMD)
// Post-quantum secure
```

## Verification Complexity

### PLONK Verification (Simple)

```rust
fn verify_plonk(proof: PlonkProof, vk: &VerifyingKey) -> bool {
    // Check polynomial commitments
    // Verify polynomial identity
    // Constant-time verification
    // ~5KB verifier circuit
}

// Result: VERY EFFICIENT on-chain
// Gas cost: ~200K-300K
// Proof size: ~128 bytes
```

### STARK Verification (Complex)

```rust
fn verify_stark(proof: StarkProof, air: &AIR) -> bool {
    // Re-compute FRI folding
    // Verify Merkle proofs
    // Check random linear combination
    // Large constraint system
}

// Result: LARGE on-chain
// Gas cost: Would need ~10M+ (impractical)
// Proof size: ~128 KB
```

## Your Implementation Strategy

Your dual-verification approach is correct:

```
┌─────────────────────────────────────────┐
│  Generate STARK Proof with Plonky3      │
│  - Transparent                          │
│  - Post-quantum secure                  │
│  - Large proof (~128 KB)                │
└──────────┬──────────────────────────────┘
           │
      ┌────┴────┐
      ▼         ▼
   Method 1: Method 2:
   Native    STARK-in-
   STARK     SNARK
   Verify    (Groth16)
   
   - Large  - Small proofs
   - Slow   - Fast verify
   - Off-chain - On-chain
```

### Why Groth16 (not PLONK)?

```rust
// Option 1: PLONK as outer SNARK
// Problem: PLONK not in Plonky3, would need to implement

// Option 2: Groth16 as outer SNARK (ACTUAL CHOICE)
// Advantages:
// ✅ Battle-tested
// ✅ Production-ready
// ✅ Arkworks compatible
// ✅ Fastest verification
// ✅ Smallest proofs

// Option 3: KZG/IPA
// Problem: Not in Plonky3, would need external crate

// Conclusion: Groth16 is pragmatic choice
```

## Code Examples

### AIR Definition (Plonky3 Way)

```rust
use p3_air::{Air, AirBuilder};

pub struct SimpleAir {
    num_rows: usize,
}

impl<AB: AirBuilder> Air<AB> for SimpleAir {
    fn eval(&self, builder: &mut AB) {
        let main = builder.main();
        
        // Row-based constraint system
        let local = main.row_slice(0);   // Current row
        let next = main.row_slice(1);    // Next row
        
        // Constraint: next[0] = local[0] + 1
        builder.assert_zero(next[0] - local[0] - AB::F::ONE);
        
        // Conditional constraint (boundary)
        builder.when(builder.is_first_row()).assert_zero(local[0]);
    }
}
```

### PLONK Definition (Hypothetical - Not in Plonky3)

```rust
// This would be the PLONK way (NOT IMPLEMENTED):
pub struct SimpleGate {
    selector: F,
    // ... other selectors
}

impl Gate for SimpleGate {
    fn evaluate(&self, vars: &EvaluationVars) -> Vec<F> {
        // PLONK constraint formula
        vec![
            vars.left * self.selector_left
                + vars.right * self.selector_right
                // ... more terms
        ]
    }
}
```

## Summary

| Aspect | PLONK (Plonky2) | STARK (Plonky3) |
|--------|-----------------|-----------------|
| **Available in Plonky3** | ❌ No | ✅ Yes |
| **Constraint Type** | Fixed gates | Flexible AIR |
| **Setup** | Trusted ceremony | None (transparent) |
| **Proof Size** | ~128 bytes | ~128 KB |
| **Verification** | Fast | Slower |
| **Post-Quantum** | ❌ No | ✅ Yes |
| **Implementation** | Plonky2 (deprecated) | Plonky3 (active) |

---

## Key Insight

**Plonky3 is intentionally designed as a STARK toolkit, not a PLONK one.** This is an architectural choice by Polygon Zero to prioritize:
- Transparency (no trusted setup)
- Modularity (AIR framework)
- Post-quantum security
- High-throughput proving

If you specifically need PLONK, you must either:
1. Use Plonky2 (deprecated but functional)
2. Implement PLONK yourself on top of Plonky3 (significant work)
3. Use a different framework

Your current approach (STARK + Groth16 wrapper) is the right pragmatic solution.
