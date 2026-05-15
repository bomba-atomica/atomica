/**
 * bridge.ts — v0 Beta Scaffold stub
 *
 * Cross-chain settlement bridge between Aptos and Ethereum.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 *
 * ============================================================
 * INTEGRATION RISK (scout #96)
 * ============================================================
 *
 * This file is a compile-clean stub created by the Phase v0 Beta Scaffold
 * integration scout (issue #96). None of the exported functions contain
 * real logic; all bodies throw NOT_IMPLEMENTED.
 *
 * Shared-file pressure — this file is edited by TWO downstream issues:
 *
 *   #87 (Phase 3b — bidder collateral scaffold):
 *     - Adds typed interface for the bidder collateral refund path.
 *     - Adds `submitBidCollateralRefund(lockId)` or similar.
 *     - Must merge before #89 to avoid conflicts.
 *
 *   #89 (Phase 3d — cross-chain settlement scaffold):
 *     - Implements `queryAuctionSettledEvents(windowId, pair)`.
 *     - Implements `submitSettlement(events)` calling BLSVerifierTestnet.sol.
 *     - Adds typed `AuctionSettledEvent` interface matching §2 event shape.
 *     - Merge order: #86 → #87 → #89.
 *
 * Call-site dependencies:
 *   - `queryAuctionSettledEvents` reads `auction::AuctionSettled` events from
 *     the Aptos node. The event shape is defined in auction.move::AuctionSettled
 *     (implemented in #86 as the Phase 3a global-registry event).
 *   - `submitSettlement` calls `BLSVerifierTestnet.sol::authorizeSettlement`
 *     (stub created in issue #83; implemented in #89).
 *   - Winner addresses for `submitSettlement` come from the AuctionSettled event;
 *     the per-seller view functions from Demo phase are removed in #86.
 */

// Scaffold created by dev-scout issue #96. Implement in #87 and #89.

// ============================================================
// Types
// ============================================================

/**
 * Mirrors the on-chain `auction::Pair` struct.
 * @see docs/architecture/v0-architecture.md §2.4
 */
export interface Pair {
  baseChain: string; // e.g. "ethereum"
  baseToken: string; // e.g. "FakeETH"
  quoteChain: string; // e.g. "aptos"
  quoteToken: string; // e.g. "FakeUSD"
}

/**
 * Mirrors the on-chain `auction::AuctionSettled` event.
 * @see docs/architecture/v0-architecture.md §2.9
 * Implemented in auction.move as `AuctionSettled` (Phase 3a #86).
 */
export interface AuctionSettledEvent {
  windowId: bigint;
  pair: Pair;
  clearingPrice: bigint;
  totalFilled: bigint; // wei of base token transferred to winners
  winnerCount: bigint;
  lockIds: Uint8Array[]; // seller receipt IDs consumed
}

/**
 * Transaction hash returned by Ethereum settlement calls.
 */
export type TxHash = string;

// ============================================================
// Functions — scaffold stubs (all throw NOT_IMPLEMENTED)
// ============================================================

/**
 * Query Aptos node for `auction::AuctionSettled` events for a given window/pair.
 *
 * Implemented in issue #89.
 *
 * @param windowId  auction_window_id from docs/architecture §2.2
 * @param pair      trading pair descriptor
 */
export async function queryAuctionSettledEvents(
  _windowId: bigint,
  _pair: Pair,
): Promise<AuctionSettledEvent[]> {
  throw new Error(
    "NOT_IMPLEMENTED: queryAuctionSettledEvents — implement in #89",
  );
}

/**
 * Submit settlement to `BLSVerifierTestnet.sol::authorizeSettlement` then
 * `Settlement.sol`.
 *
 * Implemented in issue #89.
 * Depends on `BLSVerifierTestnet.sol` stub from issue #83.
 *
 * @param events  AuctionSettledV1 events fetched from Aptos
 * @see docs/architecture/v0-architecture.md §3.2
 */
export async function submitSettlement(
  _events: AuctionSettledEvent[],
): Promise<TxHash> {
  throw new Error("NOT_IMPLEMENTED: submitSettlement — implement in #89");
}

/**
 * Typed descriptor for a losing bidder's collateral refund request.
 *
 * Created when settlement determines a bid did not win.  The
 * `collateral_lock_id` is the FakeUSD LockReceipt ID that was consumed by
 * `auction::submit_bid`.  The off-chain relayer or user calls
 * `releaseBidderCollateral` with this descriptor to trigger the Ethereum-side
 * unlock of the frozen FakeUSD.
 *
 * @see docs/architecture/v0-architecture.md §2.8 — Collateral Refund Path
 * @see #87 (Phase 3b — bidder collateral scaffold)
 * @see #89 (Phase 3d — cross-chain settlement) where full release logic lands
 */
export interface BidderCollateralRefund {
  /** FakeUSD LockReceipt ID consumed by auction::submit_bid */
  collateralLockId: Uint8Array;
  /** Bidder Aptos address (zero-padded Ethereum address) */
  bidderAddress: string;
  /** auction_window_id for which this bid was submitted */
  windowId: bigint;
  /** BCS-encoded trading pair that identifies the auction window */
  pairBcs: Uint8Array;
}

/**
 * Release bidder collateral for a losing bid.
 *
 * Called after settlement when a bid did not win the uniform-price clearing.
 * In the production flow this calls the Ethereum LockBox to unfreeze the
 * FakeUSD that was locked as margin.
 *
 * Scaffold body — implemented in issue #87 (this issue) as a typed stub.
 * Full cross-chain release logic (including BLS proof generation and
 * `BLSVerifierTestnet.sol` call) lands in #89.
 *
 * @param refund  Collateral refund descriptor from the losing bid
 * @see docs/architecture/v0-architecture.md §2.8
 */
export async function releaseBidderCollateral(
  _refund: BidderCollateralRefund,
): Promise<TxHash> {
  throw new Error(
    "NOT_IMPLEMENTED: releaseBidderCollateral — full cross-chain release implements in #89",
  );
}
