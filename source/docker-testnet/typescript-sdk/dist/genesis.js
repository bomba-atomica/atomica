"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGenesis = generateGenesis;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Genesis generation for multi-validator testnets using Docker
 *
 * This module runs a shell script inside a Docker container to generate
 * all genesis artifacts, avoiding complex orchestration from TypeScript.
 */
const DOCKER_BIN = "docker";
/** Debug logging - controlled by DEBUG_TESTNET env var */
const DEBUG = process.env.DEBUG_TESTNET === "1" || process.env.DEBUG_TESTNET === "true";
function debug(message, data) {
    if (DEBUG) {
        const timestamp = new Date().toISOString();
        if (data) {
            console.log(`[GENESIS DEBUG ${timestamp}] ${message}`, JSON.stringify(data, null, 2));
        }
        else {
            console.log(`[GENESIS DEBUG ${timestamp}] ${message}`);
        }
    }
}
/**
 * Generate a multi-validator genesis for local testnet
 *
 * Runs the generate-genesis.sh script inside a Docker container,
 * producing all necessary artifacts in workspaceDir.
 */
async function generateGenesis(config) {
    const { numValidators, chainId, workspaceDir, baseIp = "172.19.0.10" } = config;
    console.log(`Generating genesis for ${numValidators} validators...`);
    // Clean workspace if it exists
    if ((0, fs_1.existsSync)(workspaceDir)) {
        (0, fs_1.rmSync)(workspaceDir, { recursive: true, force: true });
    }
    (0, fs_1.mkdirSync)(workspaceDir, { recursive: true });
    // Find the config directory containing the genesis script
    const configDir = (0, path_1.resolve)(workspaceDir, "..", "config");
    const scriptPath = (0, path_1.resolve)(configDir, "generate-genesis.sh");
    if (!(0, fs_1.existsSync)(scriptPath)) {
        throw new Error(`Genesis script not found at: ${scriptPath}`);
    }
    // Run the genesis script in Docker
    await runGenesisScript({
        workspaceDir,
        scriptPath,
        numValidators,
        chainId,
        baseIp,
    });
    console.log(`Genesis generation complete!`);
}
/**
 * Run the genesis generation script inside Docker container
 * This ensures the aptos CLI version matches the Move framework version
 */
function runGenesisScript(config) {
    const { workspaceDir, scriptPath, numValidators, chainId, baseIp } = config;
    return new Promise((resolve, reject) => {
        console.log(`  Running genesis script in Docker container...`);
        // Get the validator image name from environment or use default
        const validatorImage = process.env.IMAGE_NAME ||
            `${process.env.VALIDATOR_IMAGE_REPO || "ghcr.io/bomba-atomica/atomica-aptos/validator"}:${process.env.IMAGE_TAG || "latest"}`;
        // Find the framework.mrb file - try multiple possible locations relative to workspaceDir
        const possiblePaths = [
            (0, path_1.resolve)(workspaceDir, "..", "..", "..", "move-framework-fixtures", "head.mrb"),
            (0, path_1.resolve)(workspaceDir, "..", "..", "move-framework-fixtures", "head.mrb"),
            (0, path_1.resolve)(process.cwd(), "..", "move-framework-fixtures", "head.mrb"),
            "/Users/lucas/code/rust/atomica-docker-infra/source/move-framework-fixtures/head.mrb",
        ];
        let frameworkPath = "";
        for (const p of possiblePaths) {
            if ((0, fs_1.existsSync)(p)) {
                frameworkPath = p;
                break;
            }
        }
        if (!frameworkPath) {
            reject(new Error(`Framework file not found. Tried: ${possiblePaths.join(", ")}`));
            return;
        }
        debug("Using framework at: " + frameworkPath);
        debug("Using validator image: " + validatorImage);
        // Run the script inside Docker container with the same image that will run validators
        // This ensures aptos CLI version matches the Move framework version
        const dockerArgs = [
            "run",
            "--rm",
            "-v",
            `${workspaceDir}:/workspace`,
            "-v",
            `${scriptPath}:/genesis-script.sh:ro`,
            "-v",
            `${frameworkPath}:/framework.mrb:ro`,
            "-w",
            "/workspace",
            "--entrypoint",
            "/bin/bash",
            validatorImage,
            "/genesis-script.sh",
            numValidators.toString(),
            chainId.toString(),
            baseIp,
        ];
        debug("Starting docker run with args:", { dockerArgs });
        const proc = (0, child_process_1.spawn)(DOCKER_BIN, dockerArgs, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        proc.stdout?.on("data", (data) => {
            const text = data.toString();
            stdout += text;
            // Print output to console so the user knows what's happening
            for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                if (DEBUG) {
                    console.log(`  [STDOUT] ${trimmed}`);
                }
                else {
                    console.log(`  ${trimmed}`);
                }
            }
        });
        proc.stderr?.on("data", (data) => {
            const text = data.toString();
            stderr += text;
            if (DEBUG) {
                for (const line of text.split("\n")) {
                    if (line.trim())
                        console.log(`  [STDERR] ${line}`);
                }
            }
        });
        proc.on("close", (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`Genesis generation failed (exit ${code}):\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
            }
        });
        proc.on("error", (err) => {
            reject(new Error(`Failed to run genesis script in Docker: ${err.message}`));
        });
    });
}
