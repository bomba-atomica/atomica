/**
 * Storage Key Calculation for LockBox Contract
 *
 * Calculates storage keys for single-level mappings with composite keys in Solidity.
 * Used with eth_getProof for state proof generation.
 *
 * IMPORTANT: This uses single-level mapping storage layout, not nested mappings.
 * Nested mappings do not work reliably with eth_getProof on Geth.
 * See: docs/development/ethereum-storage-proof-quirks.md
 */

import { ethers } from "ethers";

/**
 * Calculate composite lock key for user+token combination
 *
 * This matches the LockBox.getLockKey() function:
 * compositeKey = keccak256(abi.encodePacked(user, token))
 *
 * @param userAddress - Address of the user
 * @param tokenAddress - Address of the token
 * @returns Composite key as bytes32
 */
export function getLockKey(userAddress: string, tokenAddress: string): string {
  // Ensure addresses are checksummed
  const user = ethers.getAddress(userAddress);
  const token = ethers.getAddress(tokenAddress);

  // Use encodePacked for gas efficiency (matches Solidity)
  const compositeKey = ethers.keccak256(
    ethers.solidityPacked(["address", "address"], [user, token]),
  );

  return compositeKey;
}

/**
 * Calculate storage key for LockBox.lockedBalances[getLockKey(user, token)]
 *
 * For a single-level mapping: mapping(bytes32 => uint256) at storage slot 0:
 * 1. compositeKey = keccak256(abi.encodePacked(user, token))
 * 2. storageKey = keccak256(abi.encode(compositeKey, slot))
 *
 * @param userAddress - Address of the user who locked tokens
 * @param tokenAddress - Address of the token (FakeETH or FakeUSD)
 * @param slot - Storage slot of the mapping (default: 0 for lockedBalances)
 * @returns Storage key as hex string
 */
export function calculateLockedBalanceStorageKey(
  userAddress: string,
  tokenAddress: string,
  slot: number = 0,
): string {
  // Step 1: Calculate composite key (user + token)
  const compositeKey = getLockKey(userAddress, tokenAddress);

  // Step 2: Calculate storage key for mapping
  // For single-level mapping: keccak256(abi.encode(key, slot))
  const storageKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256"],
      [compositeKey, slot],
    ),
  );

  return storageKey;
}

/**
 * Calculate storage key for LockBox.unlockTimes[getLockKey(user, token)]
 *
 * Same as lockedBalances but at slot 1
 *
 * @param userAddress - Address of the user
 * @param tokenAddress - Address of the token
 * @returns Storage key as hex string
 */
export function calculateUnlockTimeStorageKey(
  userAddress: string,
  tokenAddress: string,
): string {
  return calculateLockedBalanceStorageKey(userAddress, tokenAddress, 1);
}

/** Storage slot of `LockBox.lockAmounts` (the per-lock record Aptos proves). */
export const LOCK_AMOUNTS_SLOT = 4;

/**
 * Id of one LockBox lock, also its Aptos receipt id.
 *
 * Matches `LockBox.getLockId` and `eth_proof::lock_id`:
 * keccak256(abi.encodePacked(user, token, uint256(nonce)))
 *
 * @param userAddress - Address that locked the tokens
 * @param tokenAddress - Locked token (FakeETH or FakeUSD)
 * @param nonce - The lock's nonce from its `TokensLocked` event
 */
export function getLockId(
  userAddress: string,
  tokenAddress: string,
  nonce: bigint,
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["address", "address", "uint256"],
      [ethers.getAddress(userAddress), ethers.getAddress(tokenAddress), nonce],
    ),
  );
}

/**
 * Storage key of `LockBox.lockAmounts[getLockId(user, token, nonce)]`.
 *
 * Matches `LockBox.calculateLockStorageKey` and `eth_proof::lock_storage_key`,
 * which Aptos derives on chain: keccak256(abi.encode(lockId, uint256(4))).
 */
export function calculateLockStorageKey(
  userAddress: string,
  tokenAddress: string,
  nonce: bigint,
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256"],
      [getLockId(userAddress, tokenAddress, nonce), LOCK_AMOUNTS_SLOT],
    ),
  );
}

/**
 * Verify storage key calculation matches on-chain contract
 *
 * @param contract - LockBox contract instance
 * @param userAddress - User address
 * @param tokenAddress - Token address
 * @returns True if calculation matches contract
 */
export async function verifyStorageKeyCalculation(
  contract: ethers.Contract,
  userAddress: string,
  tokenAddress: string,
): Promise<boolean> {
  try {
    // Get key from contract's helper function
    const onChainKey = await contract.calculateStorageKey(
      userAddress,
      tokenAddress,
    );

    // Calculate key off-chain
    const offChainKey = calculateLockedBalanceStorageKey(
      userAddress,
      tokenAddress,
    );

    return onChainKey.toLowerCase() === offChainKey.toLowerCase();
  } catch (error) {
    console.error("Failed to verify storage key:", error);
    return false;
  }
}

/**
 * Calculate multiple storage keys at once
 *
 * Useful for batch proof generation
 *
 * @param users - Array of user addresses
 * @param tokens - Array of token addresses
 * @returns Array of storage keys
 */
export function calculateBatchStorageKeys(
  users: string[],
  tokens: string[],
): string[] {
  const keys: string[] = [];

  for (const user of users) {
    for (const token of tokens) {
      keys.push(calculateLockedBalanceStorageKey(user, token));
    }
  }

  return keys;
}
