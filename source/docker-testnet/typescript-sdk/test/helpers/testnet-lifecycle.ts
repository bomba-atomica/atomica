import { DockerTestnet } from "../../src/index";

let globalTestnet: DockerTestnet | undefined;
let cleanupInProgress = false;

export async function performCleanup(reason: string): Promise<void> {
    if (cleanupInProgress) {
        console.log("⚠ Cleanup already in progress, skipping...");
        return;
    }

    cleanupInProgress = true;
    console.log(`\n\nCLEANUP: ${reason}`);

    if (globalTestnet) {
        try {
            console.log("Tearing down testnet...");
            await globalTestnet.teardown();
            console.log("✓ Testnet torn down successfully");
        } catch (error: any) {
            console.error("✗ Failed to tear down testnet:", error);
            console.error("Run manually: cd config && docker compose down -v");
        }
    } else {
        console.log("No global testnet instance to clean up.");
    }

    cleanupInProgress = false;
}

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

export function setGlobalTestnet(testnet: DockerTestnet | undefined): void {
    globalTestnet = testnet;
}

export async function initializeTestnet(numValidators: number): Promise<DockerTestnet> {
    const testnet = await DockerTestnet.new(numValidators);
    setGlobalTestnet(testnet);
    return testnet;
}

export async function waitForNetworkStabilization(testnet: DockerTestnet): Promise<void> {
    console.log("Waiting for network to stabilize and produce blocks...");
    try {
        await testnet.waitForBlocks(1, 60);
    } catch {
        console.warn("Timed out waiting for block production, continuing anyway...");
    }
}
