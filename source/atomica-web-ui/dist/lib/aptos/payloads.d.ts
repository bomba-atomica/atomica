import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import type { LockedBalanceProof } from "../ethereum/proofs/generator";
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
export declare function getCreateAuctionPayload(lockId: Uint8Array, minPrice: bigint, duration: bigint, mpk: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitCreateAuction(ethAddress: string, lockId: Uint8Array, minPrice: bigint, duration: bigint, mpk: Uint8Array): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
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
 * Build payload for fake_eth::mint_from_lock.
 *
 * Entry function: mint_from_lock(account: &signer, lock_id: vector<u8>)
 * Used in Demo/MVP phases. Production may replace with receipt-direct-escrow.
 */
export declare function getMintFakeEthPayload(lockId: Uint8Array): InputGenerateTransactionPayloadData;
export declare function getBidPayload(sellerAddr: string, amountUsd: bigint, _u: Uint8Array, _v: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitBid(ethAddress: string, sellerAddr: string, amountUsd: bigint, u: Uint8Array, v: Uint8Array): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
//# sourceMappingURL=payloads.d.ts.map