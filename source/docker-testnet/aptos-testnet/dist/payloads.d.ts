import type { InputGenerateTransactionPayloadData } from "@atomica/sdk";
export { CONTRACT_ADDR } from "./config.js";
import { type SubmitResult } from "./transaction.js";
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
 * Step 1: Request APT tokens from faucet for gas
 */
export declare function requestAPT(ethAddress: string): Promise<{
    hash: string;
}>;
/**
 * Check if core auction contracts are deployed on Aptos.
 * Fake token minting happens on Ethereum — there are no fake_eth/fake_usd Move modules.
 */
export declare function areContractsDeployed(): Promise<boolean>;
/**
 * Fund account with APT gas tokens.
 */
export declare function submitFaucet(ethAddress: string): Promise<{
    hash: string;
}>;
/**
 * @deprecated Fake tokens mint on Ethereum — this no-op stub remains for
 * backward-compatible callers during the Phase 1→2 transition.
 */
export declare function requestTestTokens(_ethAddress: string): Promise<{
    hash: string;
}>;
export declare function getCreateAuctionPayload(amountEth: bigint, minPrice: bigint, duration: bigint, mpk: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitCreateAuction(ethAddress: string, amountEth: bigint, minPrice: bigint, duration: bigint, mpk: Uint8Array): Promise<SubmitResult>;
export declare function getBidPayload(sellerAddr: string, amountUsd: bigint, _u: Uint8Array, _v: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitBid(ethAddress: string, sellerAddr: string, amountUsd: bigint, u: Uint8Array, v: Uint8Array): Promise<SubmitResult>;
