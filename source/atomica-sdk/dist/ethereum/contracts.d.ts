/**
 * Contract instances and helpers for FakeETH, FakeUSD, BLSVerifierTestnet, and Settlement.
 *
 * Provides typed contract instances using ethers.js.
 * Settlement bridge factories are used by bridge.ts (issue #112).
 *
 * @see source/atomica-sdk/src/settlement/bridge.ts
 * @see docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 */
import { ethers, Contract } from "ethers";
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
 * Get a BLSVerifierTestnet contract instance with a signer attached.
 *
 * Used by bridge.ts::submitSettlement to call authorizeSettlement.
 * The `blsVerifierAddress` must be the deployed BLSVerifierTestnet address.
 *
 * @param provider  ethers JsonRpcProvider (Node.js / relayer script)
 * @param signer    ethers Wallet or JsonRpcSigner — must be the trustedRelayer EOA
 * @param blsVerifierAddress  Deployed BLSVerifierTestnet contract address
 * @returns Contract instance with signer
 * @see docs/architecture/v0-architecture.md §3.2
 */
export declare function getBLSVerifierTestnetContract(provider: ethers.JsonRpcProvider, signer: ethers.Signer, blsVerifierAddress: string): Contract;
/**
 * Get a Settlement contract instance (read-only) for querying state.
 *
 * @param provider         ethers JsonRpcProvider
 * @param settlementAddress Deployed Settlement.sol contract address
 * @returns Read-only Contract instance
 * @see docs/architecture/v0-architecture.md §3.2
 */
export declare function getSettlementContract(provider: ethers.JsonRpcProvider, settlementAddress: string): Contract;
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
