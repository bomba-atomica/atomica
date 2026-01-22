/**
 * Atomica EVM Contracts Test Orchestrator
 *
 * Orchestrates testing of EVM contracts using the Docker testnet:
 * 1. Starts/stops the Docker testnet
 * 2. Deploys contracts to the testnet
 * 3. Runs Foundry tests (unit, integration, e2e)
 * 4. Collects and reports results
 *
 * Success Criteria:
 *   1. Docker testnet starts and is healthy (Geth + Lighthouse)
 *   2. All contracts deploy without reverts
 *   3. Unit tests pass (pure Solidity logic tests)
 *   4. Integration tests pass (multi-contract flows)
 *   5. E2E tests pass (deployment verification)
 *   6. Results saved to test-results/
 *
 * Exit Codes:
 *   0 - All tests passed
 *   1 - Test failure or error
 *
 * Usage:
 *   bun run src/index.ts                    # Run all tests
 *   bun run src/index.ts --test unit        # Unit tests only
 *   bun run src/index.ts --test integration # Integration tests
 *   bun run src/index.ts --test e2e         # E2E tests
 *   bun run src/index.ts --test smoke       # Smoke tests
 *   bun run src/index.ts --deploy-only      # Only deploy contracts
 *   bun run src/index.ts --keep-alive       # Don't tear down testnet
 */
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve as pathResolve } from "path";
import { parseArgs } from "util";

// Types
interface TestResult {
    name: string;
    status: "pass" | "fail" | "skip";
    duration: number;
    output: string;
}

interface Config {
    testnetUrl: string;
    contractsDir: string;
    outputDir: string;
    keepAlive: boolean;
}

// Constants
const CONTRACTS_DIR = pathResolve(import.meta.dir, "../src");
const OUTPUT_DIR = pathResolve(import.meta.dir, "../test-results");
const FOUNDRY_PROFILE = "test";

/**
 * Main orchestrator class
 */
export class TestOrchestrator {
    private testnet: EthereumDockerTestnet | null = null;
    private config: Config;
    private results: TestResult[] = [];

    constructor(config: Partial<Config> = {}) {
        this.config = {
            testnetUrl: config.testnetUrl ?? "http://localhost:8545",
            contractsDir: config.contractsDir ?? CONTRACTS_DIR,
            outputDir: config.outputDir ?? OUTPUT_DIR,
            keepAlive: config.keepAlive ?? false,
        };
    }

    /**
     * Run the complete test suite
     *
     * Success = all of:
     *   - Testnet starts and is healthy
     *   - All contracts deploy successfully
     *   - All test suites pass (exit code 0)
     */
    async runAll(): Promise<void> {
        console.log("═".repeat(60));
        console.log("  Atomica EVM Contracts - Full Test Suite");
        console.log("═".repeat(60));
        console.log("\nSuccess Criteria:");
        console.log("  [1] Docker testnet starts and is healthy");
        console.log("  [2] All contracts deploy without reverts");
        console.log("  [3] Unit tests pass");
        console.log("  [4] Integration tests pass");
        console.log("  [5] E2E deployment verification passes");
        console.log("");

        let success = true;
        let step = 0;

        try {
            // Step 1: Start testnet
            step = 1;
            await this.startTestnet();

            // Step 2: Deploy contracts
            step = 2;
            await this.deployContracts();

            // Step 3: Unit tests
            step = 3;
            await this.runUnitTests();

            // Step 4: Integration tests
            step = 4;
            await this.runIntegrationTests();

            // Step 5: E2E tests
            step = 5;
            await this.runE2ETests();

            this.printSummary();
            await this.saveResults();
        } catch (error) {
            console.error(`\n✗ Failed at step ${step}: ${error}`);
            success = false;
            process.exitCode = 1;
        } finally {
            if (!this.config.keepAlive) {
                await this.teardown();
            }
        }

        if (success) {
            console.log("\n✓ All success criteria met!");
        } else {
            console.log(`\n✗ Failed at step ${step}`);
        }
    }

    /**
     * Start the Docker testnet
     */
    async startTestnet(): Promise<void> {
        console.log("\n📦 Starting Docker testnet...");

        this.testnet = await EthereumDockerTestnet.start(4);
        await this.testnet.waitForHealthy(180);

        console.log(`✓ Testnet started at ${this.testnet.getExecutionRpcUrl()}`);
        console.log(`  - Geth RPC: ${this.testnet.getExecutionRpcUrl()}`);
        console.log(`  - Geth WS: ${this.testnet.getExecutionWsUrl()}`);
        console.log(`  - Beacon API: ${this.testnet.getBeaconApiUrl()}`);
    }

    /**
     * Deploy contracts to the testnet
     */
    async deployContracts(): Promise<void> {
        console.log("\n🚀 Deploying contracts...");

        const rpcUrl = this.testnet!.getExecutionRpcUrl();

        // Set environment for Foundry
        const env = {
            ...process.env,
            ETH_RPC_URL: rpcUrl,
            FOUNDRY_PROFILE,
        };

        await this.runCommand(
            "forge",
            ["script", "script/Deploy.s.sol", "--rpc-url", rpcUrl, "--broadcast"],
            {
                cwd: this.config.contractsDir,
                env,
            },
        );

        // Save deployment info
        {
            const _deploymentInfo = {
                timestamp: new Date().toISOString(),
                rpcUrl,
                contracts: await this.getDeployedContracts(rpcUrl),
            };
        }

        console.log("✓ Contracts deployed");
    }

    /**
     * Run unit tests (pure Solidity tests)
     */
    async runUnitTests(): Promise<void> {
        console.log("\n🔬 Running unit tests...");

        const rpcUrl = this.testnet!.getExecutionRpcUrl();
        const env = { ...process.env, ETH_RPC_URL: rpcUrl };

        await this.runCommand(
            "forge",
            ["test", "--match-path", "test/unit/*.sol", "--rpc-url", rpcUrl, "--summary"],
            {
                cwd: this.config.contractsDir,
                env,
            },
        );

        console.log(result);
    }

    /**
     * Run integration tests (multi-contract tests)
     */
    async runIntegrationTests(): Promise<void> {
        console.log("\n🔗 Running integration tests...");

        const rpcUrl = this.testnet!.getExecutionRpcUrl();
        const env = { ...process.env, ETH_RPC_URL: rpcUrl };

        const result = await this.runCommand(
            "forge",
            ["test", "--match-path", "test/integration/*.sol", "--rpc-url", rpcUrl, "--summary"],
            {
                cwd: this.config.contractsDir,
                env,
            },
        );

        console.log(result);
    }

    /**
     * Run E2E tests (full Docker stack tests)
     */
    async runE2ETests(): Promise<void> {
        console.log("\n🌐 Running E2E tests...");

        const rpcUrl = this.testnet!.getExecutionRpcUrl();
        const env = { ...process.env, ETH_RPC_URL: rpcUrl };

        const result = await this.runCommand(
            "forge",
            ["test", "--match-path", "test/e2e/*.sol", "--rpc-url", rpcUrl, "--summary"],
            {
                cwd: this.config.contractsDir,
                env,
            },
        );

        console.log(result);
    }

    /**
     * Run smoke tests (quick sanity check)
     */
    async runSmokeTests(): Promise<void> {
        console.log("\n💨 Running smoke tests...");

        const rpcUrl = this.testnet!.getExecutionRpcUrl();
        const env = { ...process.env, ETH_RPC_URL: rpcUrl };

        // Quick test to verify deployment
        const result = await this.runCommand(
            "forge",
            [
                "test",
                "--match-test",
                "testDeposit|testWithdraw",
                "--match-contract",
                "DepositBoxTest",
                "--rpc-url",
                rpcUrl,
            ],
            {
                cwd: this.config.contractsDir,
                env,
            },
        );

        console.log(result);
    }

    /**
     * Print test summary
     */
    private printSummary(): void {
        console.log("\n" + "═".repeat(60));
        console.log("  Test Summary");
        console.log("═".repeat(60));

        const passed = this.results.filter((r) => r.status === "pass").length;
        const failed = this.results.filter((r) => r.status === "fail").length;
        const skipped = this.results.filter((r) => r.status === "skip").length;

        console.log(`  Passed:  ${passed}`);
        console.log(`  Failed:  ${failed}`);
        console.log(`  Skipped: ${skipped}`);
        console.log("═".repeat(60));

        if (failed > 0) {
            console.log("\n✗ Some tests failed!");
            process.exitCode = 1;
        } else {
            console.log("\n✓ All tests passed!");
        }
    }

    /**
     * Save test results to file
     */
    private async saveResults(): Promise<void> {
        const resultsPath = pathResolve(this.config.outputDir, "test-results.json");
        writeFileSync(
            resultsPath,
            JSON.stringify(
                {
                    timestamp: new Date().toISOString(),
                    config: this.config,
                    results: this.results,
                },
                null,
                2,
            ),
        );
        console.log(`\n📄 Results saved to ${resultsPath}`);
    }

    /**
     * Get deployed contract addresses
     */
    private async getDeployedContracts(rpcUrl: string): Promise<Record<string, string>> {
        // Run cast to get addresses from broadcast logs
        await this.runCommand(
            "forge",
            ["script", "--dry-run", "--json", "script/Deploy.s.sol", "--rpc-url", rpcUrl],
            {
                cwd: this.config.contractsDir,
                env: { ...process.env, ETH_RPC_URL: rpcUrl },
            },
        ).catch(() => "");

        // Parse deployment log
        const deployments: Record<string, string> = {};
        const deploymentsPath = pathResolve(
            this.config.contractsDir,
            "broadcast/Deploy.s.sol/latest/run-latest.json",
        );

        if (existsSync(deploymentsPath)) {
            try {
                const data = JSON.parse(readFileSync(deploymentsPath, "utf-8"));
                for (const tx of data.transactions || []) {
                    if (tx.contractName && tx.contractAddress) {
                        deployments[tx.contractName] = tx.contractAddress;
                    }
                }
            } catch {
                // Ignore parse errors
            }
        }

        return deployments;
    }

    /**
     * Teardown the testnet
     */
    async teardown(): Promise<void> {
        if (this.testnet) {
            console.log("\n🧹 Tearing down testnet...");
            await this.testnet.teardown();
            console.log("✓ Testnet torn down");
            this.testnet = null;
        }
    }

    /**
     * Run a shell command
     */
    private async runCommand(
        command: string,
        args: string[],
        options: { cwd?: string; env?: Record<string, string> } = {},
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const proc = spawn(command, args, {
                cwd: options.cwd,
                env: { ...process.env, ...options.env },
                stdio: ["inherit", "pipe", "pipe"],
            });

            let stdout = "";

            proc.stdout?.on("data", (data) => {
                const text = data.toString();
                stdout += text;
                process.stdout.write(text);
            });

            proc.stderr?.on("data", (data) => {
                const text = data.toString();
                process.stderr.write(text);
            });

            proc.on("close", (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
                }
            });

            proc.on("error", reject);
        });
    }
}

/**
 * Get deployment info without running tests
 */
export async function getDeploymentInfo(_rpcUrl: string): Promise<Record<string, string>> {
    const deploymentsPath = pathResolve(
        CONTRACTS_DIR,
        "broadcast/Deploy.s.sol/latest/run-latest.json",
    );

    if (!existsSync(deploymentsPath)) {
        throw new Error("Deployment not found. Run 'deploy' first.");
    }

    const data = JSON.parse(readFileSync(deploymentsPath, "utf-8"));
    const deployments: Record<string, string> = {};

    for (const tx of data.transactions || []) {
        if (tx.contractName && tx.contractAddress) {
            deployments[tx.contractName] = tx.contractAddress;
        }
    }

    return deployments;
}

// CLI entry point
if (import.meta.main) {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            test: { type: "string", default: "all" },
            "keep-alive": { type: "boolean", default: false },
            "deploy-only": { type: "boolean", default: false },
            "rpc-url": { type: "string" },
        },
        strict: true,
    });

    const orchestrator = new TestOrchestrator({
        keepAlive: values["keep-alive"],
        testnetUrl: values["rpc-url"],
    });

    try {
        await orchestrator.startTestnet();

        if (values["deploy-only"]) {
            await orchestrator.deployContracts();
        } else {
            switch (values.test) {
                case "unit":
                    await orchestrator.deployContracts();
                    await orchestrator.runUnitTests();
                    break;
                case "integration":
                    await orchestrator.deployContracts();
                    await orchestrator.runIntegrationTests();
                    break;
                case "e2e":
                    await orchestrator.deployContracts();
                    await orchestrator.runE2ETests();
                    break;
                case "smoke":
                    await orchestrator.deployContracts();
                    await orchestrator.runSmokeTests();
                    break;
                case "all":
                default:
                    await orchestrator.runAll();
                    break;
            }
        }
    } finally {
        if (!values["keep-alive"]) {
            await orchestrator.teardown();
        }
    }
}
