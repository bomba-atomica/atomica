# EVM Verification of Zero-Knowledge Proofs: Engineering Guide

## Overview

When verifying zero-knowledge proofs on Ethereum, you're working with a mix of standardized infrastructure and circuit-specific code. Understanding what's reusable versus what you need to customize is key to building efficient verifiers.

## What Ethereum Provides Out of the Box

Ethereum has **three built-in cryptographic operations** (precompiled contracts) specifically for BN254 elliptic curve operations. These have been part of the EVM since 2017:

### Precompiled Contracts

1. **ecAdd (0x06)**: Adds two elliptic curve points
   - Cost: 150 gas
   - Used to accumulate public inputs

2. **ecMul (0x07)**: Multiplies a point by a scalar
   - Cost: 6,000 gas
   - Used once per public input in your circuit

3. **ecPairing (0x08)**: The heavy-duty verification check
   - Cost: 34,000 base + 34,000 per pairing pair
   - This is where the actual proof verification happens

**Key Point**: These are the same for everyone. Tornado Cash, zkSync, Polygon zkEVM - everyone uses these exact same precompiles. They're battle-tested and optimized at the EVM level.

## What's Reusable Across All Groth16 Verifiers

### The Verification Algorithm

Groth16 has a fixed verification procedure that never changes. Every verifier needs to:

1. Validate that proof elements are valid curve points
2. Check that public inputs are in the correct field
3. Compute a linear combination of inputs with verification key points
4. Call the pairing precompile to check the proof equation

### The Assembly Code Structure

The low-level assembly that calls the precompiles is identical across projects. This is why we copied Semaphore's verifier - that assembly code for calling ecAdd, ecMul, and ecPairing is the same whether you're verifying a privacy mixer or a zkRollup.

**What this means**: You can safely reuse audited assembly from established projects. The pairing check code from Semaphore works for your circuit too.

### Proof Data Format

All Groth16 proofs on Ethereum use the same serialization:
- **Proof.A**: 2 × 32 bytes (G1 point)
- **Proof.B**: 4 × 32 bytes (G2 point with complex coordinates)
- **Proof.C**: 2 × 32 bytes (G1 point)
- **Public inputs**: array of 32-byte field elements

This standardization means proof generation tools (snarkjs, ark-groth16, etc.) all output compatible formats.

## What You Must Customize Per Circuit

### 1. Verification Key Values

Your circuit's **verification key** is unique and must be hardcoded into your Solidity contract:

```solidity
// These values come from YOUR trusted setup
uint256 constant alphax = 17027652958803034172660426276845523350810245880032351690743225964136584402038;
uint256 constant alphay = 3087919428722369092407889117846403063492345452857675249612447433392095757117;
// ... and 10+ more constants
```

**Where these come from**: When you run the trusted setup for your circuit, you get these numbers. Our `export_verifier.rs` tool extracts them from ark-groth16 and generates the Solidity constants.

### 2. IC Points Array

The number of IC (Input Commitment) points equals your number of public inputs plus one:

```solidity
// For a circuit with 2 public inputs, you need 3 IC points
uint256 constant IC0x = ...;
uint256 constant IC0y = ...;
uint256 constant IC1x = ...;
uint256 constant IC1y = ...;
uint256 constant IC2x = ...;
uint256 constant IC2y = ...;
```

**Gas impact**: More public inputs = more IC points = more ecMul operations = higher gas cost.

### 3. Input Length Validation

Each circuit expects a specific number of public inputs:

```solidity
function verifyProof(..., uint[] calldata pubSignals) external view returns (bool) {
    require(pubSignals.length == 2, "Wrong number of inputs"); // Circuit-specific!
```

### 4. Linear Combination Loop

The verifier needs to combine public inputs with IC points. The loop size depends on your circuit:

```solidity
// For 2 public inputs:
g1_mulAccC(_pVk, IC1x, IC1y, pubSignals[0])
g1_mulAccC(_pVk, IC2x, IC2y, pubSignals[1])
```

Our generator creates this code automatically based on your circuit's public input count.

## Typical Gas Costs

For reference, a standard Groth16 verification costs:

- **Base overhead**: ~150,000 gas (contract call, data loading, validation)
- **Per public input**: ~6,500 gas (one ecMul + ecAdd)
- **Pairing check**: ~270,000 gas (four pairings)

**Total for 2 public inputs**: ~280,000-300,000 gas (~$10-20 on mainnet at moderate gas prices)

## Our Implementation Strategy

We built a hybrid approach:

1. **Reuse Semaphore's assembly** for precompile calls (audited, proven code)
2. **Generate VK constants** from your circuit using Rust (`export_verifier.rs`)
3. **Template the IC loop** based on public input count

This gives you:
- Security of audited code for the critical cryptography
- Automation for the circuit-specific parameters
- No manual constant entry or error-prone copying

## Development Workflow

```bash
# 1. Generate verifier from your circuit
cargo run --bin export_verifier

# 2. Test it measures gas correctly
cargo test --test evm_verification_test -- --nocapture

# 3. Deploy to testnet/mainnet (the generated contract is in solidity/src/GeneratedVerifier.sol)
```

The generated verifier is self-contained - just deploy it like any other Solidity contract. It has no dependencies beyond the EVM's built-in precompiles.

## What Could Go Wrong

Common issues:

1. **Wrong field ordering in proof serialization**: Make sure you're using big-endian for all field elements
2. **IC array mismatch**: The number of IC points must exactly match public inputs + 1
3. **G2 coordinate ordering**: BN254 G2 points have complex coordinates that must be ordered correctly (c1, c0)

Our tooling handles all of these automatically when generating from ark-groth16 proofs.

## Bottom Line

**Standardized**: EVM precompiles, verification algorithm, proof format, assembly patterns
**Custom**: Verification key constants, IC array size, input count validation

By understanding this split, you can confidently reuse battle-tested code while still supporting your unique circuit.
