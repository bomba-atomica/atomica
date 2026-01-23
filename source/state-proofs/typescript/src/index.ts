/**
 * Ethereum State Proof Verifier
 *
 * Self-sufficient library for fetching and verifying Ethereum state proofs
 *
 * @example
 * ```typescript
 * import { fetchProof, verifyAccountProof } from '@atomica/state-proof-verifier';
 *
 * const proof = await fetchProof(rpcUrl, address, [], blockNumber);
 * const result = await verifyAccountProof(proof.accountProof, proof.stateRoot, address);
 *
 * if (result.valid) {
 *     console.log('Account state:', result.accountState);
 * }
 * ```
 */

// Re-export proof fetching functions
export {
    fetchProof,
    fetchBlock,
    fetchBlockTransactions,
    fetchBlockReceipts,
    fetchTransaction,
    fetchTransactionReceipt,
    fetchFullTransactionReceipt,
} from "./fetcher";

// Re-export verification functions
export { verifyAccountProof, verifyStorageProof, decodeAccountState } from "./verifier";
export { verifyTransactionProof } from "./transaction";
export { verifyReceiptProof } from "./receipt";

// Re-export beacon/light client functions
export * from "./beacon";

// Re-export IBE (Identity-Based Encryption) functions
export * from "./ibe";

// Re-export MPT core functions (advanced usage)

export {
    verifyMerkleProof,
    hashNode,
    decodeNode,
    keyToNibbles,
    decodeHexPrefix,
    matchPath,
} from "./mpt";

// Re-export all types
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

// Re-export constants
export { EMPTY_ACCOUNT, HP_FLAGS } from "./types";
