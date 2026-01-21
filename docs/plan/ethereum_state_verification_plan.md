# Ethereum State Verification Implementation Plan

## Status Summary

**Current State**: Phase 4 - Light Client Sync Protocol (In Progress)

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

### Transaction & Receipt Verification (Phase 3) - ✅ Complete
| Step | Status | Details |
|------|--------|---------|
| 1. Stub Libraries | ✅ Complete | `src/transaction.ts`, `src/receipt.ts`, types updated |
| 2. Stub Tests | ✅ Complete | `test/transaction.test.ts`, `test/receipt.test.ts` |
| 3. Transaction Logic | ✅ Complete | Client-side MPT reconstruction for Tx |
| 4. Receipt Logic | ✅ Complete | Client-side MPT reconstruction for Receipts |
| 5. CLI Update | ✅ Complete | Enhance `verify-transfer` to use new verifiers |

**Current Location**: `source/state-proofs/typescript/beacon/`
- ✅ **Phase 1-3**: Complete - State proof verification working
- 🚧 **Phase 4**: In Progress - Light Client Sync Protocol stubs created
- ✅ **Tested**: Unit tests passing (integration tests need beacon node)

## Objective
Implement cryptographic verification of Ethereum state proofs (EIP-1186) to validate that account state (balance, nonce, storage) is part of the global state trie committed in a block header. This enables trustless cross-chain state verification for bridges.

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
**Deliverables**: `verify-account` and `verify-storage` commands, fully tested.

### Phase 3: Transaction & Receipt Verification (🚧 In Progress)
**Goal**: Cryptographically prove transaction inclusion, inputs, and execution results (receipts).

This addresses Requirement 1: "Prove a transaction with inputs and mutations".

*   **Problem**: Standard JSON-RPC (`eth_getProof`) does **not** provide Merkle proofs for Transactions or Receipts.
*   **Solution**: The CLI must fetch the full block (transactions) and full receipt list, locally reconstruct the MPT, calculate the root, and match it against the block header. This proves that the Transaction/Receipt `txHash` is indeed part of the block `N`.

*   [x] **Transaction Inclusion Proof**:
    *   Implement `verifyTransactionProof(tx, blockHeader, proof)`
    *   Verify transaction matches `transactionsRoot` in block header
    *   Requires MPT verification of the Transaction Trie
    *   **Status**: Implemented & Tested (2026-01-20)
*   [x] **Receipt Inclusion Proof**:
    *   Implement `verifyReceiptProof(receipt, blockHeader, proof)`
    *   Verify receipt (logs/status) matches `receiptsRoot` in block header
    *   Proves the "mutation" or execution result
    *   **Status**: Implemented & Tested (2026-01-20)
*   [x] **CLI Update**:
    *   Enhance `verify-transfer` to include transaction and receipt proof verification
    *   **Status**: Implemented (2026-01-20)

### Phase 4: Consensus Layer & Validator Set (🚧 In Progress)
**Goal**: Trustless header verification via Light Client Sync Protocol.

This addresses Requirement 3: "Validator set change (new public keys)".

*   **Problem**: Trusting the block header `stateRoot` implies trusting the RPC.
*   **Solution**: Light Client Sync Protocol.
*   **Tech**: SSZ decoding, BLS verification.

*   [x] **Plan Document**: Created `docs/plan/light_client_plan.md`
*   [x] **Stub Libraries**: `src/beacon/types.ts`, `fetch.ts`, `sync.ts`, `state.ts`
*   [x] **Stub Tests**: `test/beacon/*.test.ts`
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

**Approach**: Standalone CLI tool with library at `source/state-proofs/typescript`

```
source/
  state-proofs/
    typescript/
      src/
        index.ts         # Public API exports (fetcher + verifier)
        types.ts         # Type definitions (AccountProof, StorageProof, etc.)
        fetcher.ts       # RPC client - fetch proofs from any Ethereum node
        verifier.ts      # High-level verification functions
        mpt.ts           # Core MPT verification logic
        cli.ts           # CLI commands and argument parsing
        transaction.ts   # Tx verification logic (Phase 3)
        receipt.ts       # Receipt verification logic (Phase 3)
      test/
        fetcher.test.ts            # Unit tests for RPC fetching
        verifier.test.ts           # Unit tests for verification logic
        mpt.test.ts                # Unit tests for MPT functions
        transaction.test.ts        # Unit tests for Tx verification
        receipt.test.ts            # Unit tests for Receipt verification
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
