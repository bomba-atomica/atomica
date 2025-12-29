import { spawn } from "child_process";
import { resolve as pathResolve } from "path";
import { existsSync, readFileSync, cpSync, mkdirSync } from "fs";
import * as dotenv from "dotenv";
import { AptosAccount, HexString, AptosClient, CoinClient } from "aptos";
import { generateGenesis } from "./genesis";

/** Base API port for validators (incremented for each validator) */
const BASE_API_PORT = 8080;

/** Base validator network port for inter-validator communication */
const BASE_VALIDATOR_PORT = 6180;

/** Docker binary path - assumed to be in PATH or standard location */
const DOCKER_BIN = "docker";

/** Debug logging - controlled by DEBUG_TESTNET env var */
const DEBUG = process.env.DEBUG_TESTNET === "1" || process.env.DEBUG_TESTNET === "true";

function debug(message: string, data?: Record<string, unknown>): void {
    if (DEBUG) {
        const timestamp = new Date().toISOString();
        if (data) {
            console.log(`[DEBUG ${timestamp}] ${message}`, JSON.stringify(data, null, 2));
        } else {
            console.log(`[DEBUG ${timestamp}] ${message}`);
        }
    }
}

/**
 * Load environment variables
 */
function loadEnvVariables(): Record<string, string> {
    // Try to load .env from current working directory
    const cwdEnv = pathResolve(process.cwd(), ".env");
    if (existsSync(cwdEnv)) {
        return dotenv.parse(readFileSync(cwdEnv));
    }
    return {};
}

/**
 * Ledger info response from validator REST API
 */
export interface LedgerInfo {
    chain_id: number;
    epoch: string;
    ledger_version: string;
    oldest_ledger_version: string;
    ledger_timestamp: string;
    node_role: string;
    oldest_block_height: string;
    block_height: string;
    git_hash?: string;
}

/**
 * Docker Testnet - Automatic setup and teardown
 */
export class DockerTestnet {
    private composeDir: string;
    private numValidators: number;
    private validatorUrls: string[];

    private constructor(
        composeDir: string,
        numValidators: number,
        validatorUrls: string[],
    ) {
        this.composeDir = composeDir;
        this.numValidators = numValidators;
        this.validatorUrls = validatorUrls;
    }

    /**
     * Create a fresh, isolated Docker testnet with N validators
     *
     * @param numValidators Number of validators (1-7)
     * @param options Optional configuration
     * @returns DockerTestnet instance
     *
     * @example
     * // Use published image (default)
     * const testnet = await DockerTestnet.new(4);
     */
    static async new(
        numValidators: number,
        _options?: {
            // Options reserved for future use
        },
    ): Promise<DockerTestnet> {
        if (numValidators < 1 || numValidators > 7) {
            throw new Error(
                `numValidators must be between 1 and 7, got ${numValidators}`,
            );
        }

        const composeDir = DockerTestnet.findComposeDir();
        debug("Found compose directory", { composeDir });

        try {
            await DockerTestnet.ensureDockerRunning();
            debug("Docker daemon is running");
        } catch (error: any) {
            // Rethrow with a clean message if possible, or just let it bubble up
            throw new Error(`Prerequisite check failed: ${error.message}`);
        }

        // Load environment variables
        const envVars = loadEnvVariables();

        // Enforce project name to avoid random naming
        envVars.COMPOSE_PROJECT_NAME = "atomica-testnet";

        debug("Loaded environment variables", { keys: Object.keys(envVars) });

        console.log(
            `Setting up fresh Docker testnet with ${numValidators} validators...`,
        );

        // Clean up any existing testnet
        await DockerTestnet.runCompose(["down", "--remove-orphans", "-v"], composeDir, envVars);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Generate genesis and validator configs
        const workspaceDir = pathResolve(composeDir, "..", "genesis-workspace");
        const genesisArtifactsDir = pathResolve(composeDir, "genesis-artifacts");
        const validatorsDir = pathResolve(composeDir, "validators");

        await generateGenesis({
            numValidators,
            chainId: 4,
            workspaceDir,
        });

        // Copy genesis artifacts to config directory
        const outputDir = pathResolve(workspaceDir, "output");
        mkdirSync(genesisArtifactsDir, { recursive: true });
        cpSync(outputDir, genesisArtifactsDir, { recursive: true });

        // Copy validator configs and identities to config directory
        mkdirSync(validatorsDir, { recursive: true });
        for (let i = 0; i < numValidators; i++) {
            const validatorSrcDir = pathResolve(workspaceDir, `validator-${i}`);
            const validatorDstDir = pathResolve(validatorsDir, `validator-${i}`);
            cpSync(validatorSrcDir, validatorDstDir, { recursive: true });
        }

        // Start the testnet
        // Use 5 minute timeout for 'up' command (image pull can be slow)
        try {
            await DockerTestnet.runCompose(["up", "-d"], composeDir, envVars, 300000);
        } catch (error: any) {
            console.error("Failed to start testnet. Fetching logs...");
            try {
                // Determine logs command
                const proc = spawn(DOCKER_BIN, ["compose", "logs", "--tail=200"], { cwd: composeDir, env: { ...process.env, ...envVars } });
                let logs = "";
                proc.stdout?.on("data", (d) => logs += d.toString());
                proc.stderr?.on("data", (d) => logs += d.toString()); // Capture stderr too just in case

                await new Promise<void>((resolve) => {
                    proc.on("close", () => {
                        console.error("=== DOCKER LOGS ===\n" + logs + "\n===================");
                        resolve();
                    });
                    // Timeout for log fetch
                    setTimeout(() => resolve(), 5000);
                });

            } catch (logError) {
                console.error("Failed to fetch logs.");
            }
            throw error;
        }

        // Wait for all validators to be healthy
        await waitForHealthy(numValidators, 120);

        // Discover validator endpoints
        const validatorUrls: string[] = [];
        for (let i = 0; i < numValidators; i++) {
            validatorUrls.push(`http://127.0.0.1:${BASE_API_PORT + i}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log(`✓ Docker testnet ready with ${numValidators} validators`);

        return new DockerTestnet(composeDir, numValidators, validatorUrls);
    }

    /**
     * Tear down the testnet and clean up all resources
     */
    async teardown(): Promise<void> {
        console.log("Tearing down Docker testnet...");
        const envVars = loadEnvVariables();
        await DockerTestnet.runCompose(["down", "--remove-orphans", "-v"], this.composeDir, envVars);
        console.log("✓ Docker testnet stopped");
    }

    /**
     * Get the REST API URL for a specific validator
     */
    validatorApiUrl(index: number): string {
        if (index < 0 || index >= this.numValidators) {
            throw new Error(
                `Validator index ${index} out of range (0-${this.numValidators - 1})`,
            );
        }
        return this.validatorUrls[index];
    }

    /**
     * Get all validator API URLs
     */
    validatorApiUrls(): string[] {
        return [...this.validatorUrls];
    }

    /**
     * Get the number of validators
     */
    getNumValidators(): number {
        return this.numValidators;
    }

    /**
     * Get a validator account that was funded at genesis
     */
    async getValidatorAccount(index: number): Promise<AptosAccount> {
        if (index < 0 || index >= this.numValidators) {
            throw new Error(
                `Validator index ${index} out of range (0-${this.numValidators - 1})`,
            );
        }

        const identityPath = pathResolve(
            this.composeDir,
            "validators",
            `validator-${index}`,
            "private-keys.yaml"
        );

        if (!existsSync(identityPath)) {
            throw new Error(`Validator identity file not found: ${identityPath}`);
        }

        const content = readFileSync(identityPath, "utf-8");
        const addrMatch = content.match(/account_address:\s*([a-fA-F0-9]+)/);
        const keyMatch = content.match(/account_private_key:\s*"0x([a-fA-F0-9]+)"/);

        if (!addrMatch || !keyMatch) {
            throw new Error(`Failed to parse validator identity from ${identityPath}`);
        }

        const address = "0x" + addrMatch[1];
        const privateKey = HexString.ensure(keyMatch[1]).toUint8Array();

        return new AptosAccount(privateKey, address);
    }

    /**
     * Get the faucet account for test-only minting operations
     *
     * ⚠️ WARNING: This is a TEST-ONLY approach! ⚠️
     * The Core Resources account (0xA550C18) does NOT exist on production mainnet.
     * This is used purely for local testing convenience.
     *
     * In test mode (is_test: true), this account:
     * - Has u64::MAX octas (~18.4M APT) for gas fees
     * - Has minting capability for AptosCoin
     * - Can delegate minting capability to other accounts
     */
    getFaucetAccount(): AptosAccount {
        // Read root account private key from genesis artifacts
        const rootKeysPath = pathResolve(
            this.composeDir,
            "genesis-artifacts",
            "root-account-private-keys.yaml"
        );

        if (!existsSync(rootKeysPath)) {
            throw new Error(`Root account keys file not found: ${rootKeysPath}`);
        }

        const content = readFileSync(rootKeysPath, "utf-8");
        const keyMatch = content.match(/account_private_key:\s*"0x([a-fA-F0-9]+)"/);

        if (!keyMatch) {
            throw new Error(`Failed to parse root account private key from ${rootKeysPath}`);
        }

        const privateKey = HexString.ensure(keyMatch[1]).toUint8Array();

        // IMPORTANT: The Core Resources account is ALWAYS at address 0xA550C18 (hardcoded in Move.toml)
        // At genesis, its auth key is rotated to match the root_key from layout.yaml
        // So we use the hardcoded address with our generated private key
        const coreResourcesAddress = "0x00000000000000000000000000000000000000000000000000000000A550C18";
        return new AptosAccount(privateKey, coreResourcesAddress);
    }

    /**
     * @deprecated Use getFaucetAccount() instead
     */
    getRootAccount(): AptosAccount {
        return this.getFaucetAccount();
    }

    /**
     * Bootstrap validators with unlocked funds for faucet operations
     *
     * ⚠️ TEST-ONLY: Uses root account to mint funds ⚠️
     *
     * This gives validators unlocked funds so they can act as faucets.
     * Uses aptos_coin::mint which is only available when is_test: true.
     * In production, validators would have unlocked funds from staking rewards.
     *
     * @param amountPerValidator - Amount of unlocked APT (in octas) to give each validator
     */
    async bootstrapValidators(amountPerValidator: bigint = 100_000_000_000_000n): Promise<void> {
        console.log(`Bootstrapping ${this.numValidators} validators with unlocked funds...`);
        console.log(`⚠️  Using test-only faucet account with minting capability`);

        const faucetAccount = this.getFaucetAccount();
        const client = new AptosClient(this.validatorApiUrl(0));

        for (let i = 0; i < this.numValidators; i++) {
            const validator = await this.getValidatorAccount(i);
            const validatorAddr = validator.address().hex();

            console.log(`  Minting ${amountPerValidator} octas for validator ${i} (${validatorAddr.slice(0, 10)}...)`);

            try {
                // Use aptos_account::transfer which creates CoinStore if it doesn't exist
                // This is simpler than mint() which requires CoinStore to already exist
                // We transfer from the faucet account which has u64::MAX balance
                const transferPayload = {
                    type: "entry_function_payload",
                    function: "0x1::aptos_account::transfer",
                    type_arguments: [],
                    arguments: [validatorAddr, amountPerValidator.toString()],
                };

                const transferTxn = await client.generateTransaction(faucetAccount.address(), transferPayload);
                const signedTransferTxn = await client.signTransaction(faucetAccount, transferTxn);
                const transferPending = await client.submitTransaction(signedTransferTxn);
                await client.waitForTransaction(transferPending.hash);

                debug(`Validator ${i} funded via transfer from faucet`, {
                    address: validatorAddr,
                    amount: amountPerValidator.toString(),
                    txn: transferPending.hash,
                });
            } catch (error: any) {
                console.error(`  ✗ Failed to fund validator ${i}: ${error.message}`);
                throw error;
            }
        }

        console.log(`✓ All validators bootstrapped with minted funds`);
    }

    /**
     * Fund a new account using the faucet (Core Resources account)
     *
     * ⚠️ TEST-ONLY: Uses Core Resources account (0xA550C18) which only exists in test mode
     *
     * This creates and funds new accounts for testing.
     * Uses aptos_account::transfer which automatically creates the account's CoinStore if needed.
     *
     * @param address - Address to fund (account will be created if it doesn't exist)
     * @param amount - Amount in octas to fund
     * @returns Transaction hash
     */
    async faucet(address: string | HexString, amount: bigint = 100_000_000n): Promise<string> {
        const faucetAccount = this.getFaucetAccount();
        const client = new AptosClient(this.validatorApiUrl(0));

        const targetAddr = typeof address === 'string' ? address : address.hex();
        debug(`Faucet funding ${targetAddr} with ${amount} octas`);

        try {
            // Use aptos_account::transfer which creates the account if it doesn't exist
            const transferPayload = {
                type: "entry_function_payload",
                function: "0x1::aptos_account::transfer",
                type_arguments: [],
                arguments: [targetAddr, amount.toString()],
            };

            const transferTxn = await client.generateTransaction(faucetAccount.address(), transferPayload);
            const signedTransferTxn = await client.signTransaction(faucetAccount, transferTxn);
            const transferPending = await client.submitTransaction(signedTransferTxn);
            await client.waitForTransaction(transferPending.hash);

            debug(`Faucet transfer complete`, {
                to: targetAddr,
                amount: amount.toString(),
                txn: transferPending.hash,
            });

            return transferPending.hash;
        } catch (error: any) {
            throw new Error(`Faucet transfer failed: ${error.message}`);
        }
    }

    /**
     * Query ledger info from a validator
     */
    async getLedgerInfo(validatorIndex: number): Promise<LedgerInfo> {
        const url = `${this.validatorApiUrl(validatorIndex)}/v1`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to get ledger info: ${response.status}`);
        }
        return (await response.json()) as LedgerInfo;
    }

    /**
     * Get current block height from a validator
     */
    async getBlockHeight(validatorIndex: number = 0): Promise<number> {
        const info = await this.getLedgerInfo(validatorIndex);
        return parseInt(info.block_height, 10);
    }

    /**
     * Wait for a specific number of blocks to be produced
     */
    async waitForBlocks(
        numBlocks: number,
        timeoutSecs: number = 60,
    ): Promise<void> {
        const deadline = Date.now() + timeoutSecs * 1000;
        const startInfo = await this.getLedgerInfo(0);
        const startHeight = parseInt(startInfo.block_height, 10);
        const targetHeight = startHeight + numBlocks;

        console.log(
            `  Waiting for ${numBlocks} blocks (from height ${startHeight} to ${targetHeight})`,
        );

        while (Date.now() < deadline) {
            const currentInfo = await this.getLedgerInfo(0);
            const currentHeight = parseInt(currentInfo.block_height, 10);

            debug(`Block progress: ${currentHeight}/${targetHeight}`, {
                current_height: currentHeight,
                target_height: targetHeight,
                current_version: currentInfo.ledger_version,
                epoch: currentInfo.epoch,
            });

            if (currentHeight >= targetHeight) {
                console.log(`  ✓ Reached target height ${currentHeight}`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        throw new Error("Timeout waiting for blocks");
    }

    /**
     * Find the docker-testnet directory
     */
    private static findComposeDir(): string {
        // Candidates:
        // 1. ../config (if running from npm package structure source/docker-testnet/typescript-sdk)
        // 2. source/docker-testnet/config (if running from repo root)
        // 3. Env var?

        const candidates = [
            pathResolve(__dirname, "../../config"), // relative to dist/ or src/
            pathResolve(process.cwd(), "source/docker-testnet/config"),
            pathResolve(process.cwd(), "docker-testnet/config")
        ];

        for (const path of candidates) {
            if (existsSync(pathResolve(path, "docker-compose.yaml"))) {
                return path;
            }
        }

        // Explicit check for when installed as node_module (TODO: improve this)

        throw new Error("Could not find docker-testnet/config directory containing docker-compose.yaml");
    }
    /* Internal helper to run compose */
    private static async runCompose(
        args: string[],
        cwd: string,
        envVars: Record<string, string>,
        timeoutMs: number = 60000
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const env = { ...process.env, ...envVars };
            const proc = spawn(DOCKER_BIN, ["compose", ...args], { cwd, env });

            let stdout = "";
            let stderr = "";
            let finished = false;

            // Set a timeout to kill hung processes
            const timeout = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    proc.kill("SIGTERM");
                    // Give it 2 seconds, then force kill
                    setTimeout(() => proc.kill("SIGKILL"), 2000);

                    // For 'down' commands, treat timeout as success (cleanup attempt made)
                    if (args[0] === "down") {
                        resolve();
                    } else {
                        reject(new Error(`docker compose ${args.join(" ")} timed out after ${timeoutMs}ms`));
                    }
                }
            }, timeoutMs);

            proc.stdout?.on("data", (data) => stdout += data.toString());
            proc.stderr?.on("data", (data) => stderr += data.toString());

            proc.on("close", (code) => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);

                if (code === 0 || args[0] === "down") {
                    resolve();
                } else {
                    reject(new Error(`docker compose ${args.join(" ")} failed (exit ${code}):\n${stderr}`));
                }
            });

            proc.on("error", (err) => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    /* Check if Docker is available and running */
    public static async ensureDockerRunning(): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn(DOCKER_BIN, ["info"], {
                stdio: ["ignore", "pipe", "pipe"],
            });

            proc.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error("Docker Daemon is not running. Please start Docker and try again."));
                }
            });

            proc.on("error", (err: any) => {
                if (err.code === "ENOENT") {
                    reject(new Error(`Docker binary '${DOCKER_BIN}' not found in PATH.`));
                } else {
                    reject(new Error(`Failed to check Docker status: ${err.message}`));
                }
            });
        });
    }


}

/**
 * Wait for all validators to become healthy
 */
async function waitForHealthy(
    numValidators: number,
    timeoutSecs: number,
): Promise<void> {
    const deadline = Date.now() + timeoutSecs * 1000;
    console.log(`  Waiting for ${numValidators} validators to become healthy...`);

    while (Date.now() < deadline) {
        let healthyCount = 0;
        const statuses: string[] = [];

        for (let i = 0; i < numValidators; i++) {
            const url = `http://127.0.0.1:${BASE_API_PORT + i}/v1`;
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
                if (response.ok) {
                    healthyCount++;
                    const data = await response.json() as LedgerInfo;
                    statuses.push(`V${i}:epoch${data.epoch},blk${data.block_height}`);
                    debug(`Validator ${i} healthy`, { epoch: data.epoch, block_height: data.block_height });
                } else {
                    statuses.push(`V${i}:HTTP${response.status}`);
                }
            } catch (e: any) {
                statuses.push(`V${i}:ERR`);
                // Validator not ready yet
            }
        }

        if (healthyCount === numValidators) {
            console.log(`  ✓ All ${numValidators} validators healthy [${statuses.join(", ")}]`);
            return;
        } else {
            debug(`Health check: ${healthyCount}/${numValidators} healthy [${statuses.join(", ")}]`);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(
        "Timeout waiting for validators. Check 'docker compose logs' for details.",
    );
}

/**
 * Network probe result for a single validator
 */
export interface ProbeResult {
    validatorIndex: number;
    containerName: string;
    ipAddress: string;
    apiPort: number;
    validatorPort: number;
    metricsPort: number;
    apiReachable: boolean;
    apiResponse?: LedgerInfo;
    apiError?: string;
    portScans: {
        port: number;
        name: string;
        reachable: boolean;
        error?: string;
    }[];
}

/**
 * Probe all validators in a testnet for connectivity and health
 * 
 * This function is useful for debugging network issues. It checks:
 * - REST API endpoints (8080-808X)
 * - Validator network ports (6180)
 * - Metrics ports (9101-910X)
 * - Container network connectivity
 * 
 * Usage:
 *   DEBUG_TESTNET=1 node -e "require('./dist/index.js').probeTestnet(4)"
 */
export async function probeTestnet(numValidators: number = 4): Promise<ProbeResult[]> {
    console.log(`\n=== Probing ${numValidators} validators ===\n`);

    const results: ProbeResult[] = [];

    for (let i = 0; i < numValidators; i++) {
        const containerName = `atomica-validator-${i}`;
        const ipAddress = `172.19.0.${10 + i}`;
        const apiPort = BASE_API_PORT + i;
        const validatorPort = BASE_VALIDATOR_PORT;
        const metricsPort = 9101 + i;

        console.log(`\nProbing validator-${i} (${containerName}):`);

        const result: ProbeResult = {
            validatorIndex: i,
            containerName,
            ipAddress,
            apiPort,
            validatorPort,
            metricsPort,
            apiReachable: false,
            portScans: [],
        };

        // Check REST API
        const apiUrl = `http://127.0.0.1:${apiPort}/v1`;
        console.log(`  Testing REST API: ${apiUrl}`);
        try {
            const response = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
                result.apiReachable = true;
                result.apiResponse = await response.json() as LedgerInfo;
                console.log(`    ✓ API reachable - Epoch: ${result.apiResponse.epoch}, Block: ${result.apiResponse.block_height}`);
            } else {
                result.apiError = `HTTP ${response.status}`;
                console.log(`    ✗ API returned: ${response.status}`);
            }
        } catch (error: any) {
            result.apiError = error.message;
            console.log(`    ✗ API unreachable: ${error.message}`);
        }

        // Scan important ports (from host perspective)
        const portsToScan = [
            { port: apiPort, name: "REST API" },
            { port: metricsPort, name: "Metrics" },
        ];

        for (const { port, name } of portsToScan) {
            console.log(`  Testing ${name} port: ${port}`);
            try {
                const testUrl = `http://127.0.0.1:${port}`;
                const response = await fetch(testUrl, {
                    signal: AbortSignal.timeout(2000),
                    method: 'HEAD',
                });
                result.portScans.push({
                    port,
                    name,
                    reachable: true,
                });
                console.log(`    ✓ Port ${port} (${name}) reachable`);
            } catch (error: any) {
                result.portScans.push({
                    port,
                    name,
                    reachable: false,
                    error: error.message,
                });
                console.log(`    ✗ Port ${port} (${name}) unreachable: ${error.message}`);
            }
        }

        // Check container networking (requires docker exec)
        console.log(`  Checking container internal networking...`);
        try {
            const { spawn } = await import("child_process");
            const pingOther = spawn("docker", [
                "exec",
                containerName,
                "sh",
                "-c",
                `curl -s -m 2 http://172.19.0.${10 + ((i + 1) % numValidators)}:8080/v1 | head -c 50 || echo FAIL`
            ]);

            let output = "";
            pingOther.stdout?.on("data", (d) => output += d.toString());

            await new Promise<void>((resolve) => {
                pingOther.on("close", () => resolve());
                setTimeout(() => {
                    pingOther.kill();
                    resolve();
                }, 3000);
            });

            if (output.includes("chain_id")) {
                console.log(`    ✓ Container can reach other validators`);
            } else {
                console.log(`    ✗ Container cannot reach other validators`);
            }
        } catch (error: any) {
            console.log(`    ? Could not test container networking: ${error.message}`);
        }

        results.push(result);
    }

    // Summary
    console.log(`\n=== Probe Summary ===`);
    const healthyValidators = results.filter(r => r.apiReachable).length;
    console.log(`Healthy validators: ${healthyValidators}/${numValidators}`);

    if (healthyValidators > 0 && results[0].apiResponse) {
        const epochs = new Set(results.filter(r => r.apiResponse).map(r => r.apiResponse!.epoch));
        const blocks = new Set(results.filter(r => r.apiResponse).map(r => r.apiResponse!.block_height));

        if (epochs.size === 1) {
            console.log(`All validators in epoch: ${[...epochs][0]}`);
        } else {
            console.log(`WARNING: Validators in different epochs: ${[...epochs].join(", ")}`);
        }

        if (blocks.size === 1) {
            console.log(`All validators at block: ${[...blocks][0]}`);
        } else {
            console.log(`Validators at blocks: ${[...blocks].join(", ")} (minor differences OK)`);
        }
    }

    console.log(`\n`);
    return results;
}
