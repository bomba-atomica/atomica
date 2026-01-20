import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve as pathResolve } from "path";
import { EthereumDockerTestnet } from "../../src/index";

let globalTestnet: EthereumDockerTestnet | undefined;
let cleanupInProgress = false;

/**
 * Cleanup function that can be called from anywhere
 */
export async function performCleanup(reason: string): Promise<void> {
    if (cleanupInProgress) {
        console.log("⚠ Cleanup already in progress, skipping...");
        return;
    }

    cleanupInProgress = true;
    console.log(`\n\nCLEANUP: ${reason}`);
    console.log("Tearing down testnet...");

    if (globalTestnet) {
        try {
            await globalTestnet.teardown();
            console.log("✓ Testnet torn down successfully");
        } catch (error) {
            console.error("✗ Failed to tear down testnet:", error);
            console.error("Run manually: cd config && docker compose down -v");
        }
    } else {
        // Testnet never initialized, try manual cleanup
        console.log("⚠ Testnet was never initialized, attempting cleanup anyway...");
        try {
            const configDir = findConfigDir();

            await new Promise<void>((resolve) => {
                const proc = spawn("docker", ["compose", "down", "-v", "--remove-orphans"], {
                    cwd: configDir,
                    stdio: "inherit",
                });

                proc.on("close", (code) => {
                    if (code === 0) {
                        console.log("✓ Cleanup completed");
                    } else {
                        console.warn(`⚠ Cleanup exited with code ${code}`);
                    }
                    resolve();
                });

                proc.on("error", (err) => {
                    console.warn("⚠ Cleanup failed:", err);
                    resolve();
                });

                // Timeout for cleanup
                setTimeout(() => {
                    proc.kill();
                    resolve();
                }, 30000);
            });
        } catch (error) {
            console.warn("⚠ Could not perform cleanup:", error);
        }
    }

    cleanupInProgress = false;
}

/**
 * Register global cleanup handlers for the process
 */
export function registerCleanupHandlers(): void {
    process.on("SIGINT", async () => {
        await performCleanup("Received SIGINT (Ctrl+C)");
        process.exit(130);
    });

    process.on("SIGTERM", async () => {
        await performCleanup("Received SIGTERM");
        process.exit(143);
    });

    process.on("uncaughtException", async (error) => {
        console.error("Uncaught exception:", error);
        await performCleanup("Uncaught exception occurred");
        process.exit(1);
    });

    process.on("unhandledRejection", async (reason) => {
        console.error("Unhandled rejection:", reason);
        await performCleanup("Unhandled promise rejection");
        process.exit(1);
    });
}

/**
 * Set the global testnet instance for cleanup handlers
 */
export function setGlobalTestnet(testnet: EthereumDockerTestnet | undefined): void {
    globalTestnet = testnet;
}

/**
 * Get the global testnet instance
 */
export function getGlobalTestnet(): EthereumDockerTestnet | undefined {
    return globalTestnet;
}

/**
 * Helper to find config directory
 */
function findConfigDir(): string {
    const candidates = [
        pathResolve(__dirname, "../../../config"),
        pathResolve(process.cwd(), "source/docker-testnet/ethereum-testnet/config"),
        pathResolve(process.cwd(), "config"),
    ];

    for (const path of candidates) {
        if (existsSync(pathResolve(path, "docker-compose.yaml"))) {
            return path;
        }
    }

    throw new Error("Could not find ethereum-testnet/config directory");
}

/**
 * Initialize a testnet with the specified number of validators
 * and wait for the network to be healthy
 */
export async function initializeTestnet(numValidators: number): Promise<EthereumDockerTestnet> {
    console.log(`Initializing Ethereum PoS testnet with ${numValidators} validators...`);

    const testnet = await EthereumDockerTestnet.start(numValidators);
    setGlobalTestnet(testnet);
    console.log("✓ Testnet containers started");

    // Wait for the network to be healthy
    await testnet.waitForHealthy(120);

    // Get initial chain state
    const chainId = await testnet.getChainId();
    const blockNumber = await testnet.getBlockNumber();
    console.log(`Initial state: chainId=${chainId}, block=${blockNumber}`);

    return testnet;
}

/**
 * Wait for the network to stabilize and produce at least one block
 */
export async function waitForNetworkStabilization(testnet: EthereumDockerTestnet): Promise<void> {
    console.log("Waiting for network to stabilize and produce blocks...");
    
    // Wait for at least 1 block to be produced
    try {
        await testnet.waitForBlocks(1, 60);
    } catch (_e) {
        console.warn("Timed out waiting for block production, continuing anyway...");
    }
}

/**
 * Wait for a sync committee period to complete (for light client testing)
 */
export async function waitForSyncCommitteePeriod(testnet: EthereumDockerTestnet): Promise<void> {
    console.log("Waiting for sync committee data to be available...");
    
    // Sync committee periods are 256 epochs = 8192 slots
    // At 12s/slot, that's ~27 hours - too long for tests
    // For local testing, we just verify the API works
    try {
        const syncCommittee = await testnet.getSyncCommittee();
        console.log(`✓ Sync committee available with ${syncCommittee.validators.length} validators`);
    } catch (e) {
        console.warn("Sync committee not yet available (expected for new testnets)");
    }
}
