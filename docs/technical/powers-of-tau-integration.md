# Powers of Tau Integration Guide

## Overview

This document explains how to use **Powers of Tau** with the dual verification system, and why PLONK would provide better integration in the future.

## Current State: Groth16

### The Challenge

**Question:** "Can we use the Powers of Tau universal key instead of generating new keys?"

**Short Answer:** With Groth16, you can use Powers of Tau as a *foundation*, but you still need circuit-specific setup.

### How Groth16 Uses Powers of Tau

```
┌─────────────────────────────────────────────┐
│  Powers of Tau (Universal Ceremony)         │
│  - Run once by community (Ethereum, Hermez) │
│  - Produces universal SRS                   │
│  - ~267 MB for degree 21                    │
└──────────────────┬──────────────────────────┘
                   │
                   ├── Used as foundation for multiple projects
                   │
    ┌──────────────┴──────────────┐
    ▼                             ▼
┌─────────────────┐     ┌─────────────────┐
│ Circuit A Setup │     │ Circuit B Setup │
│ (e.g., Tornado) │     │ (e.g., Our STARK│
│                 │     │  Verifier)      │
└─────────────────┘     └─────────────────┘
     │                       │
     ▼                       ▼
 Circuit-Specific       Circuit-Specific
 Proving Key            Proving Key
 Verifying Key          Verifying Key
```

**Key Point:** Powers of Tau reduces trust assumptions, but Groth16 **still requires circuit-specific setup**.

## Implementation Examples

### Current Demo: Fresh Keys

```rust
// For development/testing only
let mut rng = thread_rng();
let wrapper = SnarkWrapper::new(&mut rng)?;
```

This generates fresh keys without any ceremony. Fine for demos, **not for production**.

### Production: Using Powers of Tau with Groth16

```rust
// 1. Download Powers of Tau (one-time)
// From: https://github.com/privacy-scaling-explorations/perpetualpowersoftau
let pot_path = "powersOfTau28_hez_final_21.ptau";
let powers_of_tau = load_powers_of_tau(pot_path)?;

// 2. Run circuit-specific setup using PoT as foundation
let circuit = StarkVerifierCircuit::empty();
let (proving_key, verifying_key) =
    Groth16::<Bn254>::setup_with_srs(circuit, &powers_of_tau)?;

// 3. Serialize and distribute keys
let wrapper = SnarkWrapper::from_keys(proving_key, verifying_key);
let (pk_bytes, vk_bytes) = wrapper.serialize_keys()?;

std::fs::write("stark_verifier_proving.key", pk_bytes)?;
std::fs::write("stark_verifier_verifying.key", vk_bytes)?;
```

### Loading Pre-Generated Keys

```rust
// Prover loads both keys
let pk_bytes = std::fs::read("stark_verifier_proving.key")?;
let vk_bytes = std::fs::read("stark_verifier_verifying.key")?;
let wrapper = SnarkWrapper::from_serialized_keys(&pk_bytes, &vk_bytes)?;

// Now wrap STARK proofs
let wrapped = wrapper.wrap(&stark_proof)?;
```

### Verifier: Only Needs VK

```rust
// Verifier downloads only the verifying key (much smaller)
let vk_bytes = std::fs::read("stark_verifier_verifying.key")?;

use ark_serialize::CanonicalDeserialize;
let vk = VerifyingKey::<Bn254>::deserialize_compressed(&vk_bytes[..])?;

// Verify without proving key
let verifier = SnarkVerifier::new(vk);
verifier.verify(&wrapped_proof)?;
```

## Why PLONK Would Be Better

### The Difference

| Aspect | Groth16 | PLONK |
|--------|---------|-------|
| **Powers of Tau Role** | Foundation only | Direct use |
| **Circuit-Specific Setup** | Required | **Not required** |
| **Circuit Changes** | New ceremony | Use same keys |
| **Trust Assumptions** | PoT + circuit ceremony | PoT only |

### PLONK Implementation (Future)

```rust
// 1. Load Powers of Tau (one-time, same file as Groth16)
let universal_srs = load_powers_of_tau("powersOfTau28_hez_final_21.ptau")?;

// 2. Create PLONK wrapper with universal SRS
let plonk_wrapper = PlonkWrapper::new(&universal_srs)?;

// 3. Use for ANY circuit up to size limit!
let proof1 = plonk_wrapper.wrap(&stark_proof)?;

// 4. Change circuit? No problem, same SRS works!
let different_circuit = DifferentStarkVerifier::empty();
let proof2 = plonk_wrapper.wrap_different_circuit(&different_circuit)?;
```

**Key Point:** With PLONK, Powers of Tau is a **true universal setup**. Download once, use forever.

## File Sizes

### Powers of Tau Download

```
powersOfTau28_hez_final_21.ptau
- Size: ~267 MB
- Supports circuits up to 2^21 constraints
- Download once, reuse forever
```

### Groth16 Keys (Our Circuit)

```
stark_verifier_proving.key
- Size: ~50-100 MB (depends on circuit size)
- Prover needs this

stark_verifier_verifying.key
- Size: ~1-2 KB
- Verifier needs this
- Can be embedded in smart contracts
```

### PLONK Keys (Future)

```
No circuit-specific keys needed!
Just use the Powers of Tau SRS directly.
```

## Security Considerations

### Trust Model: Groth16

**Trust assumption:** At least 1 honest participant in:
1. Powers of Tau ceremony **AND**
2. Circuit-specific setup ceremony

If *both* ceremonies are compromised, proofs can be forged.

### Trust Model: PLONK

**Trust assumption:** At least 1 honest participant in:
1. Powers of Tau ceremony

If Powers of Tau is compromised, proofs can be forged. But only **one ceremony** to trust.

### Powers of Tau Ceremonies

Major ceremonies that can be used:

| Ceremony | Size | Participants | Notes |
|----------|------|--------------|-------|
| **Perpetual PoT** | 2^28 | 100+ | Community-run, ongoing |
| **Hermez PoT** | 2^28 | 100+ | Production-ready |
| **Aztec Ignition** | 2^20 | 176 | Archived |

Using a well-established ceremony significantly reduces trust assumptions.

## Migration Path

### Current (Groth16)

```rust
// Demo: Fresh keys
let wrapper = SnarkWrapper::new(&mut rng)?;

// Production: Load from ceremony
let wrapper = SnarkWrapper::from_serialized_keys(&pk_bytes, &vk_bytes)?;
```

### Future (PLONK)

```rust
// Same API, different backend
let wrapper = SnarkWrapper::from_universal_srs(&pot_srs)?;
// Or with feature flag:
#[cfg(feature = "plonk")]
let wrapper = SnarkWrapper::from_universal_srs(&pot_srs)?;

#[cfg(feature = "groth16")]
let wrapper = SnarkWrapper::from_serialized_keys(&pk_bytes, &vk_bytes)?;
```

## Recommended Workflow

### For Development

1. Use `SnarkWrapper::new(&mut rng)` for quick iteration
2. Keys are ephemeral, not production-ready
3. No ceremony needed

### For Production (Groth16)

1. **Download Powers of Tau** once
2. **Run circuit-specific setup** using PoT as foundation
3. **Conduct mini-ceremony** for your circuit (optional but recommended)
4. **Distribute verifying key** to users/contracts
5. **Keep proving key** secure for provers

### For Production (PLONK, Future)

1. **Download Powers of Tau** once
2. **Use directly** - no additional setup
3. **Distribute SRS reference** (everyone uses same file)
4. **Update circuit** without re-ceremony

## Code Examples

### Test: Key Serialization

```rust
#[test]
fn test_key_serialization_deserialization() -> Result<()> {
    let mut rng = thread_rng();

    // Generate keys
    let wrapper = SnarkWrapper::new(&mut rng)?;

    // Serialize for distribution
    let (pk_bytes, vk_bytes) = wrapper.serialize_keys()?;

    // Load on another machine
    let wrapper2 = SnarkWrapper::from_serialized_keys(&pk_bytes, &vk_bytes)?;

    // Use to verify proofs
    let verifier = SnarkVerifier::new(wrapper2.verifying_key().clone());
    Ok(())
}
```

### Test: Verifier Only Needs VK

```rust
#[test]
fn test_verifier_only_needs_vk() -> Result<()> {
    // Prover side
    let wrapper = SnarkWrapper::new(&mut rng)?;
    let wrapped_proof = wrapper.wrap(&stark_proof)?;

    // Distribute only VK (not PK)
    let (_, vk_bytes) = wrapper.serialize_keys()?;

    // Verifier side (doesn't have PK)
    let vk = VerifyingKey::deserialize_compressed(&vk_bytes[..])?;
    let verifier = SnarkVerifier::new(vk);
    verifier.verify(&wrapped_proof)?;  // Works!

    Ok(())
}
```

## Summary

### Current Reality (Groth16)

✅ **Can use Powers of Tau** as foundation
❌ **Still need circuit-specific ceremony**
✅ **Production-ready and battle-tested**
⚠️ **Each circuit needs unique keys**

### Future Goal (PLONK)

✅ **Use Powers of Tau directly**
✅ **No circuit-specific ceremony**
✅ **One setup for all circuits**
✅ **Better trust assumptions**
⏳ **Waiting on arkworks 0.4 compatibility**

### What We Built

✅ **Key serialization/deserialization** for production distribution
✅ **Separation of PK and VK** (verifiers don't need proving key)
✅ **Clear migration path** to PLONK via feature flags
✅ **Comprehensive documentation** of the differences

The architecture is **ready for Powers of Tau integration**, whether using Groth16's circuit-specific approach today or PLONK's universal approach tomorrow.

## References

- [Perpetual Powers of Tau](https://github.com/privacy-scaling-explorations/perpetualpowersoftau)
- [Hermez Powers of Tau](https://blog.hermez.io/hermez-announces-the-largest-zksnark-trusted-setup-ceremony-in-the-world/)
- [Vitalik on Trusted Setups](https://vitalik.ca/general/2022/03/14/trustedsetup.html)
- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
- [PLONK Paper](https://eprint.iacr.org/2019/953.pdf)
