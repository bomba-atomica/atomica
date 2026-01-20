# Ethereum State Verification Implementation Plan

## Objective
Implement a system to verify Ethereum account state changes (specifically transfers) using cryptographic state proofs (EIP-1186). This validates that a specific state (account balance, nonce, etc.) is part of the global Ethereum state trie committed to in a block header.

## System Components

### 1. Docker Testnet (Existing)
*   **Location**: `source/docker-testnet/ethereum-testnet`
*   **Role**: Provides a local Ethereum PoS environment (Geth + Lighthouse) for producing blocks and serving RPC requests.
*   **Capabilities**:
    *   JSON-RPC API (`eth_sendTransaction`, `eth_getProof`, `eth_getBlockByNumber`).
    *   Pre-funded test accounts.

### 2. TypeScript Verification Utility (New)
*   **Location**: `source/ethereum-state-verifier` (New Package)
*   **Role**: A standalone library/CLI to fetch and verify proofs.
*   **Dependencies**:
    *   `@ethereumjs/trie`: For Merkle Patricia Trie verification.
    *   `@ethereumjs/util`: For hashing (Keccak-256) and address primitives.
    *   `@ethereumjs/rlp`: For RLP decoding of proof nodes.
    *   `viem` or `ethers`: For RPC interaction and transaction management.

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

### Phase 1: Testnet Preparation
*   [ ] Ensure `ethereum-docker-testnet` is reliably starting (Verify recent Geth genesis fixes).
*   [ ] Verify `eth_getProof` is enabled on the Geth node (usually requires `--gcmode=archive` or supported via `--syncmode=full`). *Note: Config indicates `gcmode=archive` is already set.*

### Phase 2: Create Verification Package
*   [ ] Initialize `source/ethereum-state-verifier` with `package.json`, `tsconfig.json`.
*   [ ] Install dependencies: `typescript`, `@types/node`, `@ethereumjs/trie`, `@ethereumjs/util`, `@ethereumjs/rlp`, `viem`.
*   [ ] Implement `ProofFetcher` class:
    *   Connects to RPC.
    *   Methods: `getProof(address, block)`, `getBlockHeader(block)`.
*   [ ] Implement `ProofVerifier` class:
    *   Logic to reconstruct the trie path from the proof.
    *   Validate the root hash against the block header.
    *   Validate the value (RLP encoded account) against the leaf.

### Phase 3: Integration Test
*   [ ] Write an end-to-end test script `test/verify_transfer.test.ts`:
    1.  **Setup**: Start Docker Testnet via existing SDK.
    2.  **Action**: Send 1 ETH from Alice -> Bob. Wait for confirmation.
    3.  **Snapshot**: Record Block Number `N` and Bob's new balance.
    4.  **Fetch**: Request `eth_getProof` for Bob at Block `N`.
    5.  **Verify**:
        *   Pass proof + `stateRoot` to `ProofVerifier`.
        *   Assert verification returns `true`.
        *   Assert the decoded account balance in the leaf matches Bob's expected balance.

## Directory Structure Strategy
```
source/
  ethereum-state-verifier/
    package.json
    tsconfig.json
    src/
      index.ts        # Exports
      fetcher.ts      # RPC calls
      verifier.ts     # Core crypto logic EIP-1186
      types.ts
    test/
      e2e.test.ts     # The main integration test
```

## Future Extensions
*   Storage Proofs: Verifying specific generic storage slots (EIP-1186 also returns `storageProof`).
*   Cross-Chain Verification: Porting the `verifier.ts` logic to Rust/WASM for use in Atomica nodes.
