/**
 * LockBox Contract Helpers
 *
 * Ethereum-side interactions for locking FakeETH/FakeUSD in LockBox.sol.
 * Covers approve → lock → query → withdraw lifecycle.
 */
import { ethers, type TransactionReceipt } from "ethers";
/**
 * Approve LockBox to spend `amount` of FakeETH on the user's behalf.
 *
 * This must be called before `lockFakeEth` if the current allowance is
 * insufficient.
 */
export declare function approveFakeEth(provider: ethers.BrowserProvider, amount: bigint): Promise<TransactionReceipt>;
/**
 * Lock `amount` of FakeETH in LockBox.
 *
 * The caller must have approved LockBox for at least `amount` first.
 */
export declare function lockFakeEth(provider: ethers.BrowserProvider, amount: bigint): Promise<TransactionReceipt>;
/**
 * Get the FakeETH amount currently locked by `userAddress` in LockBox.
 */
export declare function getLockedBalance(provider: ethers.Provider, userAddress: string): Promise<bigint>;
/**
 * Get the Unix timestamp (seconds) after which the user can withdraw.
 * Returns 0 if no tokens are locked.
 */
export declare function getUnlockTime(provider: ethers.Provider, userAddress: string): Promise<number>;
/**
 * Check whether the user's tokens are past their lock period.
 */
export declare function isUnlocked(provider: ethers.Provider, userAddress: string): Promise<boolean>;
/**
 * Withdraw `amount` of previously locked FakeETH.
 * Will revert on-chain if the unlock time has not passed.
 */
export declare function withdrawFakeEth(provider: ethers.BrowserProvider, amount: bigint): Promise<TransactionReceipt>;
/**
 * Get the FakeETH allowance the user has granted to LockBox.
 */
export declare function getLockBoxAllowance(provider: ethers.Provider, userAddress: string): Promise<bigint>;
/**
 * Get total FakeETH locked by all users in LockBox.
 * Queries all TokensLocked events and sums the amounts.
 */
export declare function getTotalLockedEth(provider: ethers.Provider): Promise<bigint>;
