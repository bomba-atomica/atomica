/**
 * LockBox-Specific Proof Generation
 *
 * Generates the state proof of one LockBox lock: the
 * `commitments[getLockId(user, token, nonce)]` slot, which holds
 * `lockCommitment(user, token, amount, binding)`. Aptos derives the same
 * storage key on chain and checks the proof against the state root the
 * validators certified for the proof block (`0x1::ethereum_headers`), so the
 * proof carries no root of its own. Prove at a certified block: wait for one
 * with `waitForCertifiedBlock` (`@atomica/sdk/aptos`) and pass it as
 * `blockNumber`.
 * Uses @atomica/state-proof-verifier for core proof fetching and verification.
 */

import { ethers } from "ethers";
import {
  fetchProof,
  type EthereumProof,
  type StorageProof,
} from "@atomica/state-proof-verifier";
import { calculateLockStorageKey, getLockId } from "./storage-key.js";
import { lockCommitment, type LockBinding } from "../lock-binding.js";

/** The lock fields Aptos checks against the proven commitment. */
export interface LockTerms extends LockBinding {
  /** Amount of this one lock */
  amount: bigint;
}

/**
 * State proof of one lock in the LockBox contract
 *
 * This is a domain-specific wrapper around EthereumProof that includes
 * LockBox contract context (user, token, lock nonce) and timestamps.
 * `stateRoot` is informational: Aptos checks the proof against the root the
 * validators certified for `blockNumber`, so `blockNumber` must be certified.
 */
export interface LockedBalanceProof {
  // Block information
  blockNumber: number;
  blockHash: string;
  stateRoot: string;

  // Contract information
  contractAddress: string;

  // User, token and lock (LockBox-specific)
  userAddress: string;
  tokenAddress: string;
  /** Nonce of the lock (from its `Locked` event) */
  lockNonce: bigint;
  /** LockBox.getLockId(user, token, nonce): the Aptos receipt id */
  lockId: string;

  // Lock fields (the commitment preimage) that register_ethereum_lock sends
  /** Amount of this one lock */
  amount: bigint;
  windowId: bigint;
  pairHash: string;
  deadline: bigint;

  // Storage proof of commitments[lockId]
  storageKey: string;
  /** The proven commitment, as a uint256 */
  storageValue: bigint;

  // MPT proofs
  accountProof: string[];
  storageProof: string[];

  // Metadata
  timestamp: number;
  generatedAt: number;
}

// Re-export StorageProof from state-proofs for convenience
export type { StorageProof };

/**
 * Generate the state proof of one lock in the LockBox contract
 *
 * @param provider - Ethereum provider
 * @param lockBoxAddress - Address of LockBox contract
 * @param userAddress - Address of user who locked tokens
 * @param tokenAddress - Address of token (FakeETH or FakeUSD)
 * @param lockNonce - Nonce of the lock (see `lockFromReceipt`)
 * @param terms - The lock's amount and binding (see `lockFromReceipt`)
 * @param blockNumber - Block to prove at (default: latest). Registration
 *   needs a validator-certified block at or after the lock block.
 * @returns Complete state proof with LockBox context
 */
export async function generateLockedBalanceProof(
  provider: ethers.Provider,
  lockBoxAddress: string,
  userAddress: string,
  tokenAddress: string,
  lockNonce: bigint,
  terms: LockTerms,
  blockNumber?: number,
): Promise<LockedBalanceProof> {
  // Normalize addresses
  const contractAddr = ethers.getAddress(lockBoxAddress);
  const userAddr = ethers.getAddress(userAddress);
  const tokenAddr = ethers.getAddress(tokenAddress);

  // Use latest block if not specified
  if (!blockNumber) {
    blockNumber = await provider.getBlockNumber();
  }

  // Storage key of commitments[getLockId(user, token, nonce)]
  const storageKey = calculateLockStorageKey(userAddr, tokenAddr, lockNonce);

  // Get RPC URL from provider
  // For JsonRpcProvider, we can access the URL via _getConnection()
  const jsonProvider = provider as ethers.JsonRpcProvider;
  const connection = jsonProvider._getConnection();
  const rpcUrl = connection.url;

  // Fetch proof using state-proofs library
  const ethereumProof: EthereumProof = await fetchProof(
    rpcUrl,
    contractAddr,
    [storageKey],
    blockNumber,
  );

  // Get block information
  const block = await provider.getBlock(blockNumber);
  if (!block) {
    throw new Error(`Block ${blockNumber} not found`);
  }

  if (!block.hash || !block.stateRoot) {
    throw new Error(`Block ${blockNumber} missing hash or stateRoot`);
  }

  // The proven slot must hold the commitment of the named lock fields,
  // or Aptos rejects the registration.
  const storageProofData = ethereumProof.storageProof[0];
  const storageValue = BigInt(storageProofData.value);
  const expected = BigInt(
    lockCommitment(userAddr, tokenAddr, terms.amount, terms),
  );
  if (storageValue !== expected) {
    throw new Error(
      `LockBox commitment of lock ${lockNonce} does not match its fields at block ${blockNumber}`,
    );
  }

  // Return LockBox-specific proof format
  return {
    blockNumber,
    blockHash: block.hash,
    stateRoot: block.stateRoot,
    contractAddress: contractAddr,
    userAddress: userAddr,
    tokenAddress: tokenAddr,
    lockNonce,
    lockId: getLockId(userAddr, tokenAddr, lockNonce),
    amount: terms.amount,
    windowId: terms.windowId,
    pairHash: terms.pairHash,
    deadline: terms.deadline,
    storageKey,
    storageValue,
    accountProof: ethereumProof.accountProof,
    storageProof: storageProofData.proof,
    timestamp: block.timestamp,
    generatedAt: Date.now(),
  };
}

/**
 * Verify that a proof was generated from a finalized block
 *
 * @param provider - Ethereum provider
 * @param proof - State proof to verify
 * @param minConfirmations - Minimum confirmations required (default: 64 for finality)
 * @returns True if block is finalized
 */
export async function isProofFinalized(
  provider: ethers.Provider,
  proof: LockedBalanceProof,
  minConfirmations: number = 64,
): Promise<boolean> {
  const latestBlock = await provider.getBlockNumber();
  const confirmations = latestBlock - proof.blockNumber;

  return confirmations >= minConfirmations;
}

/**
 * Validate proof structure
 *
 * @param proof - State proof to validate
 * @throws Error if proof is invalid
 */
export function validateProof(proof: LockedBalanceProof): void {
  if (!proof.blockHash || proof.blockHash === ethers.ZeroHash) {
    throw new Error("Invalid block hash");
  }

  if (!proof.stateRoot || proof.stateRoot === ethers.ZeroHash) {
    throw new Error("Invalid state root");
  }

  if (!proof.accountProof || proof.accountProof.length === 0) {
    throw new Error("Account proof is empty");
  }

  if (!proof.storageProof || proof.storageProof.length === 0) {
    throw new Error("Storage proof is empty");
  }

  if (proof.amount <= 0n) {
    throw new Error("Lock amount must be positive");
  }

  // Verify addresses are valid
  try {
    ethers.getAddress(proof.contractAddress);
    ethers.getAddress(proof.userAddress);
    ethers.getAddress(proof.tokenAddress);
  } catch (error) {
    throw new Error(
      `Invalid address in proof: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Format proof for display/logging
 *
 * @param proof - State proof
 * @returns Human-readable proof summary
 */
export function formatProof(proof: LockedBalanceProof): string {
  return `
LockBox Proof:
  Block: ${proof.blockNumber} (${proof.blockHash.slice(0, 10)}...)
  State Root: ${proof.stateRoot.slice(0, 10)}...
  Contract: ${proof.contractAddress}
  User: ${proof.userAddress}
  Token: ${proof.tokenAddress}
  Lock: nonce ${proof.lockNonce} (${proof.lockId.slice(0, 10)}...)
  Storage Key: ${proof.storageKey.slice(0, 10)}...
  Amount: ${proof.amount.toString()} wei
  Window: ${proof.windowId} (deadline ${proof.deadline})
  Account Proof Nodes: ${proof.accountProof.length}
  Storage Proof Nodes: ${proof.storageProof.length}
  Timestamp: ${new Date(proof.timestamp * 1000).toISOString()}
`.trim();
}

// Alias for backwards compatibility / simpler naming
export const generateLockProof = generateLockedBalanceProof;
