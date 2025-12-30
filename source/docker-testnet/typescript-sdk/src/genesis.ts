import { spawn } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { resolve as pathResolve } from "path";

/**
 * Genesis generation for multi-validator testnets using Docker
 *
 * This module runs a shell script inside a Docker container to generate
 * all genesis artifacts, avoiding complex orchestration from TypeScript.
 */

const DOCKER_BIN = "docker";

/** Debug logging - controlled by DEBUG_TESTNET env var */
const DEBUG = process.env.DEBUG_TESTNET === "1" || process.env.DEBUG_TESTNET === "true";

function debug(message: string, data?: Record<string, unknown>): void {
    if (DEBUG) {
        const timestamp = new Date().toISOString();
        if (data) {
            console.log(`[GENESIS DEBUG ${timestamp}] ${message}`, JSON.stringify(data, null, 2));
        } else {
            console.log(`[GENESIS DEBUG ${timestamp}] ${message}`);
        }
    }
}

interface GenesisConfig {
    numValidators: number;
    chainId: number;
    workspaceDir: string;
    baseIp?: string; // Base IP for validators (default: 172.19.0.10)
}

/**
 * Generate a multi-validator genesis for local testnet
 *
 * Runs the generate-genesis.sh script inside a Docker container,
 * producing all necessary artifacts in workspaceDir.
 */
export async function generateGenesis(config: GenesisConfig): Promise<void> {
    const { numValidators, chainId, workspaceDir, baseIp = "172.19.0.10" } = config;

    console.log(`Generating genesis for ${numValidators} validators...`);

    // Clean workspace if it exists
    if (existsSync(workspaceDir)) {
        rmSync(workspaceDir, { recursive: true, force: true });
    }
    mkdirSync(workspaceDir, { recursive: true });

    // Find the config directory containing the genesis script
    const configDir = pathResolve(workspaceDir, "..", "config");
    const scriptPath = pathResolve(configDir, "generate-genesis.sh");

    if (!existsSync(scriptPath)) {
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

interface ScriptConfig {
    workspaceDir: string;
    scriptPath: string;
    numValidators: number;
    chainId: number;
    baseIp: string;
}

/**
 * Run the genesis generation script inside Docker container
 * This ensures the aptos CLI version matches the Move framework version
 */
function runGenesisScript(config: ScriptConfig): Promise<void> {
    const { workspaceDir, scriptPath, numValidators, chainId, baseIp } = config;

    return new Promise((resolve, reject) => {
        console.log(`  Running genesis script in Docker container...`);

        // Get the validator image name from environment or use default
        const validatorImage =
            process.env.IMAGE_NAME ||
            `${process.env.VALIDATOR_IMAGE_REPO || "ghcr.io/bomba-atomica/atomica-aptos/validator"}:${process.env.IMAGE_TAG || "latest"}`;

        // Find the framework.mrb file - try multiple possible locations relative to workspaceDir
        const possiblePaths = [
            pathResolve(workspaceDir, "..", "..", "..", "move-framework-fixtures", "head.mrb"),
            pathResolve(workspaceDir, "..", "..", "move-framework-fixtures", "head.mrb"),
            pathResolve(process.cwd(), "..", "move-framework-fixtures", "head.mrb"),
            "/Users/lucas/code/rust/atomica-docker-infra/source/move-framework-fixtures/head.mrb",
        ];

        let frameworkPath = "";
        for (const p of possiblePaths) {
            if (existsSync(p)) {
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
        ];

        // Run as current user to avoid permission issues with bind mounts
        if (
            process.platform !== "win32" &&
            typeof process.getuid === "function" &&
            typeof process.getgid === "function"
        ) {
            dockerArgs.push("--user", `${process.getuid()}:${process.getgid()}`);
        }

        // Set HOME to a writable location (important when running as non-root)
        dockerArgs.push("-e", "HOME=/tmp");

        dockerArgs.push(
            validatorImage,
            "/genesis-script.sh",
            numValidators.toString(),
            chainId.toString(),
            baseIp,
        );

        debug("Starting docker run with args:", { dockerArgs });

        const proc = spawn(DOCKER_BIN, dockerArgs, {
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        proc.stdout?.on("data", (data) => {
            const text = data.toString();
            stdout += text;

            // Print output to console so the user knows what's happening
            // Filter out verbose output that's not useful for users
            let inJsonBlock = false;

            for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Skip "Missing CF:" warnings (expected during genesis initialization)
                if (trimmed.includes("Missing CF:")) {
                    if (DEBUG) {
                        console.log(`  [STDOUT] ${trimmed}`);
                    }
                    continue;
                }

                // Filter out verbose JSON output blocks from aptos CLI
                // These show file lists that aren't useful during normal operation
                if (trimmed === "{") {
                    inJsonBlock = true;
                }

                if (inJsonBlock) {
                    if (DEBUG) {
                        console.log(`  [STDOUT] ${trimmed}`);
                    }
                    if (trimmed === "}") {
                        inJsonBlock = false;
                    }
                    continue;
                }

                // Skip verbose file path messages
                if (trimmed.startsWith("Root account keys saved to") ||
                    trimmed.startsWith("Creating node configurations")) {
                    if (DEBUG) {
                        console.log(`  [STDOUT] ${trimmed}`);
                    }
                    continue;
                }

                if (DEBUG) {
                    console.log(`  [STDOUT] ${trimmed}`);
                } else {
                    console.log(`  ${trimmed}`);
                }
            }
        });

        proc.stderr?.on("data", (data) => {
            const text = data.toString();
            stderr += text;
            if (DEBUG) {
                for (const line of text.split("\n")) {
                    if (line.trim()) console.log(`  [STDERR] ${line}`);
                }
            }
        });

        proc.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `Genesis generation failed (exit ${code}):\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
                    ),
                );
            }
        });

        proc.on("error", (err: any) => {
            reject(new Error(`Failed to run genesis script in Docker: ${err.message}`));
        });
    });
}
