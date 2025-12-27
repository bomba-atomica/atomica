"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerTestnet = void 0;
const child_process_1 = require("child_process");
const path_1 = require("path");
const fs_1 = require("fs");
const dotenv = __importStar(require("dotenv"));
/** Base API port for validators (incremented for each validator) */
const BASE_API_PORT = 8080;
/** Docker binary path - assumed to be in PATH or standard location */
const DOCKER_BIN = "docker";
/**
 * Load environment variables
 */
function loadEnvVariables() {
    // Try to load .env from current working directory
    const cwdEnv = (0, path_1.resolve)(process.cwd(), ".env");
    if ((0, fs_1.existsSync)(cwdEnv)) {
        return dotenv.parse((0, fs_1.readFileSync)(cwdEnv));
    }
    return {};
}
/**
 * Docker Testnet - Automatic setup and teardown
 */
class DockerTestnet {
    composeDir;
    numValidators;
    validatorUrls;
    constructor(composeDir, numValidators, validatorUrls) {
        this.composeDir = composeDir;
        this.numValidators = numValidators;
        this.validatorUrls = validatorUrls;
    }
    /**
     * Create a fresh, isolated Docker testnet with N validators
     */
    static async new(numValidators) {
        if (numValidators < 1 || numValidators > 7) {
            throw new Error(`numValidators must be between 1 and 7, got ${numValidators}`);
        }
        const composeDir = DockerTestnet.findComposeDir();
        try {
            await DockerTestnet.ensureDockerRunning();
        }
        catch (error) {
            // Rethrow with a clean message if possible, or just let it bubble up
            throw new Error(`Prerequisite check failed: ${error.message}`);
        }
        // Load environment variables
        const envVars = loadEnvVariables();
        console.log(`Setting up fresh Docker testnet with ${numValidators} validators...`);
        // Clean up any existing testnet
        await DockerTestnet.runCompose(["down", "--remove-orphans", "-v"], composeDir, envVars);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Start the testnet
        // Use 5 minute timeout for 'up' command (image pull can be slow)
        await DockerTestnet.runCompose(["up", "-d"], composeDir, envVars, 300000);
        // Wait for all validators to be healthy
        await waitForHealthy(numValidators, 120);
        // Discover validator endpoints
        const validatorUrls = [];
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
    async teardown() {
        console.log("Tearing down Docker testnet...");
        const envVars = loadEnvVariables();
        await DockerTestnet.runCompose(["down", "--remove-orphans", "-v"], this.composeDir, envVars);
        console.log("✓ Docker testnet stopped");
    }
    /**
     * Get the REST API URL for a specific validator
     */
    validatorApiUrl(index) {
        if (index < 0 || index >= this.numValidators) {
            throw new Error(`Validator index ${index} out of range (0-${this.numValidators - 1})`);
        }
        return this.validatorUrls[index];
    }
    /**
     * Get all validator API URLs
     */
    validatorApiUrls() {
        return [...this.validatorUrls];
    }
    /**
     * Get the number of validators
     */
    getNumValidators() {
        return this.numValidators;
    }
    /**
     * Query ledger info from a validator
     */
    async getLedgerInfo(validatorIndex) {
        const url = `${this.validatorApiUrl(validatorIndex)}/v1`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to get ledger info: ${response.status}`);
        }
        return (await response.json());
    }
    /**
     * Get current block height from a validator
     */
    async getBlockHeight(validatorIndex = 0) {
        const info = await this.getLedgerInfo(validatorIndex);
        return parseInt(info.block_height, 10);
    }
    /**
     * Wait for a specific number of blocks to be produced
     */
    async waitForBlocks(numBlocks, timeoutSecs = 60) {
        const deadline = Date.now() + timeoutSecs * 1000;
        const startVersion = parseInt((await this.getLedgerInfo(0)).ledger_version, 10);
        const targetVersion = startVersion + numBlocks;
        console.log(`  Waiting for ${numBlocks} blocks (from version ${startVersion} to ${targetVersion})`);
        while (Date.now() < deadline) {
            const currentVersion = parseInt((await this.getLedgerInfo(0)).ledger_version, 10);
            if (currentVersion >= targetVersion) {
                console.log(`  ✓ Reached target version ${currentVersion}`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error("Timeout waiting for blocks");
    }
    /**
     * Find the docker-testnet directory
     */
    static findComposeDir() {
        // Candidates:
        // 1. ../config (if running from npm package structure source/docker-testnet/typescript-sdk)
        // 2. source/docker-testnet/config (if running from repo root)
        // 3. Env var?
        const candidates = [
            (0, path_1.resolve)(__dirname, "../../config"), // relative to dist/ or src/
            (0, path_1.resolve)(process.cwd(), "source/docker-testnet/config"),
            (0, path_1.resolve)(process.cwd(), "docker-testnet/config")
        ];
        for (const path of candidates) {
            if ((0, fs_1.existsSync)((0, path_1.resolve)(path, "docker-compose.yaml"))) {
                return path;
            }
        }
        // Explicit check for when installed as node_module (TODO: improve this)
        throw new Error("Could not find docker-testnet/config directory containing docker-compose.yaml");
    }
    /* Internal helper to run compose */
    static async runCompose(args, cwd, envVars, timeoutMs = 60000) {
        return new Promise((resolve, reject) => {
            const env = { ...process.env, ...envVars };
            const proc = (0, child_process_1.spawn)(DOCKER_BIN, ["compose", ...args], { cwd, env });
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
                    }
                    else {
                        reject(new Error(`docker compose ${args.join(" ")} timed out after ${timeoutMs}ms`));
                    }
                }
            }, timeoutMs);
            proc.stdout?.on("data", (data) => stdout += data.toString());
            proc.stderr?.on("data", (data) => stderr += data.toString());
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
    /* Check if Docker is available and running */
    static async ensureDockerRunning() {
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)(DOCKER_BIN, ["info"], {
                stdio: ["ignore", "pipe", "pipe"],
            });
            proc.on("close", (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error("Docker Daemon is not running. Please start Docker and try again."));
                }
            });
            proc.on("error", (err) => {
                if (err.code === "ENOENT") {
                    reject(new Error(`Docker binary '${DOCKER_BIN}' not found in PATH.`));
                }
                else {
                    reject(new Error(`Failed to check Docker status: ${err.message}`));
                }
            });
        });
    }
}
exports.DockerTestnet = DockerTestnet;
/**
 * Wait for all validators to become healthy
 */
async function waitForHealthy(numValidators, timeoutSecs) {
    const deadline = Date.now() + timeoutSecs * 1000;
    console.log(`  Waiting for ${numValidators} validators to become healthy...`);
    while (Date.now() < deadline) {
        let healthyCount = 0;
        for (let i = 0; i < numValidators; i++) {
            const url = `http://127.0.0.1:${BASE_API_PORT + i}/v1`;
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
                if (response.ok) {
                    healthyCount++;
                }
            }
            catch {
                // Validator not ready yet
            }
        }
        if (healthyCount === numValidators) {
            console.log(`  ✓ All ${numValidators} validators healthy`);
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Timeout waiting for validators. Check 'docker compose logs' for details.");
}
