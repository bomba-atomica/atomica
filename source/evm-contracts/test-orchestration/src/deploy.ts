/**
 * Deploy script for EVM contracts to Docker testnet
 *
 * Usage:
 *   bun run src/deploy.ts                    # Deploy to local testnet
 *   bun run src/deploy.ts --network <url>    # Deploy to custom network
 *   bun run src/deploy.ts --test             # Deploy and run E2E tests
 */
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { spawn } from "child_process";
import { resolve as pathResolve, dirname } from "path";
import { parseArgs } from "util";
import { fileURLToPath } from "url";

const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const CONTRACTS_DIR = pathResolve(import.meta.dir, "../src");

interface DeployConfig {
    rpcUrl: string;
    privateKey: string;
    usdcTokenAddr: string;
    runTests: boolean;
}

/**
 * Main deployment function
 */
async function deploy(config: DeployConfig): Promise<void> {
    console.log("═".repeat(60));
    console.log("  Atomica EVM Contracts Deployment");
    console.log("═".repeat(60));

    let testnet: EthereumDockerTestnet | null = null;
    let rpcUrl = config.rpcUrl;

    // Check if we need to start a local testnet
    const isLocal = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1");

    if (isLocal) {
        // Check if testnet is already running
        console.log("\nChecking if Docker testnet is running...");
        const testnetRunning = await _isTestnetRunning(rpcUrl);

        if (!testnetRunning) {
            console.log("Starting Docker testnet...");
            // Change to repo root for SDK to find config
            const originalCwd = process.cwd();
            console.log(`Changing cwd from ${originalCwd} to ${REPO_ROOT}`);
            process.chdir(REPO_ROOT);
            console.log(`New cwd: ${process.cwd()}`);
            try {
                testnet = await EthereumDockerTestnet.start(4);
                await testnet.waitForHealthy(180);
                rpcUrl = testnet.getExecutionRpcUrl();
                console.log(`✓ Testnet started at ${rpcUrl}`);
            } finally {
                process.chdir(originalCwd);
                console.log(`Restored cwd to ${process.cwd()}`);
            }
        } else {
            console.log("✓ Testnet already running at", rpcUrl);
        }
    }

    try {
        // Build contracts first
        console.log("\nBuilding contracts...");
        await _runForge("build", [], { cwd: CONTRACTS_DIR });
        console.log("✓ Contracts built");

        // Run deployment
        console.log("\nDeploying contracts...");
        const env = {
            ...process.env,
            ETH_RPC_URL: rpcUrl,
            ETH_PRIVATE_KEY: config.privateKey,
            USDC_TOKEN_ADDR: config.usdcTokenAddr,
            FOUNDRY_PROFILE: "test",
        };

        await _runForge("script", ["script/Deploy.s.sol", "--rpc-url", rpcUrl, "--broadcast"], {
            cwd: CONTRACTS_DIR,
            env,
        });

        console.log("✓ Contracts deployed");

        // Print deployment info
        console.log("\n" + "═".repeat(60));
        console.log("  DEPLOYMENT COMPLETE");
        console.log("═".repeat(60));
        await _printDeploymentInfo();
        console.log("═".repeat(60));

        // Run tests if requested
        if (config.runTests) {
            console.log("\nRunning E2E tests...");
            await _runE2ETests(rpcUrl);

            console.log("\nRunning genesis integration tests...");
            await _runGenesisTests(rpcUrl);
        }
    } finally {
        if (testnet) {
            console.log("\nTearing down testnet...");
            await testnet.teardown();
            console.log("✓ Testnet torn down");
        }
    }
}

/**
 * Print deployment info from file
 */
async function _printDeploymentInfo(): Promise<void> {
    const deploymentPath = pathResolve(CONTRACTS_DIR, "../test-results/deployment.json");

    try {
        const content = await Bun.file(deploymentPath).text();
        const deployment = JSON.parse(content);

        console.log("\nContract Addresses:");
        console.log(`  Deployer:   ${deployment.Deployer}`);
        console.log(`  Governance: ${deployment.Governance}`);
        console.log(`  DepositBox: ${deployment.DepositBox}`);
        console.log(`  BLSVerifier: ${deployment.BLSVerifier}`);
        console.log(`  Settlement: ${deployment.Settlement}`);
        console.log(`  USDC Token: ${deployment.USDCToken}`);
        console.log(`\nTimestamp: ${deployment.timestamp}`);
    } catch {
        console.log("  (Could not read deployment file)");
    }
}

/**
 * Run E2E tests against deployed contracts
 */
async function _runE2ETests(rpcUrl: string): Promise<void> {
    console.log("\nRunning E2E deployment verification tests...");

    const env = {
        ...process.env,
        ETH_RPC_URL: rpcUrl,
    };

    try {
        await _runForge(
            "test",
            ["--match-path", "test/e2e/*.sol", "--rpc-url", rpcUrl, "--summary"],
            {
                cwd: CONTRACTS_DIR,
                env,
            },
        );

        console.log("✓ E2E tests passed");
    } catch (error) {
        console.error("✗ E2E tests failed:", error);
        throw error;
    }
}

/**
 * Run genesis integration tests
 */
async function _runGenesisTests(rpcUrl: string): Promise<void> {
    console.log("\nRunning genesis access control tests...");

    const env = {
        ...process.env,
        ETH_RPC_URL: rpcUrl,
    };

    try {
        await _runForge(
            "test",
            [
                "--match-path",
                "test/integration/GovernanceGenesis.t.sol",
                "--rpc-url",
                rpcUrl,
                "--summary",
            ],
            {
                cwd: CONTRACTS_DIR,
                env,
            },
        );

        console.log("✓ Genesis integration tests passed");
    } catch (error) {
        console.error("✗ Genesis integration tests failed:", error);
        throw error;
    }
}

/**
 * Check if testnet is running by making a simple RPC call
 */
async function _isTestnetRunning(rpcUrl: string): Promise<boolean> {
    try {
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_blockNumber",
                params: [],
            }),
        });

        if (!response.ok) return false;
        const data = await response.json();
        return data.result !== undefined;
    } catch {
        return false;
    }
}

/**
 * Run a forge command
 */
async function _runForge(
    subcommand: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<void> {
    return new Promise((resolve, reject) => {
        const fullArgs = [subcommand, ...args];
        const proc = spawn("forge", fullArgs, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            stdio: "inherit",
        });

        proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`forge ${subcommand} failed with code ${code}`));
        });

        proc.on("error", reject);
    });
}

// CLI
if (import.meta.main) {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            network: { type: "string", default: "http://localhost:8545" },
            key: { type: "string" },
            "usdc-token": { type: "string", default: "" },
            test: { type: "boolean", default: false },
        },
        strict: true,
    });

    // Default private key for testing (Anvil default)
    const privateKey =
        values.key || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    await deploy({
        rpcUrl: values.network,
        privateKey,
        usdcTokenAddr: values["usdc-token"],
        runTests: values.test,
    });
}

export { deploy };
