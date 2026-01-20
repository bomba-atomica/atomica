/**
 * Testnet lifecycle helper for integration tests
 *
 * Uses ethereum-docker-testnet SDK to start/stop local Ethereum testnet
 * Provides RPC URL and test accounts for integration tests
 */

import type { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";

let testnet: EthereumDockerTestnet | undefined;

/**
 * Start Ethereum Docker testnet and wait for it to be healthy
 */
export async function startTestnet(): Promise<void> {
    // Dynamic import to avoid loading SDK in unit tests
    const { EthereumDockerTestnet } = await import("@atomica/ethereum-docker-testnet");

    console.log("Starting Ethereum testnet...");
    testnet = await EthereumDockerTestnet.start(4); // 4 validators

    console.log("Waiting for testnet to become healthy...");
    await testnet.waitForHealthy(120); // 2 minute timeout

    console.log("✓ Testnet ready");
}

/**
 * Stop and cleanup Ethereum Docker testnet
 */
export async function stopTestnet(): Promise<void> {
    if (testnet) {
        console.log("Stopping testnet...");
        await testnet.teardown();
        testnet = undefined;
        console.log("✓ Testnet stopped");
    }
}

/**
 * Get RPC URL for the running testnet
 */
export function getRpcUrl(): string {
    if (!testnet) {
        throw new Error("Testnet not started. Call startTestnet() first.");
    }
    return testnet.getExecutionRpcUrl();
}

/**
 * Get pre-funded test accounts from the testnet
 */
export function getTestAccounts(): Array<{ address: string; privateKey: string | null }> {
    if (!testnet) {
        throw new Error("Testnet not started. Call startTestnet() first.");
    }
    return testnet.getTestAccounts();
}

/**
 * Get the testnet instance (for advanced usage)
 */
export function getTestnet(): EthereumDockerTestnet {
    if (!testnet) {
        throw new Error("Testnet not started. Call startTestnet() first.");
    }
    return testnet;
}

/**
 * Wait for N blocks to be produced
 */
export async function waitForBlocks(count: number): Promise<void> {
    if (!testnet) {
        throw new Error("Testnet not started");
    }
    await testnet.waitForBlocks(count, 60); // 60 second timeout
}

/**
 * Get current block number from testnet
 */
export async function getBlockNumber(): Promise<number> {
    if (!testnet) {
        throw new Error("Testnet not started");
    }
    return await testnet.getBlockNumber();
}
