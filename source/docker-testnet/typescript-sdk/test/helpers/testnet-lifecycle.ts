import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve as pathResolve } from "path";
import { DockerTestnet } from "../../src/index";

let globalTestnet: DockerTestnet | undefined;
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
            console.error("Run manually: cd ../config && docker compose down -v");
        }
    } else {
        // Testnet never initialized, try manual cleanup
        console.log("⚠ Testnet was never initialized, attempting cleanup anyway...");
        try {
            const composeDir = findComposeDir();

            await new Promise<void>((resolve) => {
                const proc = spawn("docker", ["compose", "down", "-v", "--remove-orphans"], {
                    cwd: composeDir,
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
    // Install signal handlers BEFORE tests start
    process.on("SIGINT", async () => {
        await performCleanup("Received SIGINT (Ctrl+C)");
        process.exit(130); // Standard exit code for SIGINT
    });

    process.on("SIGTERM", async () => {
        await performCleanup("Received SIGTERM");
        process.exit(143); // Standard exit code for SIGTERM
    });

    // Also handle uncaught exceptions
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
export function setGlobalTestnet(testnet: DockerTestnet | undefined): void {
    globalTestnet = testnet;
}

/**
 * Get the global testnet instance
 */
export function getGlobalTestnet(): DockerTestnet | undefined {
    return globalTestnet;
}

/**
 * Helper to find compose directory
 */
function findComposeDir(): string {
    const candidates = [
        pathResolve(__dirname, "../../../config"),
        pathResolve(process.cwd(), "source/docker-testnet/config"),
        pathResolve(process.cwd(), "docker-testnet/config"),
        pathResolve(process.cwd(), "config"),
    ];

    for (const path of candidates) {
        if (existsSync(pathResolve(path, "docker-compose.yaml"))) {
            return path;
        }
    }

    throw new Error("Could not find docker-testnet/config directory");
}

/**
 * Initialize a testnet with the specified number of validators
 * and wait for consensus to start
 */
export async function initializeTestnet(numValidators: number): Promise<DockerTestnet> {
    console.log(`Initializing testnet with ${numValidators} validators...`);

    const testnet = await DockerTestnet.new(numValidators);
    setGlobalTestnet(testnet);
    console.log("✓ Testnet initialized successfully");

    // Wait for validators to start consensus
    console.log("Waiting for consensus to start...");
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10s additional wait

    // Check if we're past genesis
    const initialInfo = await testnet.getLedgerInfo(0);
    console.log(
        `Initial state: epoch=${initialInfo.epoch}, block=${initialInfo.block_height}, version=${initialInfo.ledger_version}`,
    );

    if (parseInt(initialInfo.epoch) === 0 && parseInt(initialInfo.block_height) === 0) {
        console.log("⚠ Validators still at genesis, waiting 20 more seconds...");
        await new Promise((resolve) => setTimeout(resolve, 20000));

        const checkInfo = await testnet.getLedgerInfo(0);
        console.log(
            `After wait: epoch=${checkInfo.epoch}, block=${checkInfo.block_height}, version=${checkInfo.ledger_version}`,
        );

        if (parseInt(checkInfo.epoch) === 0 && parseInt(checkInfo.block_height) === 0) {
            console.warn("⚠ WARNING: Validators may be stuck at genesis!");
        }
    }

    return testnet;
}

/**
 * Wait for the network to stabilize and produce at least one block
 */
export async function waitForNetworkStabilization(testnet: DockerTestnet): Promise<void> {
    console.log("Waiting for network to stabilize and produce at least 1 block...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
    try {
        await testnet.waitForBlocks(1, 60);
    } catch (e) {
        console.warn("Timed out waiting for block 1, continuing anyway...");
    }
}
