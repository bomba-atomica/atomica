/**
 * UI panel for creating a new sealed-bid auction on Aptos (v0 Beta).
 *
 * Fetches the IBE Master Public Key from `timelock_config::get_mpk()` on-chain
 * (Phase 3e), collects the LockBox `lock_id`, window ID, pair BCS bytes, and
 * minimum price from the seller, then calls `auction::create_auction` via the
 * SIWE-authenticated Aptos transaction flow.
 *
 * Phase 3e change: no local `generateSystemParameters()` — MPK is fetched from
 * the on-chain timelock_config module so all auction participants share the same
 * authoritative key.
 *
 * v0 Beta breaking change from Demo phase: `create_auction` now takes
 * `(window_id, pair_bcs, lock_id, min_price, mpk_bytes)` instead of
 * `(lock_id, min_price, duration, mpk_bytes)`.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export declare function AuctionCreator(): import("react").JSX.Element;
//# sourceMappingURL=AuctionCreator.d.ts.map