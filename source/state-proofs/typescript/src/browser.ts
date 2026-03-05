/**
 * Ethereum State Proof Verifier - Browser Entry Point
 *
 * This entry point includes only browser-compatible functions:
 * - Proof fetching via RPC
 * - Proof verification
 * - Transaction/receipt verification
 *
 * Excludes Node.js-only functionality:
 * - Beacon light client sync (requires fs, crypto)
 * - State persistence (requires fs, path)
 *
 * @example
 * ```typescript
 * import { fetchProof, verifyAccountProof } from '@atomica/state-proof-verifier/browser';
 *
 * const proof = await fetchProof(rpcUrl, address, [], blockNumber);
 * const result = await verifyAccountProof(proof.accountProof, proof.stateRoot, address);
 *
 * if (result.valid) {
 *     console.log('Account state:', result.accountState);
 * }
 * ```
 */

// Re-export proof fetching functions (browser-compatible)
export {
    fetchProof,
    fetchBlock,
    fetchBlockTransactions,
    fetchBlockReceipts,
    fetchTransaction,
    fetchTransactionReceipt,
    fetchFullTransactionReceipt,
} from "./fetcher";

// Re-export verification functions (browser-compatible)
export { verifyAccountProof, verifyStorageProof, decodeAccountState } from "./verifier";
export { verifyTransactionProof } from "./transaction";
export { verifyReceiptProof } from "./receipt";

// Re-export MPT core functions (browser-compatible)
export {
    verifyMerkleProof,
    hashNode,
    decodeNode,
    keyToNibbles,
    decodeHexPrefix,
    matchPath,
} from "./mpt";

// Re-export all types (browser-compatible)
export type {
    EthereumProof,
    StorageProof,
    AccountState,
    VerificationResult,
    Block,
    TrieNode,
    BranchNode,
    ExtensionNode,
    LeafNode,
} from "./types";

// Re-export constants (browser-compatible)
export { EMPTY_ACCOUNT, HP_FLAGS } from "./types";
