# Ethereum State Verification Implementation Plan

## Status Summary

**Current State**: Phase 1 Complete (Proof Fetching), Starting Phase 2 (Proof Verification)

| Component | Status | Details |
|-----------|--------|---------|
| Docker Testnet | ✅ Complete | Geth archive mode, all 15 tests passing |
| `eth_getProof` RPC | ✅ Working | Returns accountProof + storageProof data |
| SDK `getProof()` | ✅ Implemented | Fetches proofs from RPC (`src/index.ts:131-138`) |
| Proof Structure Tests | ✅ Passing | 5 tests validate data format |
| **MPT Verification** | ❌ **Missing** | No cryptographic verification (see `test/state-proofs.test.ts:104`) |
| **Verifier CLI Tool** | 🚧 **Next** | New tool at `state-proofs/typescript` |

**Critical Gap**: Tests fetch proofs but don't verify them cryptographically. No `@ethereumjs` dependencies installed.

**Development Approach**: Build **self-sufficient** standalone CLI tool at `state-proofs/typescript`
- Tool will fetch proofs from any Ethereum RPC (mainnet, testnets, local nodes)
- Tool will verify proofs cryptographically using MPT
- No dependency on `ethereum-docker-testnet` SDK in production code
- SDK used ONLY in integration tests to spin up local testnet
- Code duplication with SDK is intentional for self-sufficiency

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
*   **Current Tests** (`test/state-proofs.test.ts`):
    *   ✅ Fetch proofs for funded/empty accounts
    *   ✅ Validate proof data structure (array of hex strings)
    *   ✅ Link proofs to block state roots
    *   ❌ **No cryptographic verification** - Comment line 104: "actual verification would require MPT implementation"
*   **Dependencies**: Only `dotenv` - **NO `@ethereumjs` libraries**
*   **Role**: Provides proof data source for the verification tool

### 3. State Proof Verifier CLI (🚧 New)
*   **Location**: `state-proofs/typescript`
*   **Purpose**: **Self-sufficient** CLI tool and library for fetching AND verifying state proofs
*   **Design Philosophy**: Standalone tool that works against any Ethereum RPC (mainnet, testnets, local nodes)
*   **Dependencies**:
    *   `viem` or `ethers` - RPC client for fetching proofs from any Ethereum node
    *   `@ethereumjs/trie` - Merkle Patricia Trie verification
    *   `@ethereumjs/util` - Keccak-256 hashing, address utilities
    *   `@ethereumjs/rlp` - RLP encoding/decoding
*   **Dev Dependencies** (testing only):
    *   `ethereum-docker-testnet` - Used ONLY in integration tests to spin up local testnet
*   **Capabilities**:
    *   **Fetch proofs** from any Ethereum RPC endpoint (mainnet, Infura, Alchemy, local node)
    *   **Verify account proofs** cryptographically against state roots
    *   **Verify storage proofs** against storage roots
    *   CLI commands for end-to-end proof fetching + verification
    *   Library API for programmatic use
*   **Note**: Proof fetching code will be duplicated from `ethereum-docker-testnet` SDK - this is intentional for self-sufficiency

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

**Completed Components**:
*   [x] **Docker Testnet**: Geth execution layer with `--gcmode=archive`
    *   `eth_getProof` RPC endpoint enabled and tested
    *   Lighthouse beacon node for consensus data
    *   All 15 integration tests passing (verified 2026-01-20)
*   [x] **TypeScript SDK** (`source/docker-testnet/ethereum-testnet/typescript-sdk`):
    *   `getProof(address, storageKeys, block)` method implemented (line 131-138)
    *   Returns `EthereumProof` with `accountProof` and `storageProof` arrays
    *   Type definitions for proof structures (line 416-430)
*   [x] **Structure Validation Tests** (`test/state-proofs.test.ts`):
    *   5 tests verify proof data format
    *   Tests confirm proofs are RLP-encoded hex strings
    *   Tests link proofs to block state roots

**What's NOT included**:
*   ❌ No cryptographic MPT verification
*   ❌ No `@ethereumjs` dependencies installed
*   ❌ Comment on line 104: "actual verification would require MPT implementation"

### Phase 2: Build State Proof Verifier CLI (🚧 In Progress)

**Location**: `state-proofs/typescript`

**Development Process**: Test-Driven Development (TDD)

#### Step 1: Create Documentation (📝 First)
*   [ ] Create `state-proofs/typescript/README.md`:
    *   Overview of MPT verification
    *   Installation instructions
    *   CLI usage examples
    *   Library API documentation
    *   Architecture diagram
*   [ ] Create `state-proofs/typescript/docs/API.md`:
    *   Detailed API reference for library functions
    *   Type definitions
    *   Examples for each function

#### Step 2: Stub Tests (✅ Define Interface)
*   [ ] Create `state-proofs/typescript/test/fetcher.test.ts`:
    *   Test suite: "Proof Fetching"
        *   `should fetch account proof from RPC endpoint`
        *   `should fetch block header with state root`
        *   `should handle RPC errors gracefully`
        *   `should work with different block identifiers (latest, finalized, number)`
*   [ ] Create `state-proofs/typescript/test/verifier.test.ts`:
    *   Test suite: "Account Proof Verification"
        *   `should verify valid account proof against state root`
        *   `should reject proof with tampered nodes`
        *   `should reject proof with wrong state root`
        *   `should decode account state from proof`
    *   Test suite: "Storage Proof Verification"
        *   `should verify valid storage proof`
        *   `should handle empty storage slots`
*   [ ] Create `state-proofs/typescript/test/integration.test.ts`:
    *   Test suite: "End-to-End Verification"
        *   `should fetch and verify account proof from live testnet`
        *   `should verify transfer affects account state`
        *   `should work with mainnet RPC (optional, may be slow)`

#### Step 3: Stub Libraries (🏗️ Define API)
*   [ ] Create `state-proofs/typescript/src/types.ts`:
    *   `AccountProof`, `StorageProof`, `AccountState` types
    *   `VerificationResult` interface
    *   `EthereumProof` (may duplicate SDK type - intentional)
*   [ ] Create `state-proofs/typescript/src/fetcher.ts`:
    *   `fetchProof(rpcUrl, address, storageKeys, block): Promise<EthereumProof>`
    *   `fetchBlock(rpcUrl, blockNumber): Promise<Block>`
    *   Uses `viem` or `ethers` for RPC calls
*   [ ] Create `state-proofs/typescript/src/verifier.ts`:
    *   `verifyAccountProof(proof, stateRoot, address): Promise<VerificationResult>`
    *   `verifyStorageProof(proof, storageRoot, key): Promise<VerificationResult>`
    *   `decodeAccountState(accountProof): AccountState`
*   [ ] Create `state-proofs/typescript/src/mpt.ts`:
    *   `verifyMerkleProof(proof, root, key, value): boolean`
    *   `hashNode(node): Buffer`
    *   `decodeNode(rlpNode): Node`

#### Step 4: Stub CLI (🖥️ Define Commands)
*   [ ] Create `state-proofs/typescript/src/cli.ts`:
    *   Command: `verify-account <address> <block> --rpc <url>`
        *   Fetches proof from RPC endpoint
        *   Fetches block header for state root
        *   Verifies proof cryptographically
        *   Outputs verification result + decoded account state
    *   Command: `verify-storage <address> <slot> <block> --rpc <url>`
        *   Fetches storage proof
        *   Verifies against storage root
    *   Command: `verify-transfer <txHash> --rpc <url>`
        *   Fetches transaction and receipt
        *   Verifies sender/receiver account states
    *   Options:
        *   `--rpc <url>` - Ethereum RPC endpoint (mainnet, Infura, local node)
        *   `--json` - Output as JSON
        *   `--verbose` - Show detailed verification steps
    *   Output: Formatted table or JSON with verification result
*   [ ] Create `state-proofs/typescript/package.json`:
    *   Binary: `eth-verify`
    *   Scripts: `build`, `test`, `lint`
    *   Dependencies: `viem`, `@ethereumjs/trie`, `@ethereumjs/util`, `@ethereumjs/rlp`
    *   DevDependencies: `ethereum-docker-testnet` (for testing only)

#### Step 5: Integrate Ethereum Docker SDK (🔗 Testing Infrastructure Only)
*   [ ] Add **dev dependency** in `package.json`:
    *   `devDependencies: { "ethereum-docker-testnet": "file:../../source/docker-testnet/ethereum-testnet/typescript-sdk" }`
    *   **Note**: Used ONLY in tests, NOT in production code
*   [ ] Create `test/helpers/testnet.ts`:
    *   Helper to start/stop Docker testnet for integration tests
    *   Helper to get test accounts and RPC URL
    *   Returns local RPC endpoint (http://localhost:8545)
*   [ ] Update integration tests to use Docker testnet:
    *   `beforeAll`: Start testnet via SDK
    *   Test proof fetching: Use `fetchProof()` against local RPC (NOT SDK's `getProof()`)
    *   Test verification: Verify proofs fetched from local testnet
    *   `afterAll`: Teardown testnet
*   [ ] **Important**: Production code (`src/fetcher.ts`) uses `viem`/`ethers` directly, NOT the SDK

#### Step 6: TDD Implementation of Library (🧪 Red-Green-Refactor)
*   [ ] Install dependencies:
    *   `viem@^2.0.0` (or `ethers@^6.0.0`) - RPC client
    *   `@ethereumjs/trie@^6.0.0`
    *   `@ethereumjs/util@^9.0.0`
    *   `@ethereumjs/rlp@^5.0.0`
    *   `@ethereumjs/common@^4.0.0`
*   [ ] Implement `src/fetcher.ts` (RPC calls):
    *   `fetchProof()` - Call `eth_getProof` on any RPC endpoint
    *   `fetchBlock()` - Get block header with state root
    *   Handle RPC errors and retries
    *   Works with any Ethereum node (mainnet, testnet, local)
*   [ ] Implement `src/mpt.ts` (MPT core):
    *   RLP decode proof nodes
    *   Recursive hash verification
    *   Key path validation (Keccak256 of address)
*   [ ] Implement `src/verifier.ts`:
    *   Account proof verification logic
    *   Storage proof verification logic
    *   Account state decoding (RLP → nonce, balance, storageHash, codeHash)
*   [ ] Implement `src/index.ts`:
    *   Export all public API (fetcher + verifier)
    *   Re-export types

#### Step 7: Make Tests Pass (✅ Green)
*   [ ] Run tests iteratively: `bun test --watch`
*   [ ] Fix implementation until all unit tests pass
*   [ ] Fix integration tests against live testnet
*   [ ] Add edge case tests:
    *   Empty accounts (non-existent addresses)
    *   Zero-balance accounts
    *   Contract accounts vs EOAs
    *   Very deep trie paths

#### Step 8: Create GitHub Workflow (🚀 CI/CD)
*   [ ] Create `.github/workflows/test-state-proofs.yml`:
    *   Job: Build and test verifier
    *   Job: Integration tests with Docker testnet
    *   Matrix: Test on Node 18, 20, 22
*   [ ] Add workflow triggers:
    *   `push` to `main` branch
    *   `pull_request` affecting `state-proofs/typescript/**`
*   [ ] Add status badge to README

### Phase 3: Production Hardening (⏳ Future)
*   [ ] Add CLI features:
    *   Batch verification
    *   JSON output mode
    *   Verbose/debug logging
*   [ ] Performance optimization:
    *   Benchmark verification time
    *   Profile memory usage
*   [ ] Documentation:
    *   Tutorial: Verifying a real transaction
    *   Tutorial: Building a custom verifier
    *   Blog post: Understanding Ethereum state proofs

### Phase 4: Cross-Chain Integration (📋 Future)
*   [ ] Port verifier to Rust for on-chain use
*   [ ] Create WASM build for browser verification
*   [ ] Integrate with Atomica bridge protocol
*   [ ] Document gas costs for on-chain verification

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

## TDD Development Workflow (Quick Reference)

**Phase 2 Development Order**:

1. **📝 Documentation First** → Write README.md and API.md before any code
2. **✅ Stub Tests** → Define expected behavior in failing tests
3. **🏗️ Stub Libraries** → Create empty functions with correct signatures
4. **🖥️ Stub CLI** → Define command structure and help text
5. **🔗 Integrate SDK** → Connect to Ethereum testnet for integration tests
6. **🧪 TDD Implementation** → Write minimal code to make tests pass (Red → Green → Refactor)
7. **✅ Make Tests Pass** → Iterate until all tests green
8. **🚀 CI/CD** → Automate testing in GitHub Actions

**Key Principle**: Documentation and tests define the contract before implementation begins.

## Phase Boundary Summary

### What Phase 1 Delivered (✅ Complete)
```typescript
// SDK can FETCH proofs but NOT VERIFY them
const proof = await testnet.getProof(address, [], "latest");
// Returns: { accountProof: ["0xf8...", "0xe3..."], balance: "1000", ... }

const block = await testnet.getBlock("latest");
// Returns: { stateRoot: "0xabc123...", ... }

// ❌ MISSING: Function to verify proof against stateRoot
// Comment in test (line 104): "actual verification would require MPT implementation"
```

**Phase 1 Infrastructure**:
- Docker testnet serving `eth_getProof` RPC
- SDK method to fetch raw proof data
- Tests validating proof structure (hex strings, array format)

### What Phase 2 Will Build (🚧 Next)
```typescript
// NEW: Self-sufficient proof fetching + verification
import { fetchProof, verifyAccountProof } from '@atomica/state-proof-verifier';

// Works against ANY Ethereum node (mainnet, Infura, local)
const rpcUrl = 'https://mainnet.infura.io/v3/YOUR_KEY';
const proof = await fetchProof(rpcUrl, address, [], blockNumber);

// Cryptographic verification
const result = await verifyAccountProof(
    proof.accountProof,    // Array of RLP-encoded trie nodes
    proof.stateRoot,       // Root hash from block header
    address                // Account address
);

// result.valid: true/false
// result.accountState: { nonce, balance, storageHash, codeHash }
```

**CLI Usage**:
```bash
# Verify account against mainnet
eth-verify verify-account 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 12345678 \
  --rpc https://mainnet.infura.io/v3/YOUR_KEY

# Verify against local testnet
eth-verify verify-account 0x8943545177806ED17B9F23F0a21ee5948eCaa776 latest \
  --rpc http://localhost:8545
```

**Phase 2 Deliverables**:
- **Proof fetching** using `viem`/`ethers` (works with any RPC)
- **Cryptographic MPT verification** using `@ethereumjs/trie`
- **CLI tool** for end-to-end fetching + verification
- Tests proving cryptographic correctness
- Integration tests with live Docker testnet

## Future Extensions
*   Storage Proofs: Verifying specific generic storage slots (EIP-1186 also returns `storageProof`)
*   Cross-Chain Verification: Porting the `verifier.ts` logic to Rust/WASM for use in Atomica nodes
*   Light Client Integration: Verify full chain from sync committee → beacon block → execution state → account proof
*   Gas Optimization: Benchmark and optimize for potential on-chain verification
