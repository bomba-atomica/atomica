import { spawn } from "child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { resolve as pathResolve } from "path";

/**
 * Genesis generation for multi-validator testnets using Docker
 *
 * This module runs a shell script inside a Docker container to generate
 * all genesis artifacts, avoiding complex orchestration from TypeScript.
 */

const DOCKER_BIN = "docker";

/** Debug logging - controlled by ATOMICA_DEBUG_TESTNET env var */
const DEBUG =
    process.env.ATOMICA_DEBUG_TESTNET === "1" || process.env.ATOMICA_DEBUG_TESTNET === "true";

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

function extractImageFromCompose(configDir: string): string | null {
    try {
        const composePath = pathResolve(configDir, "docker-compose.yaml");
        if (!existsSync(composePath)) return null;

        const content = readFileSync(composePath, "utf-8");
        // Look for image: "${IMAGE_NAME:-...}"
        const match = content.match(/image:\s*"?\$\{IMAGE_NAME:-([^"}]+)\}"?/);
        if (match && match[1]) {
            return match[1];
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Run the genesis generation script inside Docker container
 * This ensures the aptos CLI version matches the Move framework version
 */
function runGenesisScript(config: ScriptConfig): Promise<void> {
    const { workspaceDir, scriptPath, numValidators, chainId, baseIp } = config;

    return new Promise((resolve, reject) => {
        console.log(`  Running genesis script in Docker container...`);

        // Use the specific SHA pinned image for stability in CI and production.
        // Priority: Env Var > Docker Compose Default > Hardcoded Fallback

        // Try to extract from docker-compose to ensure consistency
        const configDir = pathResolve(workspaceDir, "..", "config");
        const composeImage = extractImageFromCompose(configDir);

        const genesisImage =
            process.env.IMAGE_NAME ||
            composeImage ||
            process.env.VALIDATOR_IMAGE_REPO ||
            "ghcr.io/bomba-atomica/atomica-aptos/validator:latest";

        const validatorImage = genesisImage;

        // Find the framework.mrb file - try multiple possible locations relative to workspaceDir
        // Note: We prefer using the framework embedded in the Docker image to ensure
        // compatibility between the genesis and the validator binary.
        let frameworkPath = "";

        if (process.env.FORCE_LOCAL_FRAMEWORK) {
            const overridePath = process.env.FORCE_LOCAL_FRAMEWORK;
            // Basic check if it's a path or just a boolean flag
            if (overridePath === "true" || overridePath === "1") {
                console.warn(
                    "Warning: FORCE_LOCAL_FRAMEWORK set to 'true', but expected a file path. Using default image framework.",
                );
            } else if (existsSync(overridePath)) {
                frameworkPath = overridePath;
                debug("Using local framework override at: " + frameworkPath);
            } else {
                console.warn(
                    `Warning: FORCE_LOCAL_FRAMEWORK path not found: ${overridePath}. Using default image framework.`,
                );
            }
        } else {
            debug("Using framework from Docker image (default)");
        }

        debug("Using genesis image: " + genesisImage);
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
        ];

        if (frameworkPath) {
            dockerArgs.push("-v", `${frameworkPath}:/framework.mrb:ro`);
        }

        dockerArgs.push("-w", "/workspace", "--entrypoint", "/bin/bash");

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

        // Pass ATOMICA_DEBUG_TESTNET to container if set
        if (process.env.ATOMICA_DEBUG_TESTNET) {
            dockerArgs.push("-e", `ATOMICA_DEBUG_TESTNET=${process.env.ATOMICA_DEBUG_TESTNET}`);
        }

        // Pass all deterministic credentials so the genesis script never generates random keys
        const credentialEnvVars = [
            "APTOS_ROOT_ACCOUNT_PUBLIC_KEY",
            ...Array.from({ length: config.numValidators }, (_, i) => [
                `APTOS_VALIDATOR_${i}_ACCOUNT_ADDRESS`,
                `APTOS_VALIDATOR_${i}_ACCOUNT_PUBLIC_KEY`,
                `APTOS_VALIDATOR_${i}_ACCOUNT_PRIVATE_KEY`,
                `APTOS_VALIDATOR_${i}_CONSENSUS_PUBLIC_KEY`,
                `APTOS_VALIDATOR_${i}_CONSENSUS_PROOF_OF_POSSESSION`,
                `APTOS_VALIDATOR_${i}_CONSENSUS_PRIVATE_KEY`,
                `APTOS_VALIDATOR_${i}_FULL_NODE_NETWORK_PUBLIC_KEY`,
                `APTOS_VALIDATOR_${i}_FULL_NODE_NETWORK_PRIVATE_KEY`,
                `APTOS_VALIDATOR_${i}_VALIDATOR_NETWORK_PUBLIC_KEY`,
                `APTOS_VALIDATOR_${i}_VALIDATOR_NETWORK_PRIVATE_KEY`,
            ]).flat(),
        ];
        for (const varName of credentialEnvVars) {
            const value = process.env[varName];
            if (!value) {
                throw new Error(
                    `Missing required credential env var: ${varName}. Load source/.env.test before running genesis.`,
                );
            }
            dockerArgs.push("-e", `${varName}=${value}`);
        }

        dockerArgs.push(
            genesisImage,
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
                if (
                    trimmed.startsWith("Root account keys saved to") ||
                    trimmed.startsWith("Creating node configurations")
                ) {
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
