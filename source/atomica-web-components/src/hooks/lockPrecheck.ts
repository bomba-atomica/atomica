/**
 * Pre-checks run before an Ethereum lock, so an honest user never locks an
 * amount Aptos refuses.
 *
 * `auction::create_auction` refuses a seller lock below the minimum seller
 * lock or into a window that holds the maximum seller locks.
 * `auction::submit_bid` refuses a collateral below the minimum bid collateral
 * or a bid into a full window. LockBox on Ethereum accepts any nonzero amount,
 * so a refused lock waits for its reclaim deadline. These checks read the
 * limits and the window's fill first and return a refusal message.
 *
 * The check is advisory: Aptos stays the rule, and a window can still fill
 * between the check and the lock.
 *
 * @see docs/architecture/v0-architecture.md §2.3, §2.5
 */

import { ethers } from "ethers";
import {
  getBidCount,
  getWindowLimits,
  getWindowLockIds,
} from "@atomica/sdk/aptos";

/**
 * True when a view aborted with `E_AUCTION_NOT_FOUND` (1): the window does
 * not exist on Aptos yet, so it counts as empty.
 */
export function isWindowNotFound(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /E_AUCTION_NOT_FOUND|::auction: 0x1\b/.test(msg);
}

/**
 * Refusal message for a FakeETH seller lock of `amount` wei into
 * `(windowId, pairBcs)`, or null when the lock may go ahead. A read error
 * other than a missing window throws, so the caller refuses the lock.
 */
export async function sellerLockRefusal(
  amount: bigint,
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<string | null> {
  const limits = await getWindowLimits();
  if (amount < limits.minSellerLockAmount) {
    return `The minimum seller lock is ${ethers.formatEther(limits.minSellerLockAmount)} FakeETH. Aptos refuses a smaller lock.`;
  }
  let sellerLocks = 0n;
  try {
    const { sellers } = await getWindowLockIds(windowId, pairBcs);
    sellerLocks = BigInt(sellers.length);
  } catch (e: unknown) {
    if (!isWindowNotFound(e)) throw e;
  }
  if (sellerLocks >= limits.maxSellerLocksPerWindow) {
    return `This window already holds the maximum of ${limits.maxSellerLocksPerWindow} seller locks. Aptos refuses another one.`;
  }
  return null;
}

/**
 * Refusal message for a FakeUSD bid collateral of `amount` base units into
 * `(windowId, pairBcs)`, or null when the lock may go ahead. A read error
 * other than a missing window throws, so the caller refuses the lock.
 */
export async function bidCollateralRefusal(
  amount: bigint,
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<string | null> {
  const limits = await getWindowLimits();
  if (amount < limits.minBidCollateral) {
    return `The minimum bid collateral is ${ethers.formatUnits(limits.minBidCollateral, 6)} FakeUSD. Aptos refuses a smaller collateral.`;
  }
  let bids = 0n;
  try {
    bids = BigInt(await getBidCount(windowId, pairBcs));
  } catch (e: unknown) {
    if (!isWindowNotFound(e)) throw e;
  }
  if (bids >= limits.maxBidsPerWindow) {
    return `This window already holds the maximum of ${limits.maxBidsPerWindow} bids. Aptos refuses another one.`;
  }
  return null;
}
