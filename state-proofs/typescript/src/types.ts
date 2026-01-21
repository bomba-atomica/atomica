/**
 * Type definitions for Ethereum state proof verification
 */

import type { Hex } from "viem";

/**
 * Ethereum proof data returned by eth_getProof RPC call
 */
export interface EthereumProof {
    /** Account address */
    address: string;
    /** Array of RLP-encoded trie nodes from state root to account leaf */
    accountProof: string[];
    /** Account balance (hex string) */
    balance: string;
    /** Contract code hash (0x-prefixed hex) */
    codeHash: string;
    /** Account nonce (hex string) */
    nonce: string;
    /** Storage trie root hash (0x-prefixed hex) */
    storageHash: string;
    /** Storage proofs for requested storage keys */
    storageProof: StorageProof[];
    /** State root from block header (added by fetcher) */
    stateRoot?: string;
}

/**
 * Storage proof for a specific storage slot
 */
export interface StorageProof {
    key: string;
    value: string;
    proof: string[];
}

export interface Transaction {
    hash: string;
    nonce: string;
    blockHash: string | null;
    blockNumber: string | null;
    transactionIndex: string | null;
    from: string;
    to: string | null;
    value: string;
    gasPrice?: string;
    gas: string;
    input: string;
    v?: string;
    r?: string;
    s?: string;
    type?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    chainId?: string;
}

export interface Receipt {
    transactionHash: string;
    transactionIndex: string;
    blockHash: string;
    blockNumber: string;
    from: Hex;
    to: Hex | null | undefined;
    cumulativeGasUsed: string;
    gasUsed: string;
    contractAddress: string | null;
    logs: Log[];
    logsBloom: string;
    status: string | null;
    root?: string;
    type?: string;
}

export interface Log {
    address: Hex;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: Hex;
    transactionIndex: string;
    blockHash: Hex;
    logIndex: string;
    removed: boolean;
}

/**
 * Decoded account state from MPT leaf node
 */
export interface AccountState {
    /** Account nonce */
    nonce: number;
    /** Account balance in wei */
    balance: bigint;
    /** Storage trie root hash */
    storageHash: string;
    /** Contract code hash */
    codeHash: string;
}

/**
 * Result of proof verification
 */
export interface VerificationResult {
    /** Whether the proof is valid */
    valid: boolean;
    /** Decoded account state (if valid account proof) */
    accountState?: AccountState;
    /** Storage value (if valid storage proof) */
    value?: string;
    /** Error message (if invalid) */
    error?: string;
    /** Number of proof nodes verified */
    proofNodes?: number;
}

/**
 * Block header data
 */
export interface Block {
    /** Block number (hex string) */
    number: string;
    /** Block hash */
    hash: string;
    /** State trie root hash */
    stateRoot: string;
    /** Transactions trie root hash */
    transactionsRoot: string;
    /** Receipts trie root hash */
    receiptsRoot: string;
    /** Parent block hash */
    parentHash: string;
    /** Block timestamp (hex string) */
    timestamp: string;
    /** Other block fields... */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

/**
 * MPT node types
 */
export type TrieNode = BranchNode | ExtensionNode | LeafNode;

/**
 * Branch node (16 children + optional value)
 */
export interface BranchNode {
    type: "branch";
    children: (Buffer | null)[];
    value: Buffer | null;
}

/**
 * Extension node (path + next node)
 */
export interface ExtensionNode {
    type: "extension";
    path: Buffer;
    next: Buffer;
}

/**
 * Leaf node (path + value)
 */
export interface LeafNode {
    type: "leaf";
    path: Buffer;
    value: Buffer;
}

/**
 * Constants for empty account
 */
export const EMPTY_ACCOUNT = {
    /** Empty storage trie root (Keccak256 of RLP empty array) */
    STORAGE_ROOT: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
    /** Empty code hash (Keccak256 of empty byte array) */
    CODE_HASH: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
} as const;

/**
 * Hex-Prefix encoding flags
 */
export const HP_FLAGS = {
    /** Extension node with even-length path */
    EXTENSION_EVEN: 0x00,
    /** Extension node with odd-length path */
    EXTENSION_ODD: 0x10,
    /** Leaf node with even-length path */
    LEAF_EVEN: 0x20,
    /** Leaf node with odd-length path */
    LEAF_ODD: 0x30,
} as const;
