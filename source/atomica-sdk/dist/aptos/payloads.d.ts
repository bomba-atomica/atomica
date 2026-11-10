import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import type { LockedBalanceProof } from "../ethereum/proofs/generator.js";
/**
 * Sanity Test: Simple APT transfer using MetaMask signature
 * This tests ONLY the signature verification without any custom contracts
 */
export declare function testSimpleAPTTransfer(ethAddress: string, customRecipient?: string): Promise<{
    success: boolean;
    hash: string;
    error?: undefined;
} | {
    success: boolean;
    error: string;
    hash?: undefined;
}>;
/**
 * Step 1: Request APT tokens for gas via web funding API
 */
export declare function requestAPT(ethAddress: string): Promise<{
    hash: string;
}>;
/**
 * Check if auction contracts are deployed
 */
export declare function areContractsDeployed(): Promise<boolean>;
export declare function areCoreContractsDeployed(): Promise<boolean>;
/**
 * Build payload for auction::create_auction (v0 Beta global-registry).
 *
 * Parameters match the Phase 3a rewrite from issue #86:
 *   create_auction(seller, window_id, pair_bcs, lock_id, min_price, mpk_bytes)
 *
 * `pairBcs` is the BCS-encoded Pair struct; callers can compute it with
 * `bcs.serialize` or pass a pre-encoded byte array.
 *
 * @see docs/architecture/v0-architecture.md §2.3
 */
export declare function getCreateAuctionPayload(windowId: bigint, pairBcs: Uint8Array, lockId: Uint8Array, minPrice: bigint, mpkBytes: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitCreateAuction(ethAddress: string, windowId: bigint, pairBcs: Uint8Array, lockId: Uint8Array, minPrice: bigint, mpkBytes: Uint8Array): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
/**
 * Build payload for lock_receipt::register_ethereum_lock<FakeETH>.
 *
 * Serialises directly from LockedBalanceProof, matching the Move entry function:
 *   register_ethereum_lock<Asset>(account, block_number, block_hash, state_root,
 *     contract_address, user_address, token_address, storage_key, storage_value,
 *     account_proof, storage_proof)
 *
 * Do NOT use serializeProofForAptos() — it is missing block_number, user_address,
 * token_address and returns wrong types.
 */
export declare function getRegisterLockPayload(proof: LockedBalanceProof): InputGenerateTransactionPayloadData;
/**
 * Build payload for auction::submit_bid (V2 bid wrapper).
 *
 *   submit_bid(bidder, window_id, pair_bcs, ciphertext, commitment,
 *              collateral_lock_id, quantity)
 *
 * `ciphertext` is the V2 bid ciphertext `BCS(vk, U, nonce, C, sig)`. The contract
 * builds the associated data on chain (see `buildBidAd`) and aborts unless
 * `ibe::verify_bid_ct` accepts the ciphertext for it.
 * `commitment` is the 32-byte price commitment (see `computeBidCommitment`).
 * `collateralLockId` is the FakeUSD LockReceipt ID held as margin.
 * `quantity` is the bid quantity in wei (u256).
 *
 * @see atomica/docs/decisions/auction-v2-bid-wrapper.md
 */
export declare function getBidPayload(windowId: bigint, pairBcs: Uint8Array, ciphertext: Uint8Array, commitment: Uint8Array, collateralLockId: Uint8Array, quantity: bigint): InputGenerateTransactionPayloadData;
export declare function submitBid(ethAddress: string, windowId: bigint, pairBcs: Uint8Array, ciphertext: Uint8Array, commitment: Uint8Array, collateralLockId: Uint8Array, quantity: bigint): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
/**
 * Build payload for auction::settle (v0 Beta global-registry).
 *
 * Parameters match the Phase 3a rewrite from issue #86:
 *   settle(caller, window_id, pair_bcs)
 *
 * @see docs/architecture/v0-architecture.md §2.7
 */
export declare function getSettlePayload(windowId: bigint, pairBcs: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitSettle(ethAddress: string, windowId: bigint, pairBcs: Uint8Array): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
/**
 * Query `auction::is_settled` view function (v0 Beta window-keyed).
 *
 * Returns true if the auction window identified by (windowId, pairBcs) has
 * been settled. Returns false if no window exists.
 *
 * @see docs/architecture/v0-architecture.md §2.3
 */
export declare function isSettled(windowId: bigint, pairBcs: Uint8Array): Promise<boolean>;
/**
 * Query `auction::get_settlement` view function (v0 Beta window-keyed).
 *
 * Returns { clearingPrice, totalFilled } after settlement.
 * Aborts if no window exists for (windowId, pairBcs).
 *
 * @see docs/architecture/v0-architecture.md §2.7
 */
export declare function getSettlement(windowId: bigint, pairBcs: Uint8Array): Promise<{
    clearingPrice: bigint;
    totalFilled: bigint;
}>;
/**
 * A single bid result entry returned by `auction::get_bid_results`.
 *
 * Mirrors the on-chain `auction::BidResult` struct used to join AuctionSettled
 * events with per-winner Ethereum addresses and fill amounts.
 *
 * @see docs/architecture/v0-architecture.md §2.9 — AuctionSettled event
 * @see bridge.ts RISK 1 — winners/fills join gap
 */
export interface BidResult {
    /** Aptos address (32-byte hex) of the bidder. */
    bidder: string;
    /** Fill amount in base-token wei (0 for losers). */
    fillAmount: bigint;
    /** True if this bidder won and was filled at the clearing price. */
    isWinner: boolean;
}
/**
 * Query `auction::get_bid_results` view function (issue #112).
 *
 * Returns the full list of bid results for a settled auction window.
 * Used by the settlement relayer to derive per-winner Ethereum addresses
 * and fill amounts for `BLSVerifierTestnet::authorizeSettlement`.
 *
 * The relayer must:
 *   1. Filter results where `is_winner == true`.
 *   2. Convert each winner's Aptos address to Ethereum via `aptosToEthereumAddress`.
 *   3. Use `fill_amount` from each winning BidResult as the `fills` entry.
 *
 * NOTE: This function will return an empty array if called before settlement
 * is finalized for the given window/pair combination.
 *
 * @param windowId - Auction window ID
 * @param pairBcs  - BCS-encoded Pair struct
 * @returns Array of {@link BidResult} entries (empty if not yet settled).
 *
 * @see docs/architecture/v0-architecture.md §2.9
 * @see bridge.ts — submitSettlement join step
 */
export declare function getBidResults(windowId: bigint, pairBcs: Uint8Array): Promise<BidResult[]>;
/**
 * Per-bidder rebate entry returned by the `auction::compute_rebates` view function.
 *
 * @see docs/architecture/v0-architecture.md §2 (fee/rebate section)
 */
export interface Rebate {
    /** Aptos address of the bidder. */
    bidder: string;
    /** Rebate amount in quote-token micro-units. 0 until Phase 3c impl. */
    amount: bigint;
}
/**
 * Query `auction::compute_rebates` view function (Phase 3c scaffold).
 *
 * Returns a `Rebate[]` for all bidders in the specified window based on their
 * distance to the uniform clearing price.  Coefficient calibration is TBD in v0;
 * the Move body aborts with E_NOT_IMPLEMENTED (99) until Phase 3c impl lands.
 *
 * Callers must handle the `E_NOT_IMPLEMENTED` abort gracefully — this function
 * returns `null` when the on-chain function is not yet implemented, allowing
 * the UI to show a "pending" state.
 *
 * @param windowId      - Auction window ID
 * @param pairBcs       - BCS-encoded Pair struct
 * @param clearingPrice - Uniform clearing price from `get_settlement`
 * @returns Array of {@link Rebate} entries, or `null` if not yet implemented.
 *
 * @see docs/architecture/v0-architecture.md §2 (fee/rebate section)
 */
export declare function fetchRebates(windowId: bigint, pairBcs: Uint8Array, clearingPrice: bigint): Promise<Rebate[] | null>;
/**
 * Build payload for fake_eth::mint (Demo-phase winner payout).
 *
 * Entry function: mint(account: &signer, amount: u64)
 * In Demo phase, `mint` is a public faucet anyone can call. It mints FakeETH
 * to the signer's own Aptos account. The winner calls this directly via SIWE
 * to self-mint the payout amount.
 */
export declare function getClaimMintPayload(amount: bigint): InputGenerateTransactionPayloadData;
/**
 * Submit a Demo-phase claim: the winner self-mints FakeETH via SIWE.
 */
export declare function submitClaim(ethAddress: string, amount: bigint): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
/**
 * Query `fake_eth::balance` view function.
 * Returns the FakeETH FA balance for the given Aptos address.
 */
export declare function getFakeEthBalance(ownerAddr: string): Promise<bigint>;
/**
 * Query `timelock::get_mpk` view function.
 *
 * Returns the master public key of the current epoch (compressed G2, 96 bytes)
 * stored by the registry.
 *
 * @see atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md section 7
 */
export declare function getMpk(): Promise<Uint8Array>;
/**
 * Query `timelock::is_revealed` view function.
 *
 * Returns true once the verified decryption key of the timelock is on chain,
 * enabling off-chain bid decryption.
 *
 * @param timelockId - Timelock identifier
 */
export declare function isRevealed(timelockId: bigint): Promise<boolean>;
/** Registry status of a timelock (`timelock::get_status`). */
export type TimelockStatus = "pending" | "revealed" | "expired";
/** Why a timelock expired (`timelock::get_expiry_reason`). */
export type TimelockExpiryReason = "epoch-ended" | "reveal-window-elapsed" | "key-check-failed";
/**
 * Query `timelock::get_status` and, for an expired timelock,
 * `timelock::get_expiry_reason`.
 *
 * An expired window can never open its bids. Call `refund_expired_window`.
 */
export declare function getTimelockStatus(timelockId: bigint): Promise<{
    status: TimelockStatus;
    reason?: TimelockExpiryReason;
}>;
/**
 * Build payload for `auction::submit_cleartext_and_clear`.
 *
 * Called after the timelock status is `Revealed` and bids were decrypted off
 * chain with the revealed key. Index-aligned to the window's bids.
 * `cleartexts[i]` and `salts[i]` open bid `i`. An empty salt skips bid `i`.
 * The contract checks every opening against the commitment made at submission,
 * so a relayer cannot change a price.
 *
 * @see atomica/docs/decisions/auction-v2-bid-wrapper.md
 */
export declare function getSubmitCleartextPayload(windowId: bigint, pairBcs: Uint8Array, cleartexts: bigint[], salts: Uint8Array[]): InputGenerateTransactionPayloadData;
export declare function submitCleartextAndClear(ethAddress: string, windowId: bigint, pairBcs: Uint8Array, cleartexts: bigint[], salts: Uint8Array[]): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
/** Build payload for `auction::open_bid` (one bid, any caller). */
export declare function getOpenBidPayload(windowId: bigint, pairBcs: Uint8Array, bidIndex: bigint, price: bigint, salt: Uint8Array): InputGenerateTransactionPayloadData;
export declare function openBid(ethAddress: string, windowId: bigint, pairBcs: Uint8Array, bidIndex: bigint, price: bigint, salt: Uint8Array): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
/**
 * Build payload for `auction::finalize_reveal`: close openings once every bid
 * is open or the opening window ended. Unopened bids become invalid.
 */
export declare function getFinalizeRevealPayload(windowId: bigint, pairBcs: Uint8Array): InputGenerateTransactionPayloadData;
export declare function finalizeReveal(ethAddress: string, windowId: bigint, pairBcs: Uint8Array): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
/**
 * Build payload for `auction::refund_expired_window`: release every receipt of
 * a window whose timelock expired (any reason).
 */
export declare function getRefundExpiredWindowPayload(windowId: bigint, pairBcs: Uint8Array): InputGenerateTransactionPayloadData;
export declare function refundExpiredWindow(ethAddress: string, windowId: bigint, pairBcs: Uint8Array): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
