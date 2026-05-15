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
