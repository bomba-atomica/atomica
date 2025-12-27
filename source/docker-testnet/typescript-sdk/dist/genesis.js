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
const TOOLS_IMAGE = "aptoslabs/tools:devnet"; // Image with aptos CLI
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
 * Run the genesis generation script inside Docker
 */
function runGenesisScript(config) {
    const { workspaceDir, scriptPath, numValidators, chainId, baseIp } = config;
    return new Promise((resolve, reject) => {
        // Mount both the workspace and the script
        const dockerArgs = [
            "run",
            "--rm",
            "-v", `${workspaceDir}:/workspace`,
            "-v", `${scriptPath}:/scripts/generate-genesis.sh:ro`,
            "-w", "/workspace",
            TOOLS_IMAGE,
            "/bin/bash",
            "/scripts/generate-genesis.sh",
            numValidators.toString(),
            chainId.toString(),
            baseIp,
        ];
        console.log(`  Running genesis script in Docker container...`);
        const proc = (0, child_process_1.spawn)(DOCKER_BIN, dockerArgs, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        proc.stdout?.on("data", (data) => {
            const text = data.toString();
            stdout += text;
            // Print progress lines
            for (const line of text.split("\n")) {
                if (line.startsWith("Step") || line.startsWith("===") || line.startsWith("Waypoint:")) {
                    console.log(`  ${line}`);
                }
            }
        });
        proc.stderr?.on("data", (data) => (stderr += data.toString()));
        proc.on("close", (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`Genesis generation failed (exit ${code}):\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
            }
        });
        proc.on("error", (err) => {
            if (err.code === "ENOENT") {
                reject(new Error(`Docker not found. Please install Docker.`));
            }
            else {
                reject(new Error(`Failed to run genesis script: ${err.message}`));
            }
        });
    });
}
