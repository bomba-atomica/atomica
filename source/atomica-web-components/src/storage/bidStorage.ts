// SCOUT(#217) EDIT: the stored bid price changes unit (this comment says USD micro-units, AuctionBidder stores whole USD); values already in localStorage are not migrated.
// SCOUT(#235) EDIT: the key is documented as seller and bidder, but AuctionBidder passes the window id; key the opening by window, pair, bidder and bid, or a second bid overwrites the first salt.
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
export function clearBidPrice(sellerAddr: string, bidderAddr: string): void {
  try {
    localStorage.removeItem(key(sellerAddr, bidderAddr));
  } catch {
    // Ignore.
  }
}

// SCOUT(#235) ADD: what a bidder must keep to open its own bid with open_bid while commit and reveal exists.
// SCOUT(#228) REMOVE: delete BidOpening and the three functions below when the salt and the commitment go.
export interface BidOpening {
  /** Bid price, in the one price unit (whole USD per whole base token). */
  price: bigint;
  /** 32-byte salt that sealBid returned. */
  salt: Uint8Array;
  /** 32-byte commitment that sealBid returned. */
  commitment: Uint8Array;
}

// SCOUT(#235) ADD: store the price, salt and commitment after submit_bid succeeds.
export function saveBidOpening(
  _windowId: bigint,
  _bidderAddr: string,
  _opening: BidOpening,
): void {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#235) saveBidOpening");
}

// SCOUT(#235) ADD: return the stored opening of a bid, or null when none exists.
export function loadBidOpening(
  _windowId: bigint,
  _bidderAddr: string,
): BidOpening | null {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#235) loadBidOpening");
}

// SCOUT(#235) ADD: remove the stored opening once the bid is opened or the window is final.
export function clearBidOpening(_windowId: bigint, _bidderAddr: string): void {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#235) clearBidOpening");
}
