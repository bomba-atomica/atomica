/**
 * Atomica EVM Contracts Test Orchestrator
 *
 * Orchestrates testing of EVM contracts using the Docker testnet:
 * 1. Starts/stops the Docker testnet
 * 2. Deploys the tokens and LockBox (script/DeployLockBox.s.sol) to the testnet
 * 3. Runs Foundry tests (unit, integration)
 * 4. Collects and reports results
 *
 * Success Criteria:
 *   1. Docker testnet starts and is healthy (Geth + Lighthouse)
 *   2. All contracts deploy without reverts
 *   3. Unit tests pass (pure Solidity logic tests)
 *   4. Integration tests pass (multi-contract flows)
 *   5. Results saved to test-results/
 *
 * Exit Codes:
 *   0 - All tests passed
 *   1 - Test failure or error
 *
 * Usage:
 *   bun run src/index.ts                    # Run all tests
 *   bun run src/index.ts --test unit        # Unit tests only
 *   bun run src/index.ts --test integration # Integration tests
 *   bun run src/index.ts --deploy-only      # Only deploy contracts
 *   bun run src/index.ts --keep-alive       # Don't tear down testnet
 */
import { EthereumDockerTestnet } from "../../../docker-testnet/ethereum-testnet/typescript-sdk/dist/index.js";
import { ETHEREUM_DEPLOYER_PRIVATE_KEY } from "../../../shared/test-constants";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
const CONTRACTS_DIR = pathResolve(import.meta.dir, "../..");
const OUTPUT_DIR = pathResolve(import.meta.dir, "../test-results");
const FOUNDRY_PROFILE = "test";
/** Stand-in light client: this testnet has no Aptos light client on Ethereum. */
const STAND_IN_LIGHT_CLIENT = "0x000000000000000000000000000000000000dEaD";
/** Stand-in Aptos package address for the LockBox outcome type tag. */
const STAND_IN_ATOMICA_ADDRESS = "0x" + "00".repeat(31) + "01";

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
        // The CLI entry point and runAll() both call this. Start only once:
        // a second start would restart the Docker chain or collide with anvil.
        if (this.testnet) return;

        console.log("\n📦 Starting Ethereum testnet (ETH_BACKEND, default docker)...");

        this.testnet = await EthereumDockerTestnet.start(4);
        await this.testnet.waitForHealthy(180);

        if (this.testnet.getBackend() === "docker") {
            console.log("Waiting 30 seconds for chain to stabilize...");
            await new Promise((resolve) => setTimeout(resolve, 30000));
        }

        console.log(
            `✓ Testnet (${this.testnet.getBackend()}) started at ${this.testnet.getExecutionRpcUrl()}`,
        );
        console.log(`  - RPC: ${this.testnet.getExecutionRpcUrl()}`);
        console.log(`  - WS: ${this.testnet.getExecutionWsUrl()}`);
        if (this.testnet.hasBeaconApi()) {
            console.log(`  - Beacon API: ${this.testnet.getBeaconApiUrl()}`);
        }
    }

    /**
     * Deploy FakeETH, FakeUSD and LockBox with script/DeployLockBox.s.sol.
     *
     * This testnet has no Aptos light client, so LockBox gets a stand-in client address:
     * outcome recording reverts and every lock goes home by reclaim.
     */
    async deployContracts(): Promise<void> {
        console.log("\n🚀 Deploying contracts...");

        const rpcUrl = this.testnet!.getExecutionRpcUrl();

        // Set environment for Foundry
        const env = {
            ...process.env,
            ETH_RPC_URL: rpcUrl,
            PRIVATE_KEY: ETHEREUM_DEPLOYER_PRIVATE_KEY,
            LIGHT_CLIENT: STAND_IN_LIGHT_CLIENT,
            ATOMICA_ADDRESS: STAND_IN_ATOMICA_ADDRESS,
            FOUNDRY_PROFILE,
        };

        await this.runCommand(
            "forge",
            [
                "script",
                "script/DeployLockBox.s.sol:DeployLockBox",
                "--rpc-url",
                rpcUrl,
                "--broadcast",
            ],
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

        const result = await this.runCommand(
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
        // Ensure directory exists
        if (!existsSync(this.config.outputDir)) {
            mkdirSync(this.config.outputDir, { recursive: true });
        }
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
    private async getDeployedContracts(_rpcUrl: string): Promise<Record<string, string>> {
        // Run script without broadcast to get addresses from logs if needed
        // but we already have them from the broadcast run

        // Parse deployment log
        const deployments: Record<string, string> = {};
        const deploymentsPath = pathResolve(
            this.config.contractsDir,
            "broadcast/DeployLockBox.s.sol/latest/run-latest.json",
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
        // Ensure foundry bin is in PATH
        const foundryBin = pathResolve(process.env.HOME || "", ".foundry/bin");
        const path = `${foundryBin}:${process.env.PATH}`;

        return new Promise((resolve, reject) => {
            const proc = spawn(command, args, {
                cwd: options.cwd,
                env: { ...process.env, ...options.env, PATH: path },
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
        "broadcast/DeployLockBox.s.sol/latest/run-latest.json",
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
