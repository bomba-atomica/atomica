/**
 * Persist and retrieve the user's bid price in localStorage.
 *
 * Key format: `atomica:bid:v2:<sellerAddr>:<bidderAddr>` → bid price in whole
 * USD per whole base token (bigint serialised as decimal string).
 *
 * The `v2` segment marks the price unit. Builds before it stored prices under
 * the unversioned key `atomica:bid:<sellerAddr>:<bidderAddr>`, some in another
 * unit. Those entries are dropped, not migrated: `loadBidPrice` removes the
 * unversioned key and never reads it.
 */

const PREFIX = "atomica:bid:v2";
const LEGACY_PREFIX = "atomica:bid";

function pairKey(sellerAddr: string, bidderAddr: string): string {
  return `${sellerAddr.toLowerCase()}:${bidderAddr.toLowerCase()}`;
}

function key(sellerAddr: string, bidderAddr: string): string {
  return `${PREFIX}:${pairKey(sellerAddr, bidderAddr)}`;
}

function legacyKey(sellerAddr: string, bidderAddr: string): string {
  return `${LEGACY_PREFIX}:${pairKey(sellerAddr, bidderAddr)}`;
}

/**
 * Save the bid price (whole USD per whole base token, `parsePrice` output)
 * after a successful `submit_bid`.
 */
export function saveBidPrice(
  sellerAddr: string,
  bidderAddr: string,
  price: bigint,
): void {
  try {
    localStorage.setItem(key(sellerAddr, bidderAddr), price.toString());
  } catch {
    // localStorage may be unavailable in some environments — silently ignore.
  }
}

/**
 * Retrieve a previously saved bid price in whole USD per whole base token, or
 * `null` if none exists. Drops an old unversioned entry.
 */
export function loadBidPrice(
  sellerAddr: string,
  bidderAddr: string,
): bigint | null {
  try {
    localStorage.removeItem(legacyKey(sellerAddr, bidderAddr));
    const raw = localStorage.getItem(key(sellerAddr, bidderAddr));
    if (raw === null) return null;
    return BigInt(raw);
  } catch {
    return null;
  }
}

/** Remove a stored bid price (e.g. after claim). */
export function clearBidPrice(sellerAddr: string, bidderAddr: string): void {
  try {
    localStorage.removeItem(key(sellerAddr, bidderAddr));
    localStorage.removeItem(legacyKey(sellerAddr, bidderAddr));
  } catch {
    // Ignore.
  }
}
