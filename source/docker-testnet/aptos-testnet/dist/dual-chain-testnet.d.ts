/**
 * Dual-chain testnet lifecycle for browser test commands.
 *
 * Runs in Node.js (browser command handlers). Starts both an Ethereum Docker
 * testnet and an Aptos Docker testnet, deploys all contracts, funds test
 * accounts, and returns JSON-serialisable connection info.
 *
 * This mirrors setupDualChainFixture() from the meta-test helpers but returns
 * plain data instead of live SDK handles, so it can cross the RPC boundary to
 * the browser.
 */
export interface DualChainTestnetInfo {
    eth: {
        rpcUrl: string;
        chainId: number;
        contracts: {
            fakeETH: string;
            fakeUSD: string;
            lockBox: string;
        };
        /** Deployer / seller private key */
        deployerPrivateKey: string;
        deployerAddress: string;
        /** Bidder account (testnet account 1) */
        bidderPrivateKey: string;
        bidderAddress: string;
    };
    aptos: {
        nodeUrl: string;
        moduleAddress: string;
        deployerPrivateKey: string;
    };
}
/**
 * Start both testnets, deploy all contracts, fund seller and bidder.
 *
 * Idempotent — if called again while a fixture is live the existing info is
 * reconstructed from the running instances.
 */
export declare function setupDualChainTestnet(): Promise<DualChainTestnetInfo>;
/**
 * Tear down both testnets.
 */
export declare function teardownDualChainTestnet(): Promise<void>;
