# Cross-Chain Tester Specifications

## Overview
The `cross-chain-tester` is a Rust-based test suite designed to orchestrate and verify cross-chain interactions between a local Aptos testnet (Zapatos) and a local Ethereum testnet. It serves as an integration testing framework for Atomica's cross-chain capabilities.

## Goals
1.  **Orchestration**: Automatically start and stop local Aptos and Ethereum testnets.
2.  **Interaction**: Perform cryptographic signing and transaction submission on both chains using appropriate wallet standards.
3.  **Verification**: Assert the correct state changes on both chains following cross-chain operations.

## Architecture

### Components
1.  **Orchestrator**: A Rust binary/library that manages the lifecycle of the test environment.
2.  **Aptos Local Swarm**: A local instance of the Aptos blockchain, spawned using `aptos-forge` and `smoke-test` infrastructure.
3.  **Ethereum Local Testnet**: A local instance of an EVM chain, spawned using `anvil` (Foundry).
4.  **Wallet Manager**: Manages keys and signers for both chains, specifically handling Secp256k1 keys for dual-chain compatibility.

### Workflows

#### 1. Environment Setup
- **Aptos**: Use `smoke_test_environment::SwarmBuilder` to spin up a generator (validator) set.
- **Ethereum**: Spawn `anvil` process on a random or specified port.
- **Connectivity**: specificy waiting strategies to ensure both networks are ready (e.g., HTTP health checks).

#### 2. Ethereum Transaction
- **Signer**: Ethereum private key (Secp256k1).
- **Action**: Create, sign, and broadcast a transaction to the local Ethereum network.
- **Verification**: Wait for confirmation and verify receipt.

#### 3. Aptos Transaction with Ethereum Wallet
- **Signer**: Same Ethereum private key (Secp256k1).
- **Action**: Create an Aptos transaction (entry function payload).
- **Signature**: Sign the Aptos transaction hash using the Ethereum private key (ECDSA).
- **Broadcast**: Submit the signed transaction to the Aptos network using the AnySignature or specific Secp256k1 authentication scheme supported by Aptos.

## Technical Stack
- **Language**: Rust
- **Aptos Orchestration**: `aptos-forge`, `smoke-test` crate internals.
- **Ethereum Orchestration**: `ethers-rs` for client/signing, `std::process::Command` for `anvil`.
- **Crypto**: `k256` or `ethers-signers` for Secp256k1 operations.

## Structure
The test suite will be located in `source/cross-chain-tester` or integrated into `source/atomica-aptos/testsuite` depending on dependency constraints. Ideally, it should be a standalone crate in the workspace that depends on `smoke-test` and `ethers`.

## Usage
Run via cargo:
```bash
cargo test -p cross-chain-tester
```
