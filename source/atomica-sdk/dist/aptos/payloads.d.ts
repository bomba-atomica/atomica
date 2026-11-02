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
 * Build payload for auction::submit_bid (v0 Beta sealed-bid).
 *
 * Parameters match the Phase 3a rewrite from issue #86:
 *   submit_bid(bidder, window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)
 *
 * `uBytes`    — IBE ephemeral point U = rG (48-byte G1, Boneh-Franklin)
 * `ciphertext` — AES-GCM ciphertext of the plaintext price
 * `collateralLockId` — FakeUSD LockReceipt ID held as margin
 *
 * @see docs/architecture/v0-architecture.md §2.5
 */
export declare function getBidPayload(windowId: bigint, pairBcs: Uint8Array, uBytes: Uint8Array, ciphertext: Uint8Array, collateralLockId: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitBid(ethAddress: string, windowId: bigint, pairBcs: Uint8Array, uBytes: Uint8Array, ciphertext: Uint8Array, collateralLockId: Uint8Array): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
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
 * Query `timelock_config::get_mpk` view function.
 *
 * Returns the Master Public Key bytes (compressed G1, 48 bytes) stored
 * on-chain by the timelock / IBE configuration module.
 *
 * Used by `AuctionCreator` and `AuctionBidder` to replace locally generated
 * ephemeral MPKs with the authoritative on-chain value.
 *
 * @see docs/architecture/v0-architecture.md §2 — sealed-bid reveal path
 */
export declare function getMpk(): Promise<Uint8Array>;
/**
 * Query `timelock_config::is_revealed` view function.
 *
 * Returns true once the DKG committee has published the decryption key for
 * the given timelock ID, enabling off-chain bid decryption.
 *
 * @param timelockId - Window / timelock identifier
 * @see docs/architecture/v0-architecture.md §2 — sealed-bid reveal path
 */
export declare function isRevealed(timelockId: bigint): Promise<boolean>;
/**
 * Build payload for `auction::submit_cleartext_and_clear`.
 *
 * Called by `AuctionRevealer` after the DKG key is published and bids have
 * been decrypted off-chain.
 *
 * Parameters:
 *   settler    — signer (derived from the caller's Ethereum address)
 *   window_id  — auction window identifier
 *   pair_bcs   — BCS-encoded Pair struct
 *   cleartexts — plaintext bid prices (u64[]) in bid-submission order
 *
 * @see docs/architecture/v0-architecture.md §2.6
 */
export declare function getSubmitCleartextPayload(windowId: bigint, pairBcs: Uint8Array, cleartexts: bigint[]): InputGenerateTransactionPayloadData;
export declare function submitCleartextAndClear(ethAddress: string, windowId: bigint, pairBcs: Uint8Array, cleartexts: bigint[]): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
