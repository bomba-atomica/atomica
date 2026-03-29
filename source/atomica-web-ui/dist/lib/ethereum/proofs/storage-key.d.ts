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
export declare function getLockKey(userAddress: string, tokenAddress: string): string;
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
export declare function calculateLockedBalanceStorageKey(userAddress: string, tokenAddress: string, slot?: number): string;
/**
 * Calculate storage key for LockBox.unlockTimes[getLockKey(user, token)]
 *
 * Same as lockedBalances but at slot 1
 *
 * @param userAddress - Address of the user
 * @param tokenAddress - Address of the token
 * @returns Storage key as hex string
 */
export declare function calculateUnlockTimeStorageKey(userAddress: string, tokenAddress: string): string;
/**
 * Verify storage key calculation matches on-chain contract
 *
 * @param contract - LockBox contract instance
 * @param userAddress - User address
 * @param tokenAddress - Token address
 * @returns True if calculation matches contract
 */
export declare function verifyStorageKeyCalculation(contract: ethers.Contract, userAddress: string, tokenAddress: string): Promise<boolean>;
/**
 * Calculate multiple storage keys at once
 *
 * Useful for batch proof generation
 *
 * @param users - Array of user addresses
 * @param tokens - Array of token addresses
 * @returns Array of storage keys
 */
export declare function calculateBatchStorageKeys(users: string[], tokens: string[]): string[];
//# sourceMappingURL=storage-key.d.ts.map