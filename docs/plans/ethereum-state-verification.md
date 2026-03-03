# Ethereum State Verification Implementation Plan

## Status Summary

**Current State**: Phase 7 - Live Demo (Ready)

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

### Light Client & SSZ (Phase 4-5) - ✅ Complete
| Step | Status | Details |
|------|--------|---------|
| 1. Light Client Logic | ✅ Complete | Sync committee, BLS verification, Period tracking |
| 2. SSZ Support | ✅ Complete | Full SSZ serialization with @chainsafe/ssz |
| 3. CLI Integration | ✅ Complete | `light-client-init`, `light-client-sync` commands |
| 4. Integration Tests | ✅ Complete | Unit tests passing, Integration test implemented |
| 5. Hardening | ✅ Complete | Fixed period handoff logic and committee selection |

### Live Demo (Phase 7) - 🚧 Pending
| Step | Status | Details |
|------|--------|---------|
| 1. Demo Script | ✅ Complete | Created `scripts/sepolia-demo.ts` |
| 2. Connection | 🚧 Pending | Connect to public Sepolia RPC & Beacon Node |
| 3. Transaction | 🚧 Pending | Send real Tx on Sepolia (requires private key) |
| 4. Verification | 🚧 Pending | Verify Tx/Receipt/Account using Light Client root |

**Current Location**: `source/state-proofs/typescript/`
- ✅ **Phase 1-5**: Complete - Full light client verification
- 🚧 **Phase 7**: Pending - Live Sepolia Demo
- ✅ **Tested**: Unit tests passing (99% coverage)

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

### Phase 3: Transaction & Receipt Verification (✅ Complete)
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

### Phase 3.5: Storage Proof Verification (✅ Complete)
**Goal**: Verify contract storage slots (e.g., ERC20 balances, protocol state).

*   **Logic**: `verifyStorageProof(storageProof, storageRoot, key)`
*   **Integration Test**: Deploy contract, set value, verify proof against block header.
*   **Status**: Implemented & Verified with live Docker testnet (2026-01-21)

### Phase 4: Consensus Layer & Validator Set (✅ Complete)
**Goal**: Trustless header verification via Light Client Sync Protocol.

This addresses Requirement 3: "Validator set change (new public keys)".

*   **Problem**: Trusting the block header `stateRoot` implies trusting the RPC.
*   **Solution**: Light Client Sync Protocol.
*   **Tech**: SSZ decoding, BLS verification.

*   [x] **Plan Document**: Created `docs/plans/light_client_plan.md`
*   [x] **Stub Libraries**: `src/beacon/types.ts`, `fetch.ts`, `sync.ts`, `state.ts`
*   [x] **Stub Tests**: `test/beacon/*.test.ts`
*   [x] **Light Client Logic**:
    *   Implement `sync-committee` verification (Altair hardfork logic)
    *   Verify BLS signatures from current validator set
*   [x] **Validator Set Tracking**:
    *   Fetch and verify `light_client/updates` from Beacon API
    *   Track `next_sync_committee` to know valid public keys for future periods
    *   Prove handoff from Validator Set A to Validator Set B
    *   **Fixed**: Corrected multi-period sync logic and period calculation constants
*   [x] **Integration**:
    *   Replace trusted RPC block header with light-client verified header
    *   Added `--light-client` flag to CLI

### Phase 5: SSZ Encoding/Decoding (✅ Complete)
**Goal**: Proper SSZ serialization for beacon types using `@chainsafe/ssz`.

*   [x] **Library Integration**: `@chainsafe/ssz` with Bun compatibility fixes
*   [x] **Type Definitions**: BeaconBlockHeader, LightClientHeader, SyncCommittee, etc.
*   [x] **Serialization**: `serializeSSZ`, `deserializeSSZ` functions
*   [x] **Merkleization**: `hashTreeRoot` implementation
*   [x] **Testing**: Unit tests for all SSZ types and operations

### Phase 6: Production Hardening & Cross-Chain (Skipped)
*   [x] **Performance Testing**: Benchmark verification time (BLS/SSZ benchmarks added)
*   [ ] ~~Port verifier to Rust/WASM~~ (Not required: CLI/Node.js is sufficient for offline audit tool)
*   [ ] ~~Gas optimization~~ (Not required: This is an off-chain verification tool)

### Phase 7: Live Demo (Sepolia) (✅ Ready)
**Goal**: Run a complete end-to-end verification demo on a public testnet.

*   [x] **Demo Script**: Created `scripts/sepolia-demo.ts`
*   [x] **Setup**: Added `.env.example` and documentation in README.
*   [x] **Execution**: Ready for user execution via `bun run demo:sepolia` (Requires external keys).

## Deviations from Original Plan
1.  **Integration Testing**: Added a more comprehensive test (`should verify transaction execution and balance update`) than originally planned. This involved using `viem`'s `walletClient` to sign and send transactions from a pre-funded account, requiring derivation of the correct private key from the testnet mnemonic.
2.  **SDK Dependency**: Added a `.gitignore` to the SDK directory to prevent build artifacts from being committed, which was causing issues during local testing.
3.  **BigInt Support**: Updated `fetcher.ts` to accept `bigint` for block numbers, as `viem` transaction receipts return block numbers as `bigint`. This was not in the initial stub specification.
4.  **Retry Logic**: Added robust retry logic for `waitForTransactionReceipt` in integration tests to handle potential indexing delays in the local testnet.
5.  **Verify Transfer**: Implemented `verify-transfer` command ahead of Phase 3, enabling end-to-end transaction verification (sender/receiver state) via CLI.
6.  **Storage Proof Tests**: Added full end-to-end storage proof verification with contract deployment (custom bytecode) to verify `verifyStorageProof`.

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

---

## Technical Reference: Light Client Protocol

### Architecture

```
src/
  beacon/
    types.ts          # SSZ type definitions (LightClientUpdate, SyncCommittee, etc.) - DONE
    fetch.ts          # Fetch light client updates from Beacon API - DONE
    sync.ts           # Sync committee verification logic - DONE
    state.ts          # Light client state management (current period, trusted header) - DONE
    cli.ts            # CLI integration for light client commands - DONE
  index.ts            # Export new beacon verification functions - DONE
test/
  beacon/
    types.test.ts     # SSZ type tests - DONE
    fetch.test.ts     # Beacon API fetching tests - DONE
    sync.test.ts      # BLS verification tests - DONE
    state.test.ts     # State persistence tests - DONE
    integration.test.ts # Full light client sync test - DONE
```

### Light Client State

```typescript
interface LightClientState {
  /** Most recent trusted header */
  header: LightClientHeader;
  /** Current sync committee */
  currentSyncCommittee: SyncCommittee;
  /** Next sync committee */
  nextSyncCommittee: SyncCommittee;
  /** Finalized header */
  finalizedHeader: LightClientHeader | null;
  /** Current period */
  period: number;
  /** Previous period update timestamp */
  previousSlot: number;
}

interface LightClientUpdate {
  attestedHeader: LightClientHeader;
  nextSyncCommittee: SyncCommittee;
  nextSyncCommitteeBranch: string[];
  finalizedHeader: LightClientHeader | null;
  finalityBranch: string[];
  syncAggregate: SyncAggregate;
  signatureSlot: number;
}
```

### SSZ Encoding Details (Phase 5)

**Implementation**: `@chainsafe/ssz` v0.9.4 (Bun compatible).

**Key Implementation Details**:
- Used `VectorCompositeType(BYTE_VECTOR_32, 4)` for fixed-length byte vector lists.
- Imported utility functions directly from `@chainsafe/ssz/lib/util/merkleize`.

#### Verified Functionality:
- `createSSZModule()` returns full module with all encoders.
- `serializeSSZ()` / `deserializeSSZ()` for all beacon types.
- `hashTreeRoot()` produces correct 32-byte hashes.
- `merkleize()`, `mixInLength()`, `hash()` utilities working.
- `getGeneralizedIndex()` for field indices.
- Round-trip serialization/deserialization working.
