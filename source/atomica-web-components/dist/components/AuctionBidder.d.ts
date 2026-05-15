/**
 * UI panel for submitting a sealed bid on an active auction (v0 Beta).
 *
 * Encrypts the bid price with IBE (Boneh-Franklin) using the window ID and
 * pair as the identity context, then calls `auction::submit_bid` via the
 * SIWE-authenticated Aptos transaction flow. Persists the bid price to
 * localStorage so {@link useFeeRebate} can compute the post-settlement rebate.
 *
 * v0 Beta breaking change from Demo phase: `submit_bid` now takes
 * `(window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)` instead of
 * `(seller_addr, amount_usd)`.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export declare function AuctionBidder(): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AuctionBidder.d.ts.map