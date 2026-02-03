/**
 * Storage Key Calculation for LockBox Contract
 *
 * Calculates storage keys for nested mappings in Solidity
 * to be used with eth_getProof for state proof generation.
 */

import { ethers } from "ethers";

/**
 * Calculate storage key for LockBox.lockedBalances[user][token]
 *
 * For a nested mapping: mapping(address => mapping(address => uint256))
 * at storage slot 0, the key is calculated as:
 *
 * innerKey = keccak256(abi.encode(token, slot))
 * storageKey = keccak256(abi.encode(user, innerKey))
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
  // Ensure addresses are checksummed and lowercase
  const user = ethers.getAddress(userAddress);
  const token = ethers.getAddress(tokenAddress);

  // Step 1: Calculate inner mapping key
  // innerKey = keccak256(abi.encode(token, slot))
  const innerKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [token, slot],
    ),
  );

  // Step 2: Calculate final storage key
  // storageKey = keccak256(abi.encode(user, innerKey))
  const storageKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "bytes32"],
      [user, innerKey],
    ),
  );

  return storageKey;
}

/**
 * Calculate storage key for LockBox.unlockTimes[user][token]
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
