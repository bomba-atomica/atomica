# Ethereum State Verification Implementation Plan

## Status Summary

**Current State**: Phase 3 - Production Hardening (Future)

### Infrastructure (Phase 1) - ✅ Complete
| Component | Status | Details |
|-----------|--------|---------|
| Docker Testnet | ✅ Complete | Geth archive mode, all 15 tests passing |
| `eth_getProof` RPC | ✅ Working | Returns accountProof + storageProof data |
| SDK `getProof()` | ✅ Implemented | Fetches proofs from RPC (`src/index.ts:131-138`) |
| Proof Structure Tests | ✅ Passing | 5 tests validate data format |

### State Proof Verifier CLI (Phase 2) - ✅ Complete
| Step | Status | Details |
|------|--------|---------|
| 1. Documentation | ✅ Complete | README.md + API.md with examples |
| 2. Stub Tests | ✅ Complete | All test files with expected behavior |
| 3. Stub Libraries | ✅ Complete | types.ts, fetcher.ts, verifier.ts, mpt.ts, index.ts |
| 4. Stub CLI | ✅ Complete | CLI commands, help system, arg parsing |
| 5. Integrate SDK | ✅ Complete | Docker testnet helper, dependencies installed |
| 6. TDD Implementation | ✅ Complete | fetcher, mpt, verifier logic implemented |
| 7. Make Tests Pass | ✅ Complete | 38/38 tests passing (unit + integration) |
| 8. GitHub Workflow | ✅ Complete | `test-state-proofs.yml` (lint, format, test) |

**Current Location**: `state-proofs/typescript/`
- ✅ **Fully Functional**: Can fetch and cryptographically verify proofs
- ✅ **Tested**: Verified against live Geth testnet
- ✅ **CI/CD**: Automated testing pipeline active
- ✅ **Type-Safe**: Strict TypeScript configuration

**Development Approach**: Self-sufficient standalone tool
- Fetches proofs from any Ethereum RPC (mainnet, testnets, local nodes)
- Verifies proofs cryptographically using MPT
- No dependency on `ethereum-docker-testnet` SDK in production code
- SDK used ONLY in integration tests to spin up local testnet

## Objective
Implement cryptographic verification of Ethereum state proofs (EIP-1186) to validate that account state (balance, nonce, storage) is part of the global state trie committed in a block header. This enables trustless cross-chain state verification for bridges.

## System Components

### 1. Docker Testnet (✅ Complete)
*   **Location**: `source/docker-testnet/ethereum-testnet`
*   **Status**: Production-ready, all tests passing
*   **Capabilities**:
    *   Geth execution layer with archive mode (`--gcmode=archive`)
    *   Lighthouse beacon + consensus layer
    *   JSON-RPC API: `eth_sendTransaction`, `eth_getProof`, `eth_getBlockByNumber`
    *   Beacon API: headers, sync committees, execution payloads
    *   4 pre-funded test accounts (1000 ETH each)

### 2. Ethereum Docker SDK (✅ Proof Fetching Complete)
*   **Location**: `source/docker-testnet/ethereum-testnet/typescript-sdk`
*   **Features**:
    *   ✅ Testnet lifecycle management (`start()`, `teardown()`, health checks)
    *   ✅ Execution layer API (blocks, balances, transactions)
    *   ✅ **Proof fetching** via `getProof(address, storageKeys, block)` - Returns raw proof data
    *   ✅ Beacon chain API (headers, sync committees, finality)
    *   ✅ Type definitions: `EthereumProof`, `StorageProof` interfaces
*   **Role**: Provides proof data source for the verification tool

### 3. State Proof Verifier CLI (✅ Complete)
*   **Location**: `state-proofs/typescript`
*   **Purpose**: **Self-sufficient** CLI tool and library for fetching AND verifying state proofs
*   **Design Philosophy**: Standalone tool that works against any Ethereum RPC (mainnet, testnets, local nodes)
*   **Dependencies**:
    *   `viem` - RPC client for fetching proofs
    *   `@ethereumjs/trie` - Merkle Patricia Trie verification
    *   `@ethereumjs/util` - Keccak-256 hashing, address utilities
    *   `@ethereumjs/rlp` - RLP encoding/decoding
*   **Capabilities**:
    *   ✅ **Fetch proofs** from any Ethereum RPC endpoint (mainnet, Infura, Alchemy, local node)
    *   ✅ **Verify account proofs** cryptographically against state roots
    *   ✅ **Verify storage proofs** against storage roots
    *   ✅ CLI commands for end-to-end proof fetching + verification
    *   ✅ Library API for programmatic use

## Verification Logic (The "How-To")

The core verification relies on **EIP-1186** (`eth_getProof`).

1.  **Trigger**: A transfer occurs from Account A to Account B in Block `N`.
2.  **Fetch Data**:
    *   Get the **Block Header** for Block `N` (contains `stateRoot`).
    *   Call `eth_getProof` for Account A or B at Block `N`.
        *   Returns: `accountProof` (array of RLP-encoded trie nodes from root to leaf).
3.  **Verify Account Proof**:
    *   Decode the `accountProof` nodes.
    *   Verify that hashing the nodes recursively leads to the `stateRoot` in the block header.
    *   Verify that the key path corresponds to the hash of the account address.
    *   Decode the leaf node (Account State: `nonce`, `balance`, `storageHash`, `codeHash`) and ensure it matches the claimed values.

## Implementation Steps

### Phase 1: Proof Fetching Infrastructure (✅ Complete)
**Deliverables**: Docker testnet + SDK that can fetch proof data from Geth

### Phase 2: Build State Proof Verifier CLI (✅ Complete)

**Location**: `state-proofs/typescript`

#### Step 1: Create Documentation (✅ Complete)
*   [x] README.md with usage examples
*   [x] API.md with library reference

#### Step 2: Stub Tests (✅ Complete)
*   [x] `fetcher.test.ts`
*   [x] `verifier.test.ts`
*   [x] `integration.test.ts`
*   [x] `mpt.test.ts`

#### Step 3: Stub Libraries (✅ Complete)
*   [x] `types.ts`
*   [x] `fetcher.ts`
*   [x] `verifier.ts`
*   [x] `mpt.ts`
*   [x] `index.ts`

#### Step 4: Stub CLI (✅ Complete)
*   [x] `cli.ts` (Command routing, argument parsing)
*   [x] `package.json` (Binary configuration)

#### Step 5: Integrate Ethereum Docker SDK (✅ Complete)
*   [x] Used as dev-dependency for integration tests
*   [x] `testnet.ts` helper for spinning up Docker environment

#### Step 6: TDD Implementation of Library (✅ Complete)
*   [x] `fetcher.ts`: Implemented `viem` RPC calls
*   [x] `mpt.ts`: Implemented RLP decoding, Keccak hashing, Hex-Prefix decoding, and recursive verification
*   [x] `verifier.ts`: Implemented account and storage proof verification logic
*   [x] `cli.ts`: Implemented `verify-account` and `verify-storage` commands

#### Step 7: Make Tests Pass (✅ Complete)
*   [x] **Unit Tests**: All MPT and Verifier logic verified
*   [x] **Integration Tests**: Successfully verifying proofs against live local Geth node
*   [x] **Edge Cases**: Verified empty accounts (non-existence proofs) and tampered proofs
*   [x] **Transaction Verification**: Successfully proved a balance update resulting from a real transaction on the testnet

#### Step 8: Create GitHub Workflow (✅ Complete)
*   [x] Created `.github/workflows/test-state-proofs.yml`
*   [x] Includes Lint, Format, and Test jobs
*   [x] Runs on every push to `state-proofs/typescript`

### Phase 3: Transaction & Receipt Verification (📋 Next Priority)
**Goal**: Cryptographically prove transaction inclusion, inputs, and execution results (receipts).

This addresses Requirement 1: "Prove a transaction with inputs and mutations".

*   [ ] **Transaction Inclusion Proof**:
    *   Implement `verifyTransactionProof(tx, blockHeader, proof)`
    *   Verify transaction matches `transactionsRoot` in block header
    *   Requires MPT verification of the Transaction Trie
*   [ ] **Receipt Inclusion Proof**:
    *   Implement `verifyReceiptProof(receipt, blockHeader, proof)`
    *   Verify receipt (logs/status) matches `receiptsRoot` in block header
    *   Proves the "mutation" or execution result
*   [ ] **CLI Update**:
    *   Enhance `verify-transfer` to include receipt proof verification (currently it verifies state effects, but not the receipt trie inclusion itself)

### Phase 4: Consensus Layer & Validator Set (📋 Future)
**Goal**: Trustless header verification via Light Client Sync Protocol.

This addresses Requirement 3: "Validator set change (new public keys)".

*   [ ] **Light Client Logic**:
    *   Implement `sync-committee` verification (Altair hardfork logic)
    *   Verify BLS signatures from current validator set
*   [ ] **Validator Set Tracking**:
    *   Fetch and verify `light_client/updates` from Beacon API
    *   Track `next_sync_committee` to know valid public keys for future periods
    *   Prove handoff from Validator Set A to Validator Set B
*   [ ] **Integration**:
    *   Replace trusted RPC block header with light-client verified header

### Phase 5: Production Hardening & Cross-Chain (📋 Future)
*   [ ] Port verifier to Rust/WASM
*   [ ] Gas optimization

## Deviations from Original Plan
1.  **Integration Testing**: Added a more comprehensive test (`should verify transaction execution and balance update`) than originally planned. This involved using `viem`'s `walletClient` to sign and send transactions from a pre-funded account, requiring derivation of the correct private key from the testnet mnemonic.
2.  **SDK Dependency**: Added a `.gitignore` to the SDK directory to prevent build artifacts from being committed, which was causing issues during local testing.
3.  **BigInt Support**: Updated `fetcher.ts` to accept `bigint` for block numbers, as `viem` transaction receipts return block numbers as `bigint`. This was not in the initial stub specification.
4.  **Retry Logic**: Added robust retry logic for `waitForTransactionReceipt` in integration tests to handle potential indexing delays in the local testnet.
5.  **Verify Transfer**: Implemented `verify-transfer` command ahead of Phase 3, enabling end-to-end transaction verification (sender/receiver state) via CLI.

## Directory Structure

**Approach**: Standalone CLI tool with library at `state-proofs/typescript`

```
state-proofs/
  typescript/
    src/
      index.ts         # Public API exports (fetcher + verifier)
      types.ts         # Type definitions (AccountProof, StorageProof, etc.)
      fetcher.ts       # RPC client - fetch proofs from any Ethereum node
      verifier.ts      # High-level verification functions
      mpt.ts           # Core MPT verification logic
      cli.ts           # CLI commands and argument parsing
    test/
      fetcher.test.ts            # Unit tests for RPC fetching
      verifier.test.ts           # Unit tests for verification logic
      mpt.test.ts                # Unit tests for MPT functions
      integration.test.ts        # Integration tests with live testnet
      helpers/
        testnet.ts               # Testnet lifecycle (uses ethereum-docker-testnet)
    docs/
      API.md                     # Detailed API documentation
      ARCHITECTURE.md            # MPT verification architecture
    package.json                 # Dependencies: viem, @ethereumjs/*
    tsconfig.json                # TypeScript configuration
    README.md                    # Usage, installation, examples
```

**Benefits of Self-Sufficient Standalone Tool**:
- **Works against any Ethereum node**: mainnet, testnet, Infura, Alchemy, local node
- **No external dependencies**: Fetches and verifies independently
- Can be published as independent npm package
- CLI provides standalone utility for developers
- Library API allows programmatic use
- **Code duplication intentional**: Self-sufficiency > DRY in this case
