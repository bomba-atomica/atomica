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
 * Mint FAKEETH Payload Builder
 */
export declare function getMintFakeEthPayload(): Promise<InputGenerateTransactionPayloadData>;
/**
 * Mint FAKEETH (10 ETH)
 */
export declare function mintFakeEth(ethAddress: string): Promise<SubmitResult>;
/**
 * Mint FAKEUSD Payload Builder
 */
export declare function getMintFakeUsdPayload(): Promise<InputGenerateTransactionPayloadData>;
/**
 * Mint FAKEUSD (10,000 USD)
 */
export declare function mintFakeUsd(ethAddress: string): Promise<SubmitResult>;
/**
 * Step 2: Mint test tokens (FAKEETH and FAKEUSD)
 * Requires contracts to be deployed
 * @deprecated Use mintFakeEth and mintFakeUsd separately
 */
export declare function requestTestTokens(ethAddress: string): Promise<{
    hash: string;
}>;
/**
 * Check if test token contracts are deployed
 */
export declare function areContractsDeployed(): Promise<boolean>;
/**
 * Legacy function for backward compatibility
 * @deprecated Use requestAPT() and requestTestTokens() separately
 */
export declare function submitFaucet(ethAddress: string): Promise<{
    hash: string;
}>;
export declare function getCreateAuctionPayload(amountEth: bigint, minPrice: bigint, duration: bigint, mpk: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitCreateAuction(ethAddress: string, amountEth: bigint, minPrice: bigint, duration: bigint, mpk: Uint8Array): Promise<SubmitResult>;
export declare function getBidPayload(sellerAddr: string, amountUsd: bigint, _u: Uint8Array, _v: Uint8Array): InputGenerateTransactionPayloadData;
export declare function submitBid(ethAddress: string, sellerAddr: string, amountUsd: bigint, u: Uint8Array, v: Uint8Array): Promise<SubmitResult>;
