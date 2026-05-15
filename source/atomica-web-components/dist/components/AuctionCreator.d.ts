/**
 * UI panel for creating a new sealed-bid auction on Aptos (v0 Beta).
 *
 * Generates an IBE Master Public Key, collects the LockBox `lock_id`,
 * window ID, pair BCS bytes, and minimum price from the seller, then calls
 * `auction::create_auction` via the SIWE-authenticated Aptos transaction flow.
 * The seller's Ethereum lock receipt is consumed by the contract to prove
 * asset escrow.
 *
 * v0 Beta breaking change from Demo phase: `create_auction` now takes
 * `(window_id, pair_bcs, lock_id, min_price, mpk_bytes)` instead of
 * `(lock_id, min_price, duration, mpk_bytes)`.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export declare function AuctionCreator(): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AuctionCreator.d.ts.map