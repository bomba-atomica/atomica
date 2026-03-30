import { AptosAccount, AptosClient, HexString, TxnBuilderTypes, BCS } from "aptos";
import { spawn } from "child_process";
import * as dotenv from "dotenv";
import { cpSync, existsSync, mkdirSync, readFileSync } from "fs";
import { resolve as pathResolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateGenesis } from "./genesis.js";
import { findAptosBinary } from "./findAptosBinary.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Base API port for validators (incremented for each validator) */
const BASE_API_PORT = 8080;
/** Base validator network port for inter-validator communication */
const BASE_VALIDATOR_PORT = 6180;
/** Docker binary path - assumed to be in PATH or standard location */
const DOCKER_BIN = "docker";
/** Aptos CLI binary path - lazily initialized to avoid unnecessary lookups */
let APTOS_BIN = null;
/** Get the aptos binary path, finding it on first use */
function getAptosBinary() {
    if (APTOS_BIN === null) {
        APTOS_BIN = findAptosBinary();
    }
    return APTOS_BIN;
}
/** Debug logging - controlled by DEBUG_TESTNET env var */
const DEBUG = process.env.DEBUG_TESTNET === "1" || process.env.DEBUG_TESTNET === "true";
function debug(message, data) {
    if (DEBUG) {
        const timestamp = new Date().toISOString();
        if (data) {
            console.log(`[DEBUG ${timestamp}] ${message}`, JSON.stringify(data, null, 2));
        }
        else {
            console.log(`[DEBUG ${timestamp}] ${message}`);
        }
    }
}
/**
 * Load environment variables
 */
function loadEnvVariables() {
    const cwdEnv = pathResolve(process.cwd(), ".env");
    if (existsSync(cwdEnv)) {
        return dotenv.parse(readFileSync(cwdEnv));
    }
    return {};
}
/**
 * Docker Testnet - Automatic setup and teardown
 */
export class DockerTestnet {
    composeDir;
    numValidators;
    validatorUrls;
    faucetLock = Promise.resolve();
    cleanupHandlersRegistered = false;
    constructor(composeDir, numValidators, validatorUrls) {
        this.composeDir = composeDir;
        this.numValidators = numValidators;
        this.validatorUrls = validatorUrls;
    }
    /**
     * Create a fresh, isolated Docker testnet with N validators
     */
    static async new(numValidators, _options) {
        if (numValidators < 1 || numValidators > 7) {
            throw new Error(`numValidators must be between 1 and 7, got ${numValidators}`);
        }
        const composeDir = DockerTestnet.findComposeDir();
        debug("Found compose directory", { composeDir });
        try {
            await DockerTestnet.ensureDockerRunning();
            debug("Docker daemon is running");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Prerequisite check failed: ${message}`);
        }
        const envVars = loadEnvVariables();
        debug("Loaded environment variables", { keys: Object.keys(envVars) });
        console.log(`Setting up fresh Docker testnet with ${numValidators} validators...`);
        await DockerTestnet.runCompose(["down", "--remove-orphans", "-v"], composeDir, envVars);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const workspaceDir = pathResolve(composeDir, "..", "genesis-workspace");
        const genesisArtifactsDir = pathResolve(composeDir, "genesis-artifacts");
        const validatorsDir = pathResolve(composeDir, "validators");
        await generateGenesis({
            numValidators,
            chainId: 4,
            workspaceDir,
        });
        const outputDir = pathResolve(workspaceDir, "output");
        mkdirSync(genesisArtifactsDir, { recursive: true });
        cpSync(outputDir, genesisArtifactsDir, { recursive: true });
        for (let i = 0; i < numValidators; i++) {
            const validatorSrcDir = pathResolve(workspaceDir, `validator-${i}`);
            const validatorDstDir = pathResolve(validatorsDir, `validator-${i}`);
            cpSync(validatorSrcDir, validatorDstDir, { recursive: true });
        }
        const validatorServices = [];
        for (let i = 0; i < numValidators; i++) {
            validatorServices.push(`validator-${i}`);
        }
        try {
            await DockerTestnet.runCompose(["up", "-d", ...validatorServices], composeDir, envVars, 300000);
        }
        catch (error) {
            console.error("Failed to start testnet. Fetching logs...");
            try {
                const proc = spawn(DOCKER_BIN, ["compose", "logs", "--tail=200"], {
                    cwd: composeDir,
                    env: { ...process.env, ...envVars },
                });
                let logs = "";
                proc.stdout?.on("data", (d) => (logs += d.toString()));
                proc.stderr?.on("data", (d) => (logs += d.toString()));
                await new Promise((resolve) => {
                    proc.on("close", () => {
                        console.error("=== DOCKER LOGS ===\n" + logs + "\n===================");
                        resolve();
                    });
                    setTimeout(() => resolve(), 5000);
                });
            }
            catch {
                console.error("Failed to fetch logs.");
            }
            throw error;
        }
        await waitForHealthy(numValidators, 120);
        const validatorUrls = [];
        for (let i = 0; i < numValidators; i++) {
            validatorUrls.push(`http://127.0.0.1:${BASE_API_PORT + i}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log(`✓ Docker testnet ready with ${numValidators} validators`);
        const testnet = new DockerTestnet(composeDir, numValidators, validatorUrls);
        testnet.registerCleanupHandlers();
        return testnet;
    }
    /**
     * Tear down the testnet and clean up all resources
     */
    async teardown() {
        console.log("Tearing down Docker testnet...");
        const envVars = loadEnvVariables();
        await DockerTestnet.runCompose(["down", "--remove-orphans", "-v"], this.composeDir, envVars);
        console.log("✓ Docker testnet stopped");
        this.unregisterCleanupHandlers();
    }
    registerCleanupHandlers() {
        if (this.cleanupHandlersRegistered) {
            return;
        }
        this.cleanupHandlersRegistered = true;
        const handleCleanup = async (signal) => {
            console.log(`\n[${signal}] Cleaning up Docker testnet...`);
            try {
                await this.teardown();
                console.log(`[${signal}] ✓ Docker testnet cleaned up`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[${signal}] Failed to cleanup testnet:`, message);
            }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this._signalHandlers = {
            SIGINT: async () => {
                await handleCleanup("SIGINT");
                process.exit(130);
            },
            SIGTERM: async () => {
                await handleCleanup("SIGTERM");
                process.exit(143);
            },
            beforeExit: async () => {
                await handleCleanup("beforeExit");
            },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.on("SIGINT", this._signalHandlers.SIGINT);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.on("SIGTERM", this._signalHandlers.SIGTERM);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.on("beforeExit", this._signalHandlers.beforeExit);
        debug("Cleanup handlers registered for SIGINT, SIGTERM, and beforeExit");
    }
    unregisterCleanupHandlers() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!this.cleanupHandlersRegistered || !this._signalHandlers) {
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.off("SIGINT", this._signalHandlers.SIGINT);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.off("SIGTERM", this._signalHandlers.SIGTERM);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.off("beforeExit", this._signalHandlers.beforeExit);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete this._signalHandlers;
        this.cleanupHandlersRegistered = false;
        debug("Cleanup handlers unregistered");
    }
    validatorApiUrl(index) {
        if (index < 0 || index >= this.numValidators) {
            throw new Error(`Validator index ${index} out of range (0-${this.numValidators - 1})`);
        }
        return this.validatorUrls[index];
    }
    validatorApiUrls() {
        return [...this.validatorUrls];
    }
    getNumValidators() {
        return this.numValidators;
    }
    async getValidatorAccount(index) {
        if (index < 0 || index >= this.numValidators) {
            throw new Error(`Validator index ${index} out of range (0-${this.numValidators - 1})`);
        }
        const identityPath = pathResolve(this.composeDir, "validators", `validator-${index}`, "private-keys.yaml");
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
    getFaucetAccount() {
        // Use env var (with deterministic test default) for the root account private key.
        // The root_key from layout.yaml controls the core resources account at 0xA550C18.
        const FALLBACK_ROOT_KEY = "0x970daae6672b68f76de3418f2f61cc469ff6659393b95c25fc72142c1433fa2d";
        const rawKey = process.env.APTOS_ROOT_ACCOUNT_PRIVATE_KEY || FALLBACK_ROOT_KEY;
        const privateKey = HexString.ensure(rawKey).toUint8Array();
        const coreResourcesAddress = "0x00000000000000000000000000000000000000000000000000000000A550C18";
        return new AptosAccount(privateKey, coreResourcesAddress);
    }
    getRootAccount() {
        return this.getFaucetAccount();
    }
    async bootstrapValidators(amountPerValidator = 100000000000000n) {
        console.log(`Bootstrapping ${this.numValidators} validators with unlocked funds...`);
        console.log(`⚠️  Using test-only faucet account with minting capability`);
        const faucetAccount = this.getFaucetAccount();
        const client = new AptosClient(this.validatorApiUrl(0));
        for (let i = 0; i < this.numValidators; i++) {
            const validator = await this.getValidatorAccount(i);
            const validatorAddr = validator.address().hex();
            console.log(`  Minting ${amountPerValidator} octas for validator ${i} (${validatorAddr.slice(0, 10)}...)`);
            try {
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
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`  ✗ Failed to fund validator ${i}: ${message}`);
                throw error;
            }
        }
        console.log(`✓ All validators bootstrapped with minted funds`);
    }
    async faucet(address, amount = 100000000n) {
        // Capture previous lock to wait for it inside the scoped operation
        const previousLock = this.faucetLock;
        const currentOperation = (async () => {
            // Wait for previous faucet operation to complete (serialization)
            await previousLock;
            const faucetAccount = this.getFaucetAccount();
            const client = new AptosClient(this.validatorApiUrl(0));
            const targetAddr = typeof address === "string" ? address : address.hex();
            debug(`Faucet funding ${targetAddr} with ${amount} octas`);
            try {
                const entryFunctionPayload = new TxnBuilderTypes.TransactionPayloadEntryFunction(TxnBuilderTypes.EntryFunction.natural("0x1::aptos_account", "transfer", [], [
                    BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(targetAddr)),
                    BCS.bcsSerializeUint64(amount),
                ]));
                const accountInfo = await client.getAccount(faucetAccount.address());
                const chainId = await client.getChainId();
                const rawTxn = new TxnBuilderTypes.RawTransaction(TxnBuilderTypes.AccountAddress.fromHex(faucetAccount.address()), BigInt(accountInfo.sequence_number), entryFunctionPayload, BigInt(10000), BigInt(100), BigInt(Math.floor(Date.now() / 1000) + 600), new TxnBuilderTypes.ChainId(chainId));
                const signedTxn = await client.signTransaction(faucetAccount, rawTxn);
                const txnResponse = await client.submitTransaction(signedTxn);
                const maxRetries = 40;
                const retryDelayMs = 1000;
                let retries = 0;
                while (retries < maxRetries) {
                    try {
                        const result = await client.view({
                            function: "0x1::coin::balance",
                            type_arguments: ["0x1::aptos_coin::AptosCoin"],
                            arguments: [targetAddr],
                        });
                        if (result && result.length > 0 && BigInt(result[0]) >= amount) {
                            break;
                        }
                        retries++;
                        if (retries < maxRetries) {
                            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                        }
                    }
                    catch (e) {
                        retries++;
                        if (retries < maxRetries) {
                            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                        }
                        else {
                            const message = e instanceof Error ? e.message : String(e);
                            debug(`Warning: Could not confirm balance after ${retries} retries`, {
                                targetAddr,
                                error: message,
                            });
                            break;
                        }
                    }
                }
                debug(`Faucet transfer complete`, {
                    to: targetAddr,
                    amount: amount.toString(),
                    txn: txnResponse.hash,
                    retriesNeeded: retries,
                });
                return txnResponse.hash;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Faucet transfer failed: ${message}`);
            }
        })();
        this.faucetLock = currentOperation.catch(() => { });
        return currentOperation;
    }
    async getLedgerInfo(validatorIndex) {
        const url = `${this.validatorApiUrl(validatorIndex)}/v1`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to get ledger info: ${response.status}`);
        }
        return (await response.json());
    }
    async getBlockHeight(validatorIndex = 0) {
        const info = await this.getLedgerInfo(validatorIndex);
        return parseInt(info.block_height, 10);
    }
    async waitForBlocks(numBlocks, timeoutSecs = 60) {
        const deadline = Date.now() + timeoutSecs * 1000;
        const startInfo = await this.getLedgerInfo(0);
        const startHeight = parseInt(startInfo.block_height, 10);
        const targetHeight = startHeight + numBlocks;
        console.log(`  Waiting for ${numBlocks} blocks (from height ${startHeight} to ${targetHeight})`);
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
    async deployContracts(options) {
        const { contractsDir, deployerPrivateKey, deployerAddress, namedAddresses = {}, initFunctions = [], fundAmount = 10000000000n, } = options;
        console.log("Deploying contracts using host aptos CLI...");
        let deployer = deployerAddress;
        if (!deployer) {
            const account = new AptosAccount(Buffer.from(deployerPrivateKey.slice(2), "hex"));
            deployer = account.address().hex();
        }
        console.log(`Deploying contracts to address: ${deployer}`);
        if (fundAmount > 0n) {
            console.log(`Funding deployer account ${deployer}...`);
            await this.faucet(deployer, fundAmount);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        const namedAddressesArg = Object.entries(namedAddresses)
            .map(([key, value]) => `${key}=${value}`)
            .join(",");
        console.log("Publishing contracts from host...");
        const publishArgs = [
            "move",
            "publish",
            "--package-dir",
            contractsDir,
            "--named-addresses",
            namedAddressesArg,
            "--private-key",
            deployerPrivateKey,
            "--url",
            `http://127.0.0.1:${BASE_API_PORT}`,
            "--skip-fetch-latest-git-deps",
            "--assume-yes",
        ];
        const result = await this.execCommand(getAptosBinary(), publishArgs);
        console.log("Publish result stdout:", result.stdout.trim());
        if (result.stderr.trim()) {
            console.log("Publish result stderr:", result.stderr.trim());
        }
        for (const initFunc of initFunctions) {
            console.log(`Initializing ${initFunc.functionId}...`);
            const args = [
                "move",
                "run",
                "--function-id",
                initFunc.functionId,
                "--private-key",
                deployerPrivateKey,
                "--url",
                `http://127.0.0.1:${BASE_API_PORT}`,
                "--assume-yes",
            ];
            if (initFunc.args.length > 0) {
                args.push("--args", ...initFunc.args);
            }
            await this.execCommand(getAptosBinary(), args);
        }
        console.log("Waiting for deployment to be indexed...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        console.log("✓ Contracts deployed successfully");
    }
    async execCommand(bin, args) {
        return new Promise((resolve, reject) => {
            let stdout = "";
            let stderr = "";
            const proc = spawn(bin, args);
            proc.stdout?.on("data", (d) => {
                const s = d.toString();
                stdout += s;
                if (DEBUG)
                    process.stdout.write(s);
            });
            proc.stderr?.on("data", (d) => {
                const s = d.toString();
                stderr += s;
                if (DEBUG)
                    process.stderr.write(s);
            });
            proc.on("close", (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                }
                else {
                    reject(new Error(`Command failed (exit ${code}): ${bin} ${args.join(" ")}\n${stderr}`));
                }
            });
            proc.on("error", (err) => {
                reject(new Error(`Failed to execute ${bin}: ${err.message}`));
            });
        });
    }
    async execInContainer(containerName, command) {
        return new Promise((resolve, reject) => {
            let stdout = "";
            let stderr = "";
            const proc = spawn(DOCKER_BIN, ["exec", containerName, ...command]);
            proc.stdout?.on("data", (d) => {
                const s = d.toString();
                stdout += s;
                if (DEBUG)
                    process.stdout.write(s);
            });
            proc.stderr?.on("data", (d) => {
                const s = d.toString();
                stderr += s;
                if (DEBUG)
                    process.stderr.write(s);
            });
            proc.on("close", (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                }
                else {
                    reject(new Error(`Command failed in container (exit ${code}): ${command.join(" ")}\n${stderr}`));
                }
            });
            proc.on("error", reject);
        });
    }
    static findComposeDir() {
        const candidates = [
            pathResolve(__dirname, "../../config"),
            pathResolve(process.cwd(), "source/docker-testnet/config"),
            pathResolve(process.cwd(), "docker-testnet/config"),
        ];
        for (const path of candidates) {
            if (existsSync(pathResolve(path, "docker-compose.yaml"))) {
                return path;
            }
        }
        throw new Error("Could not find docker-testnet/config directory containing docker-compose.yaml");
    }
    static async runCompose(args, cwd, envVars, timeoutMs = 60000) {
        return new Promise((resolve, reject) => {
            const env = { ...process.env, ...envVars };
            const proc = spawn(DOCKER_BIN, ["compose", ...args], { cwd, env });
            let stdout = "";
            let stderr = "";
            let finished = false;
            const timeout = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    proc.kill("SIGTERM");
                    setTimeout(() => proc.kill("SIGKILL"), 2000);
                    if (args[0] === "down") {
                        resolve();
                    }
                    else {
                        reject(new Error(`docker compose ${args.join(" ")} timed out after ${timeoutMs}ms`));
                    }
                }
            }, timeoutMs);
            proc.stdout?.on("data", (data) => (stdout += data.toString()));
            proc.stderr?.on("data", (data) => (stderr += data.toString()));
            proc.on("close", (code) => {
                if (finished)
                    return;
                finished = true;
                clearTimeout(timeout);
                if (code === 0 || args[0] === "down") {
                    resolve();
                }
                else {
                    reject(new Error(`docker compose ${args.join(" ")} failed (exit ${code}):\n${stderr}`));
                }
            });
            proc.on("error", (err) => {
                if (finished)
                    return;
                finished = true;
                clearTimeout(timeout);
                reject(err);
            });
        });
    }
    static async ensureDockerRunning() {
        return new Promise((resolve, reject) => {
            const proc = spawn(DOCKER_BIN, ["info"], {
                stdio: ["ignore", "pipe", "pipe"],
            });
            proc.on("close", (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error("❌ Docker Daemon is not responding.\n\n" +
                        "HOW TO FIX THIS:\n" +
                        "  1. Check if Docker is running: `docker info`\n" +
                        "  2. Start Docker Desktop (macOS/Windows) or the docker service (Linux)\n" +
                        "  3. Verify permissions: You may need to add your user to the 'docker' group\n" +
                        "  4. On Linux: `sudo systemctl start docker`"));
                }
            });
            proc.on("error", (err) => {
                const nodeError = err;
                if (nodeError.code === "ENOENT") {
                    reject(new Error(`❌ Docker binary '${DOCKER_BIN}' not found in PATH.\n\n` +
                        "HOW TO FIX THIS:\n" +
                        "  1. Install Docker: https://docs.docker.com/get-docker/\n" +
                        "  2. Ensure 'docker' is in your system $PATH"));
                }
                else {
                    const message = err instanceof Error ? err.message : String(err);
                    reject(new Error(`❌ Failed to check Docker status: ${message}`));
                }
            });
        });
    }
}
async function waitForHealthy(numValidators, timeoutSecs) {
    const deadline = Date.now() + timeoutSecs * 1000;
    console.log(`  Waiting for ${numValidators} validators to become healthy...`);
    while (Date.now() < deadline) {
        let healthyCount = 0;
        const statuses = [];
        for (let i = 0; i < numValidators; i++) {
            const url = `http://127.0.0.1:${BASE_API_PORT + i}/v1`;
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
                if (response.ok) {
                    healthyCount++;
                    const data = (await response.json());
                    statuses.push(`V${i}:epoch${data.epoch},blk${data.block_height}`);
                    debug(`Validator ${i} healthy`, {
                        epoch: data.epoch,
                        block_height: data.block_height,
                    });
                }
                else {
                    statuses.push(`V${i}:HTTP${response.status}`);
                }
            }
            catch {
                statuses.push(`V${i}:ERR`);
            }
        }
        if (healthyCount === numValidators) {
            console.log(`  ✓ All ${numValidators} validators healthy [${statuses.join(", ")}]`);
            return;
        }
        else {
            debug(`Health check: ${healthyCount}/${numValidators} healthy [${statuses.join(", ")}]`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Timeout waiting for validators. Check 'docker compose logs' for details.");
}
export async function probeTestnet(numValidators = 4) {
    console.log(`\n=== Probing ${numValidators} validators ===\n`);
    const results = [];
    for (let i = 0; i < numValidators; i++) {
        const containerName = `atomica-validator-${i}`;
        const ipAddress = `172.19.0.${10 + i}`;
        const apiPort = BASE_API_PORT + i;
        const validatorPort = BASE_VALIDATOR_PORT;
        const metricsPort = 9101 + i;
        console.log(`\nProbing validator-${i} (${containerName}):`);
        const result = {
            validatorIndex: i,
            containerName,
            ipAddress,
            apiPort,
            validatorPort,
            metricsPort,
            apiReachable: false,
            portScans: [],
        };
        const apiUrl = `http://127.0.0.1:${apiPort}/v1`;
        console.log(`  Testing REST API: ${apiUrl}`);
        try {
            const response = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
                result.apiReachable = true;
                result.apiResponse = (await response.json());
                console.log(`    ✓ API reachable - Epoch: ${result.apiResponse.epoch}, Block: ${result.apiResponse.block_height}`);
            }
            else {
                result.apiError = `HTTP ${response.status}`;
                console.log(`    ✗ API returned: ${response.status}`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            result.apiError = message;
            console.log(`    ✗ API unreachable: ${message}`);
        }
        const portsToScan = [
            { port: apiPort, name: "REST API" },
            { port: metricsPort, name: "Metrics" },
        ];
        for (const { port, name } of portsToScan) {
            console.log(`  Testing ${name} port: ${port}`);
            try {
                const testUrl = `http://127.0.0.1:${port}`;
                await fetch(testUrl, {
                    signal: AbortSignal.timeout(2000),
                    method: "HEAD",
                });
                result.portScans.push({
                    port,
                    name,
                    reachable: true,
                });
                console.log(`    ✓ Port ${port} (${name}) reachable`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                result.portScans.push({
                    port,
                    name,
                    reachable: false,
                    error: message,
                });
                console.log(`    ✗ Port ${port} (${name}) unreachable: ${message}`);
            }
        }
        console.log(`  Checking container internal networking...`);
        try {
            const { spawn } = await import("child_process");
            const pingOther = spawn("docker", [
                "exec",
                containerName,
                "sh",
                "-c",
                `curl -s -m 2 http://172.19.0.${10 + ((i + 1) % numValidators)}:8080/v1 | head -c 50 || echo FAIL`,
            ]);
            let output = "";
            pingOther.stdout?.on("data", (d) => (output += d.toString()));
            await new Promise((resolve) => {
                pingOther.on("close", () => resolve());
                setTimeout(() => {
                    pingOther.kill();
                    resolve();
                }, 3000);
            });
            if (output.includes("chain_id")) {
                console.log(`    ✓ Container can reach other validators`);
            }
            else {
                console.log(`    ✗ Container cannot reach other validators`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`    ? Could not test container networking: ${message}`);
        }
        results.push(result);
    }
    console.log(`\n=== Probe Summary ===`);
    const healthyValidators = results.filter((r) => r.apiReachable).length;
    console.log(`Healthy validators: ${healthyValidators}/${numValidators}`);
    if (healthyValidators > 0 && results[0].apiResponse) {
        const epochs = new Set(results.filter((r) => r.apiResponse).map((r) => r.apiResponse.epoch));
        const blocks = new Set(results.filter((r) => r.apiResponse).map((r) => r.apiResponse.block_height));
        if (epochs.size === 1) {
            console.log(`All validators in epoch: ${[...epochs][0]}`);
        }
        else {
            console.log(`WARNING: Validators in different epochs: ${[...epochs].join(", ")}`);
        }
        if (blocks.size === 1) {
            console.log(`All validators at block: ${[...blocks][0]}`);
        }
        else {
            console.log(`Validators at blocks: ${[...blocks].join(", ")} (minor differences OK)`);
        }
    }
    console.log(`\n`);
    return results;
}
// Re-export all other modules
export * from "./config.js";
export * from "./siwe.js";
export * from "./transaction.js";
export * from "./payloads.js";
export * from "./localnet.js";
export * from "./browser-commands.js";
export * from "./ensureFramework.js";
export * from "./findAptosBinary.js";
export * from "./genesis.js";
