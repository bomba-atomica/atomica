import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { DockerTestnet } from "../src/index";

// Global reference for signal handlers
let globalTestnet: DockerTestnet | undefined;
let cleanupInProgress = false;

/**
 * Cleanup function that can be called from anywhere
 */
async function performCleanup(reason: string): Promise<void> {
    if (cleanupInProgress) {
        console.log("⚠ Cleanup already in progress, skipping...");
        return;
    }
    
    cleanupInProgress = true;
    console.log(`\n\n🛑 ${reason}`);
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
            const { spawn } = await import("child_process");
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

describe("Docker Testnet SDK Verification", () => {
    let testnet: DockerTestnet | undefined;
    const NUM_VALIDATORS = 2; // Start with 2 validators for faster/simpler consensus

    beforeAll(async () => {
        console.log("Initializing testnet...");
        try {
            testnet = await DockerTestnet.new(NUM_VALIDATORS);
            globalTestnet = testnet; // Store in global for signal handlers
            console.log("✓ Testnet initialized successfully");
            
            // Wait a bit longer for validators to start consensus
            console.log("Waiting for consensus to start...");
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10s additional wait
            
            // Check if we're past genesis
            const initialInfo = await testnet.getLedgerInfo(0);
            console.log(`Initial state: epoch=${initialInfo.epoch}, block=${initialInfo.block_height}, version=${initialInfo.ledger_version}`);
            
            if (parseInt(initialInfo.epoch) === 0 && parseInt(initialInfo.block_height) === 0) {
                console.log("⚠ Validators still at genesis, waiting 20 more seconds...");
                await new Promise(resolve => setTimeout(resolve, 20000));
                
                const checkInfo = await testnet.getLedgerInfo(0);
                console.log(`After wait: epoch=${checkInfo.epoch}, block=${checkInfo.block_height}, version=${checkInfo.ledger_version}`);
                
                if (parseInt(checkInfo.epoch) === 0 && parseInt(checkInfo.block_height) === 0) {
                    console.warn("⚠ WARNING: Validators may be stuck at genesis!");
                }
            }
        } catch (error) {
            console.error("✗ Failed to initialize testnet:", error);
            globalTestnet = testnet; // Still store for cleanup
            throw error;
        }
    }, 300000); // 5 min timeout for setup

    afterAll(async () => {
        // Use the shared cleanup function
        await performCleanup("Tests completed");
        globalTestnet = undefined; // Clear global reference
    });

    test("should have correct number of validators", () => {
        expect(testnet).toBeDefined();
        expect(testnet!.getNumValidators()).toBe(NUM_VALIDATORS);
    });

    test("should check validator connectivity and LedgerInfo", async () => {
        expect(testnet).toBeDefined();
        
        console.log("Checking validator connectivity and LedgerInfo...");
        for (let i = 0; i < NUM_VALIDATORS; i++) {
            const url = testnet!.validatorApiUrl(i);
            console.log(`Validator ${i}: ${url}`);

            const info = await testnet!.getLedgerInfo(i);
            console.log(`  Chain ID: ${info.chain_id}`);
            console.log(`  Epoch: ${info.epoch}`);
            console.log(`  Block Height: ${info.block_height}`);
            console.log(`  Ledger Version: ${info.ledger_version}`);
            console.log(`  Node Role: ${info.node_role}`);

            expect(info.chain_id).toBe(4);
            expect(info.node_role).toBe("validator");
            
            // Epoch should be >= 0 (at genesis or beyond)
            expect(parseInt(info.epoch)).toBeGreaterThanOrEqual(0);
            
            // If we're past genesis (epoch > 0), we should have blocks
            if (parseInt(info.epoch) > 0) {
                expect(parseInt(info.block_height)).toBeGreaterThan(0);
            }
        }
        
        console.log("✓ All validators are healthy and responding");
    });

    test("should verify block production", async () => {
        expect(testnet).toBeDefined();
        
        console.log("\nVerifying block production...");
        const initialHeight = await testnet!.getBlockHeight(0);
        console.log(`Initial Height: ${initialHeight}`);

        console.log("Waiting for 5 blocks...");
        await testnet!.waitForBlocks(5, 30); // 5 blocks, 30s timeout

        const finalHeight = await testnet!.getBlockHeight(0);
        console.log(`Final Height: ${finalHeight}`);

        expect(finalHeight).toBeGreaterThan(initialHeight);
        expect(finalHeight - initialHeight).toBeGreaterThanOrEqual(5);
        console.log("✓ Block production verified!");
    }, 60000); // 1 minute timeout

    test("should verify all validators are in sync", async () => {
        expect(testnet).toBeDefined();
        
        console.log("\nVerifying validator synchronization...");
        const ledgerInfos = await Promise.all(
            Array.from({ length: NUM_VALIDATORS }, (_, i) => testnet!.getLedgerInfo(i))
        );

        // All validators should be in the same epoch
        const epochs = ledgerInfos.map(info => info.epoch);
        const uniqueEpochs = new Set(epochs);
        console.log(`Epochs: ${epochs.join(", ")}`);
        expect(uniqueEpochs.size).toBe(1);

        // Block heights should be very close (within a few blocks)
        const blockHeights = ledgerInfos.map(info => parseInt(info.block_height));
        const minHeight = Math.min(...blockHeights);
        const maxHeight = Math.max(...blockHeights);
        const heightDiff = maxHeight - minHeight;
        
        console.log(`Block heights: ${blockHeights.join(", ")} (diff: ${heightDiff})`);
        expect(heightDiff).toBeLessThanOrEqual(5); // Allow small differences due to timing
        
        console.log("✓ All validators are synchronized");
    });
});

/**
 * Helper to find compose directory
 * Duplicated from index.ts to avoid circular dependencies in cleanup
 */
function findComposeDir(): string {
    const { resolve: pathResolve } = require("path");
    const { existsSync } = require("fs");
    
    const candidates = [
        pathResolve(__dirname, "../../config"),
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
