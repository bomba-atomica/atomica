/**
 * Pure Browser SDK Entry Point
 *
 * This module exports ONLY functions/types that work in browser contexts.
 * It does NOT include any Node.js modules (genesis, findAptosBinary, localnet, browser-commands).
 *
 * Use this for:
 * - React components running in browsers
 * - UI tests in browser environment
 * - Any code that needs to run in Chromium
 */
export { Aptos, AptosConfig, Network, } from "@aptos-labs/ts-sdk";
export { constructSIWEMessage, getDerivedAddress, calculateAbstractDigest, serializeSIWEAbstractSignature, serializeSIWEAbstractPublicKey, SIWEAccountAuthenticator, } from "./siwe.js";
export { CONTRACT_ADDR, testSimpleAPTTransfer, requestAPT, getMintFakeEthPayload, getMintFakeUsdPayload, requestTestTokens, areContractsDeployed, submitFaucet, getCreateAuctionPayload, submitCreateAuction, getBidPayload, submitBid, } from "./payloads.js";
export { prepareNativeTransaction, simulateNativeTransaction, submitPreparedTransaction, submitNativeTransaction, } from "./transaction.js";
export { aptos, setAptosInstance } from "./config.js";
export { MockWallet } from "./browser-utils/MockWallet.js";
export { setupBrowserWalletMock } from "./browser-utils/wallet-mock.js";
