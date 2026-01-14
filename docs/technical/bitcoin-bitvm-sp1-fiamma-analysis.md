# Technical Analysis: ZK Verification on Bitcoin and Ethereum using SP1 and Fiamma

## Overview

This document summarizes the feasibility and architecture for implementing a trust-minimized auction system that bridges Ethereum state to Bitcoin and Atomica. The proposed stack utilizes **SP1** as the zero-knowledge virtual machine (zkVM) and **Fiamma** as the BitVM2 infrastructure provider.

## Core Components

### 1. SP1 zkVM (Succinct Labs)

SP1 is a high-performance RISC-V zkVM that allows developers to write ZK circuits in standard Rust.

- **Ethereum Verification:** SP1 supports the `Alloy` library, enabling the verification of Merkle Patricia Tries (MPT) and RLP decoding to prove Ethereum state (e.g., account balances, contract events) directly within the ZK proof.
- **Proof Compression:** SP1 natively supports wrapping STARK proofs into **Groth16** (BN254 curve), which is essential for low-cost verification on both Ethereum and Bitcoin.

### 2. Fiamma (BitVM2 Infrastructure)

Fiamma provides the settlement layer for Bitcoin. It implements **BitVM2**, a paradigm that enables the verification of arbitrary computation on Bitcoin through an optimistic challenge-response protocol.

- **Bitcoin Verifier:** Fiamma has implemented a production-ready Groth16 verifier in Bitcoin Script.
- **Challenge Logic:** If a prover submits an invalid state to Bitcoin, the Fiamma infrastructure allows any observer (1-of-N trust model) to challenge the proof, aborting the transaction and slashing the malicious actor.

### 3. BitVM2 Mechanism

BitVM2 is a novel protocol that allows "verification" of ZK proofs on Bitcoin without a soft fork. It works by:

1. Committing to a ZK proof (Groth16).
2. Allowing a challenge period where anyone can "snitch" on an incorrect step in the proof.
3. Aborting the transaction if the challenge is successful.

## Use Case: Cross-Chain Auction

In this architecture, the auction logic is written in Rust and executed inside SP1.

- **Ethereum Side:** The proof assertively validates that bidders have the required funds or have deposited assets on Ethereum.
- **Bitcoin Side:** The proof is used to set up an optimistic BitVM challenge. This allows the auction winner to claim BTC on-chain, provided they can produce a valid ZK proof of the auction result and the corresponding Ethereum state.

## Recommendation

This ZK system will help you prove auction validity on Ethereum assertively, will also allow you to set up a BitVM challenge optimistically on Bitcoin, and could be used to compress Ethereum state back to the Atomica chain. It is used in production by **BOB (Build on Bitcoin)**, **Mantle**, and **Babylon**; it is novel.

### Technical Justification

- **Rust-First Workflow:** By using SP1, the team can avoid domain-specific languages (DSLs) like Noir or Circom, utilizing the standard Rust toolchain for both the auction logic and Ethereum state proofs.
- **Production Provenance:** Fiamma is the leading provider of BitVM2 infrastructure, currently powering the first trust-minimized bridges between Bitcoin, Ethereum, and the Cosmos ecosystem.
- **Atomica Compression:** The ability to generate succinct Groth16 proofs makes it feasible to post compressed Ethereum state updates to the Atomica chain, significantly reducing data availability costs while maintaining full cryptographic security.
