/**
 * Clean up script - stops Docker testnet and clears deployment artifacts
 *
 * Usage: bun run src/clean.ts
 */
import { EthereumDockerTestnet } from "../../../docker-testnet/ethereum-testnet/typescript-sdk/dist/index.js";
import { spawn } from "child_process";
import { resolve as pathResolve } from "path";

const CONTRACTS_DIR = pathResolve(import.meta.dir, "../src");
const ETHEREUM_TESTNET_CONFIG_DIR = pathResolve(import.meta.dir, "../../../docker-testnet/ethereum-testnet/config");

async function clean(keepTestnet: boolean = false): Promise<void> {
    console.log("Cleaning up...");

    if (!keepTestnet) {
        console.log("Stopping Docker testnet...");
        try {
            const testnet = await EthereumDockerTestnet.start(0, ETHEREUM_TESTNET_CONFIG_DIR);
            await testnet.teardown();
            console.log("✓ Testnet stopped");
        } catch {
            console.log("⚠ Could not stop testnet (may not be running)");
        }
    }

    console.log("Clearing deployment artifacts...");
    await clearDeploymentArtifacts();

    console.log("✓ Cleanup complete");
}

async function clearDeploymentArtifacts(): Promise<void> {
    const dirs = [
        pathResolve(CONTRACTS_DIR, "broadcast"),
        pathResolve(CONTRACTS_DIR, "out"),
        pathResolve(CONTRACTS_DIR, "cache"),
        pathResolve(CONTRACTS_DIR, "test-results"),
    ];

    for (const dir of dirs) {
        try {
            await runCommand("rm", ["-rf", dir]);
            console.log(`  Cleared: ${dir}`);
        } catch {
            console.log(`  Skipped: ${dir}`);
        }
    }
}

async function runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: "inherit" });

        proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${command} failed with code ${code}`));
        });

        proc.on("error", reject);
    });
}

// CLI
if (import.meta.main) {
    const { values } = Bun.parseArgs({
        args: process.argv.slice(2),
        options: {
            "keep-testnet": { type: "boolean", default: false },
        },
        strict: true,
    });

    await clean(values["keep-testnet"]);
}

export { clean };
