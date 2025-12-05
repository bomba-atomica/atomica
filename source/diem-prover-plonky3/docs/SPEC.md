# Diem Prover Plonky3 Architecture Spec

## Overview

This document specifies the architecture for the `diem-prover-plonky3` system. The goal is to provide a high-performance proving system for "noop" (equality) circuits that is efficiently verifiable on Ethereum using a recursive SNARK wrapper.

## Core Components

### 1. Inner Layer: Plonky3 (STARK)
The application logic is implemented using **Plonky3**, a modular ZK proving system.
- **Circuit Logic**: "Noop" / Equality checks.
- **Field**: Mersenne31 (`M31`). This 31-bit prime field is highly optimized for modern CPU/GPU architectures.
- **Commitment Scheme**: **Circle STARKs** (FRI over the Circle Group).
    - *Why Circle STARKs?* We use the Mersenne31 field (`M31`). Since `M31`'s multiplicative group is not smooth enough for standard FFTs, we use the **Circle Group** which has a smooth order, enabling efficient FFTs and FRI.
- **Circuit Definition**: Algebraic Intermediate Representation (AIR).
- **Output**: A STARK proof.

### 2. Compression Layer: STARK-in-SNARK Wrapper
To achieve efficient on-chain verification, the STARK proof is verified recursively inside a **PLONK** SNARK circuit.

- **Outer Proof System**: **Marlin** (Universal SNARK).
    - **Outer Layer**: **Marlin** SNARK wrapper.
    - *Why Marlin?* It is the standard Arkworks Universal SNARK. It provides a **Universal Setup** (unlike Groth16), meaning the same Trusted Setup parameters can be used for any circuit.
    - *Curve*: BN254 (Ethereum compatible).
- **Trusted Setup**: **Powers of Tau** (Universal SRS).
    - We utilize the `hermez-raw-9` parameters from the Hermez ceremony.
    - These parameters are loaded to generate the Proving Key (PK) and Verifying Key (VK) for the wrapper circuit.

### 3. On-Chain Verification
- **Verifier Contract**: A Solidity smart contract (`Verifier.sol`) generated for the PLONK proof.
- **Input**: The compressed PLONK proof and public inputs.
- **Cost**: Gas efficient verification on Ethereum.

## Detailed Data Flow

1.  **Trace Generation**: The Prover executes the equality logic and generates a trace matrix (`M31`).
2.  **STARK Proving (Plonky3)**:
    - The trace is committed using FRI.
    - Constraints are checked via AIR.
    - **Output**: `StarkProof`.
3.  **Recursive / Wrapper Circuit**:
    - A PLONK circuit (over BN254) takes `StarkProof` as a private witness.
    - It implements the FRI verification logic and M31 arithmetic.
4.  **SNARK Proving (PLONK)**:
    - The Wrapper Circuit is proven using the `hermez-raw-9` Universal SRS.
    - **Output**: `PlonkProof`.
5.  **Ethereum Verification**:
    - The `PlonkProof` is submitted to the `Verifier.sol` contract.

## Implementation Roadmap

- **Phase 1**: Implement Inner Plonky3 AIR (Equality) with FRI. (Done)
- **Phase 2**: Implement PLONK Wrapper.
    - *Current Status*: Prototype uses Groth16 for stability.
    - *Next Step*: **Migrate to PLONK** to satisfy the Universal Setup requirement.
- **Phase 3**: Integrate `hermez-raw-9` Trusted Setup. (In Progress)
- **Phase 4**: Generate Solidity Verifier for PLONK.
