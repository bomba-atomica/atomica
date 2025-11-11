# Plonky3 Quick Reference Card

## One-Line Answer

**Q: Does Plonky3 have PLONK?**  
**A: No. Plonky3 is a STARK toolkit, not PLONK. Plonky2 was PLONK (now deprecated).**

---

## The Three Key Facts

| Fact | Details |
|------|---------|
| **What is Plonky3?** | STARK toolkit for transparent ZK proofs with AIR constraint system |
| **What is Plonky2?** | PLONK-based SNARK (deprecated, no longer maintained) |
| **What should you use?** | Plonky3 for new projects; Plonky2 only if you specifically need PLONK |

---

## STARK vs PLONK at a Glance

```
STARK (Plonky3)              PLONK (Plonky2, deprecated)
├─ Transparent               ├─ Needs trusted setup
├─ Post-quantum secure       ├─ Pairing-based (not post-quantum)
├─ Large proofs (128 KB)     ├─ Small proofs (128 bytes)
├─ AIR constraints           ├─ Fixed gates
├─ FRI commitments           ├─ KZG commitments
└─ Slow on-chain verify      └─ Fast on-chain verify
```

---

## Code Comparison

### How to Define Constraints in Plonky3 (STARK)

```rust
impl<AB: AirBuilder> Air<AB> for MyCircuit {
    fn eval(&self, builder: &mut AB) {
        let main = builder.main();
        let local = main.row_slice(0);
        let next = main.row_slice(1);
        
        // Constraint: next[0] = local[0] + 1
        builder.assert_zero(next[0] - local[0] - AB::F::ONE);
    }
}
```

### How PLONK Would Look (Plonky2, NOT in Plonky3)

```rust
// NOT IMPLEMENTED in Plonky3:
impl Gate for MyGate {
    fn evaluate(&self, vars: &EvaluationVars) -> Vec<F> {
        // PLONK fixed constraint formula
        // This approach is NOT available in Plonky3
    }
}
```

---

## Status Check List

- [x] **Plonky3 has STARK?** Yes, fully implemented
- [ ] **Plonky3 has PLONK?** No, not implemented (marked TODO)
- [ ] **Plonky3 is PLONK based?** No, it's STARK based
- [x] **Plonky2 has PLONK?** Yes, but deprecated
- [ ] **Plonky2 is maintained?** No, deprecation notice issued
- [x] **Your implementation correct?** Yes, STARK + Groth16 wrapper is right

---

## Your Implementation Summary

```
diem-prover-plonk/
├─ What it is: STARK prover (using Plonky3)
├─ Why STARK: Plonky3 is a STARK toolkit
├─ Why Groth16 wrapper: No native PLONK in Plonky3
├─ Is this correct: YES ✅
└─ Did you miss PLONK: NO, it doesn't exist ✅
```

---

## Decision Tree: Which to Use?

```
Do you need small proofs for on-chain verification?
├─ YES → Use Groth16/PLONK + circuit DSL (Circom, Noir, etc.)
│        NOT Plonky3 directly
└─ NO → Use Plonky3 (STARK)
         Benefits:
         - Transparent (no setup)
         - Post-quantum secure
         - Flexible AIR constraints
```

---

## Module Status in Plonky3

| Module | Status | What it is |
|--------|--------|-----------|
| `p3-air` | ✅ Complete | AIR constraint system trait |
| `p3-uni-stark` | ✅ Complete | STARK prover/verifier |
| `p3-fri` | ✅ Complete | FRI commitment scheme |
| `p3-lookup` | ✅ Complete | LogUp lookup argument |
| PLONK | ❌ TODO | Not implemented |

---

## Build PLONK with Plonky3?

**Question:** Can I build PLONK on top of Plonky3?

**Answer:** Theoretically yes, practically no. You would need to implement:
- PLONK permutation argument
- PLONK gate system (not AIR-compatible)
- Selector polynomials
- Copy constraints

**Bottom line:** Not a priority for Polygon Zero; use Plonky2 if you need PLONK.

---

## Timeline

```
2021-2022   Plonky2 (PLONK-based SNARK)
    ↓
2023        Plonky3 development (STARK-based toolkit)
    ↓
2023-2024   Plonky2 deprecated
    ↓
2024-Now    Plonky3 active (production in Polygon Zero)
```

---

## Key Advantages of Your Approach

Using STARK (Plonky3) + Groth16 wrapper:

```
✅ Transparent STARK generation (no ceremony)
✅ Post-quantum proof
✅ Modular constraint system (AIR)
✅ EVM-compatible verification (via Groth16)
✅ Battle-tested SNARK wrapper
```

---

## Resources

- **Plonky3 Repo:** https://github.com/Plonky3/Plonky3
- **Your Project:** `/Users/lucas/code/rust/atomica/source/diem-prover-plonk/`
- **Full Research:** `/PLONKY3_RESEARCH.md` (16 KB, comprehensive)
- **Architecture Guide:** `/ARCHITECTURE_GUIDE.md` (11 KB, technical deep-dive)

---

## TL;DR

**What:** Plonky3 is STARK, not PLONK  
**Why:** Polygon Zero chose STARKs for transparency and post-quantum security  
**You:** Already using it correctly (STARK + Groth16 wrapper)  
**Action:** None needed, your implementation is sound

---

## Questions & Answers

**Q: Did I miss native PLONK in Plonky3?**  
A: No, PLONK isn't implemented (marked TODO in README)

**Q: Should I use Groth16 or PLONK for the wrapper?**  
A: Groth16 (PLONK isn't in Plonky3, Groth16 is battle-tested)

**Q: What replaced Plonky2?**  
A: Plonky3 (different architecture, STARK-based instead of PLONK)

**Q: Can I use Plonky2 code with Plonky3?**  
A: No, they're incompatible (different proof systems)

**Q: Is Plonky3 production-ready?**  
A: Yes, used in Polygon Zero zkVM

**Q: Do I need PLONK if I'm using Plonky3?**  
A: Only if you specifically need PLONK; STARKs are better for most use cases
