/**
 * Transaction helpers for Ethereum testnet
 *
 * Handles minting FakeETH and FakeUSD via MetaMask
 */
import { ethers } from "ethers";
export interface TransactionResult {
    hash: string;
    from: string;
    to: string;
    wait: () => Promise<ethers.TransactionReceipt | null>;
}
/**
 * Mint FakeETH tokens
 * @param amount Amount to mint in wei (e.g., 10n * 10n**18n for 10 ETH)
 * @returns Transaction result
 */
export declare function mintFakeETH(amount: bigint): Promise<TransactionResult>;
/**
 * Mint FakeUSD tokens
 * @param amount Amount to mint in smallest units (e.g., 10_000n * 10n**6n for 10,000 USD)
 * @returns Transaction result
 */
export declare function mintFakeUSD(amount: bigint): Promise<TransactionResult>;
/**
 * Mint 10 FakeETH (convenience function)
 */
export declare function mint10FakeETH(): Promise<TransactionResult>;
/**
 * Mint 10,000 FakeUSD (convenience function)
 */
export declare function mint10kFakeUSD(): Promise<TransactionResult>;
/**
 * Request FakeETH and FakeUSD from the server-side faucet.
 * Uses the deployer account to mint tokens on behalf of the user
 * so the user doesn't need any ETH to pay gas.
 */
export declare function requestEthTokens(recipientAddress: string): Promise<{
    ethTxHash: string;
    usdTxHash: string;
}>;
/**
 * Wait for a transaction to be mined
 * @param txHash Transaction hash
 * @param confirmations Number of confirmations to wait for (default: 1)
 * @returns Transaction receipt
 */
export declare function waitForTransaction(txHash: string, confirmations?: number): Promise<ethers.TransactionReceipt | null>;
/**
 * Get transaction status
 * @param txHash Transaction hash
 * @returns Transaction receipt or null if not mined
 */
export declare function getTransactionStatus(txHash: string): Promise<ethers.TransactionReceipt | null>;
/**
 * Estimate gas for minting FakeETH
 */
export declare function estimateMintFakeETHGas(amount: bigint): Promise<bigint>;
/**
 * Estimate gas for minting FakeUSD
 */
export declare function estimateMintFakeUSDGas(amount: bigint): Promise<bigint>;
