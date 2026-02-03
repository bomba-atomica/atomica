/**
 * Ethereum State Proof Generator
 *
 * Generates Merkle-Patricia Trie proofs from Ethereum state
 * that can be verified on Aptos.
 */

import { ethers } from "ethers";
import { calculateLockedBalanceStorageKey } from "./storage-key.js";

/**
 * Storage proof from eth_getProof
 */
export interface StorageProof {
  key: string;
  value: string;
  proof: string[];
}

/**
 * Account proof from eth_getProof
 */
export interface AccountProof {
  address: string;
  accountProof: string[];
  balance: string;
  codeHash: string;
  nonce: string;
  storageHash: string;
  storageProof: StorageProof[];
}

/**
 * Complete state proof for locked balance
 */
export interface LockedBalanceProof {
  // Block information
  blockNumber: number;
  blockHash: string;
  stateRoot: string;

  // Contract information
  contractAddress: string;

  // User and token
  userAddress: string;
  tokenAddress: string;

  // Storage proof
  storageKey: string;
  storageValue: bigint;

  // MPT proofs
  accountProof: string[];
  storageProof: string[];

  // Metadata
  timestamp: number;
  generatedAt: number;
}

/**
 * Generate state proof for a locked balance
 *
 * @param provider - Ethereum provider
 * @param lockBoxAddress - Address of LockBox contract
 * @param userAddress - Address of user who locked tokens
 * @param tokenAddress - Address of token (FakeETH or FakeUSD)
 * @param blockNumber - Block number to generate proof at (default: latest)
 * @returns Complete state proof
 */
export async function generateLockedBalanceProof(
  provider: ethers.Provider,
  lockBoxAddress: string,
  userAddress: string,
  tokenAddress: string,
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

  // Calculate storage key
  const storageKey = calculateLockedBalanceStorageKey(userAddr, tokenAddr);

  // Get proof from Ethereum
  const proof = await getStorageProof(
    provider,
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

  // Extract storage value
  const storageProofData = proof.storageProof[0];
  const storageValue = BigInt(storageProofData.value);

  return {
    blockNumber,
    blockHash: block.hash,
    stateRoot: block.stateRoot,
    contractAddress: contractAddr,
    userAddress: userAddr,
    tokenAddress: tokenAddr,
    storageKey,
    storageValue,
    accountProof: proof.accountProof,
    storageProof: storageProofData.proof,
    timestamp: block.timestamp,
    generatedAt: Date.now(),
  };
}

/**
 * Call eth_getProof to retrieve storage proofs
 *
 * @param provider - Ethereum provider
 * @param address - Contract address
 * @param storageKeys - Array of storage keys to prove
 * @param blockNumber - Block number
 * @returns Account proof with storage proofs
 */
async function getStorageProof(
  provider: ethers.Provider,
  address: string,
  storageKeys: string[],
  blockNumber: number,
): Promise<AccountProof> {
  // Call eth_getProof RPC method
  // Cast to JsonRpcProvider to access send method
  const jsonProvider = provider as ethers.JsonRpcProvider;

  if (!jsonProvider.send) {
    throw new Error("Provider does not support eth_getProof");
  }

  const proof = await jsonProvider.send("eth_getProof", [
    address,
    storageKeys,
    ethers.toBeHex(blockNumber),
  ]);

  return proof as AccountProof;
}

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
export async function generateBatchProofs(
  provider: ethers.Provider,
  lockBoxAddress: string,
  users: string[],
  tokens: string[],
  blockNumber?: number,
): Promise<LockedBalanceProof[]> {
  const proofs: LockedBalanceProof[] = [];

  for (const user of users) {
    for (const token of tokens) {
      const proof = await generateLockedBalanceProof(
        provider,
        lockBoxAddress,
        user,
        token,
        blockNumber,
      );
      proofs.push(proof);
    }
  }

  return proofs;
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
 * Serialize proof for transmission to Aptos
 *
 * Converts proof to a format suitable for Move structs
 *
 * @param proof - State proof
 * @returns Serialized proof data
 */
export function serializeProofForAptos(proof: LockedBalanceProof): {
  block_hash: string;
  state_root: string;
  contract_address: string;
  storage_key: string;
  storage_value: string;
  account_proof: string[];
  storage_proof: string[];
} {
  return {
    block_hash: proof.blockHash,
    state_root: proof.stateRoot,
    contract_address: proof.contractAddress,
    storage_key: proof.storageKey,
    storage_value: ethers.toBeHex(proof.storageValue),
    account_proof: proof.accountProof,
    storage_proof: proof.storageProof,
  };
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

  if (proof.storageValue < 0n) {
    throw new Error("Storage value cannot be negative");
  }

  // Verify addresses are valid
  try {
    ethers.getAddress(proof.contractAddress);
    ethers.getAddress(proof.userAddress);
    ethers.getAddress(proof.tokenAddress);
  } catch {
    throw new Error("Invalid address in proof");
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
Locked Balance Proof
====================
Block: ${proof.blockNumber} (${proof.blockHash.slice(0, 10)}...)
User: ${proof.userAddress}
Token: ${proof.tokenAddress}
Locked Amount: ${ethers.formatEther(proof.storageValue)} tokens
State Root: ${proof.stateRoot.slice(0, 10)}...
Account Proof: ${proof.accountProof.length} nodes
Storage Proof: ${proof.storageProof.length} nodes
Generated: ${new Date(proof.generatedAt).toISOString()}
`.trim();
}
