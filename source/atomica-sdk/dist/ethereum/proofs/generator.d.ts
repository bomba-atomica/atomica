/**
 * LockBox-Specific Proof Generation
 *
 * Generates state proofs for LockBox contract locked balances.
 * Uses @atomica/state-proof-verifier for core proof fetching and verification.
 */
import { ethers } from "ethers";
import { type StorageProof } from "@atomica/state-proof-verifier";
import { calculateLockedBalanceStorageKey } from "./storage-key.js";
/**
 * Complete state proof for locked balance in LockBox contract
 *
 * This is a domain-specific wrapper around EthereumProof that includes
 * LockBox contract context (user, token addresses) and timestamps.
 */
export interface LockedBalanceProof {
    blockNumber: number;
    blockHash: string;
    stateRoot: string;
    contractAddress: string;
    userAddress: string;
    tokenAddress: string;
    storageKey: string;
    storageValue: bigint;
    accountProof: string[];
    storageProof: string[];
    timestamp: number;
    generatedAt: number;
}
export type { StorageProof };
/**
 * Generate state proof for a locked balance in LockBox contract
 *
 * @param provider - Ethereum provider
 * @param lockBoxAddress - Address of LockBox contract
 * @param userAddress - Address of user who locked tokens
 * @param tokenAddress - Address of token (FakeETH or FakeUSD)
 * @param blockNumber - Block number to generate proof at (default: latest)
 * @returns Complete state proof with LockBox context
 */
export declare function generateLockedBalanceProof(provider: ethers.Provider, lockBoxAddress: string, userAddress: string, tokenAddress: string, blockNumber?: number): Promise<LockedBalanceProof>;
/**
 * Generate proofs for multiple users/tokens in batch
 *
 * @param provider - Ethereum provider
 * @param lockBoxAddress - LockBox contract address
 * @param users - Array of user addresses
 * @param tokens - Array of token addresses
 * @param blockNumber - Block number (default: latest)
 * @returns Array of proofs
 */
export declare function generateBatchProofs(provider: ethers.Provider, lockBoxAddress: string, users: string[], tokens: string[], blockNumber?: number): Promise<LockedBalanceProof[]>;
/**
 * Verify that a proof was generated from a finalized block
 *
 * @param provider - Ethereum provider
 * @param proof - State proof to verify
 * @param minConfirmations - Minimum confirmations required (default: 64 for finality)
 * @returns True if block is finalized
 */
export declare function isProofFinalized(provider: ethers.Provider, proof: LockedBalanceProof, minConfirmations?: number): Promise<boolean>;
/**
 * Serialize proof for transmission to Aptos
 *
 * Converts proof to a format suitable for Move structs
 *
 * @param proof - State proof
 * @returns Serialized proof data for Aptos
 */
export declare function serializeProofForAptos(proof: LockedBalanceProof): {
    block_hash: string;
    state_root: string;
    contract_address: string;
    storage_key: string;
    storage_value: string;
    account_proof: string[];
    storage_proof: string[];
};
/**
 * Validate proof structure
 *
 * @param proof - State proof to validate
 * @throws Error if proof is invalid
 */
export declare function validateProof(proof: LockedBalanceProof): void;
/**
 * Format proof for display/logging
 *
 * @param proof - State proof
 * @returns Human-readable proof summary
 */
export declare function formatProof(proof: LockedBalanceProof): string;
export declare const generateLockProof: typeof generateLockedBalanceProof;
export declare const calculateStorageKey: typeof calculateLockedBalanceStorageKey;
