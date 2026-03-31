/**
 * Persist and retrieve the user's bid price in localStorage.
 *
 * Key format: `atomica:bid:<sellerAddr>:<bidderAddr>` → bid price in USD
 * micro-units (bigint serialised as decimal string).
 */

const PREFIX = "atomica:bid";

function key(sellerAddr: string, bidderAddr: string): string {
  return `${PREFIX}:${sellerAddr.toLowerCase()}:${bidderAddr.toLowerCase()}`;
}

/** Save the bid price after a successful `submit_bid`. */
export function saveBidPrice(
  sellerAddr: string,
  bidderAddr: string,
  amountUsd: bigint,
): void {
  try {
    localStorage.setItem(key(sellerAddr, bidderAddr), amountUsd.toString());
  } catch {
    // localStorage may be unavailable in some environments — silently ignore.
  }
}

/** Retrieve a previously saved bid price, or `null` if none exists. */
export function loadBidPrice(
  sellerAddr: string,
  bidderAddr: string,
): bigint | null {
  try {
    const raw = localStorage.getItem(key(sellerAddr, bidderAddr));
    if (raw === null) return null;
    return BigInt(raw);
  } catch {
    return null;
  }
}

/** Remove a stored bid price (e.g. after claim). */
export function clearBidPrice(
  sellerAddr: string,
  bidderAddr: string,
): void {
  try {
    localStorage.removeItem(key(sellerAddr, bidderAddr));
  } catch {
    // Ignore.
  }
}
