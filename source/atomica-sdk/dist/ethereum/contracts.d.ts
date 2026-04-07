/**
 * Contract instances and helpers for FakeETH and FakeUSD
 *
 * Provides typed contract instances using ethers.js
 */
import { Contract } from "ethers";
/**
 * Get FakeETH contract instance (read-only)
 */
export declare function getFakeETHContract(): Contract;
/**
 * Get FakeUSD contract instance (read-only)
 */
export declare function getFakeUSDContract(): Contract;
/**
 * Get FakeETH contract instance with signer (for transactions)
 */
export declare function getFakeETHContractWithSigner(): Promise<Contract>;
/**
 * Get FakeUSD contract instance with signer (for transactions)
 */
export declare function getFakeUSDContractWithSigner(): Promise<Contract>;
/**
 * Check if contracts are deployed
 */
export declare function areContractsDeployed(): Promise<boolean>;
/**
 * Get contract metadata for display
 */
export declare function getContractMetadata(): Promise<{
    fakeETH: {
        address: string;
        name: string;
        symbol: string;
        decimals: number;
        maxMint: bigint;
    };
    fakeUSD: {
        address: string;
        name: string;
        symbol: string;
        decimals: number;
        maxMint: bigint;
    };
}>;
