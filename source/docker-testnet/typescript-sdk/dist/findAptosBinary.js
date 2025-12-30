"use strict";
/**
 * Find Aptos CLI Binary
 *
 * Locates the Aptos CLI binary for running commands in Docker SDK.
 * Checks multiple locations and returns the most recently modified binary.
 *
 * SEARCH LOCATIONS (in order checked):
 * 1. source/target/release/aptos (workspace release build)
 * 2. source/target/debug/aptos (workspace debug build)
 * 3. User's $PATH (global install, e.g., ~/.cargo/bin/aptos)
 *
 * SELECTION STRATEGY:
 * - If multiple binaries found, uses most recently modified
 * - Logs selected binary path and modification time
 * - Logs other candidates for debugging
 *
 * WHY CHECK WORKSPACE FIRST:
 * - Tests may need specific Aptos version
 * - Local build ensures latest framework
 * - Development changes require local binary
 *
 * USAGE:
 *   import { findAptosBinary } from "./findAptosBinary";
 *   const APTOS_BIN = findAptosBinary();
 *   // APTOS_BIN now contains path to binary
 *
 * IMPORTANT:
 * - Called once at module load in index.ts
 * - Throws if no binary found (fail fast)
 * - Skips node_modules binaries (npm wrapper scripts)
 * - Prefers workspace build over global install
 *
 * TROUBLESHOOTING:
 * - "aptos binary not found" → Build with: `cargo build -p aptos`
 * - Or install globally: `cargo install --git https://github.com/aptos-labs/aptos-core aptos`
 * - Check logs to see which binary was selected
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAptosBinary = findAptosBinary;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
/**
 * Finds the aptos binary by checking multiple locations.
 *
 * @returns The absolute path to the aptos binary
 * @throws Error if no aptos binary is found in any location
 */
function findAptosBinary() {
    const candidates = [];
    // Determine workspace root (atomica/source directory)
    // Docker SDK is at: source/docker-testnet/typescript-sdk/src
    const currentDir = __dirname; // typescript-sdk/src
    const sdkDir = (0, path_1.resolve)(currentDir, ".."); // typescript-sdk
    const dockerTestnetDir = (0, path_1.resolve)(sdkDir, ".."); // docker-testnet
    const sourceDir = (0, path_1.resolve)(dockerTestnetDir, ".."); // source
    // Check source/target/release/aptos
    const releasePath = (0, path_1.join)(sourceDir, "target/release/aptos");
    if ((0, fs_1.existsSync)(releasePath)) {
        const stats = (0, fs_1.statSync)(releasePath);
        candidates.push({ path: releasePath, mtime: stats.mtime });
    }
    // Check source/target/debug/aptos
    const debugPath = (0, path_1.join)(sourceDir, "target/debug/aptos");
    if ((0, fs_1.existsSync)(debugPath)) {
        const stats = (0, fs_1.statSync)(debugPath);
        candidates.push({ path: debugPath, mtime: stats.mtime });
    }
    // Check user's $PATH (findInPath already filters out node_modules)
    const pathBinary = findInPath("aptos");
    if (pathBinary) {
        const stats = (0, fs_1.statSync)(pathBinary);
        candidates.push({ path: pathBinary, mtime: stats.mtime });
    }
    // If no candidates found, throw error
    if (candidates.length === 0) {
        throw new Error(`aptos binary not found. Checked:\n` +
            `  - ${releasePath}\n` +
            `  - ${debugPath}\n` +
            `  - $PATH\n\n` +
            `Please build the aptos CLI:\n` +
            `  cd ${sourceDir} && cargo build -p aptos\n` +
            `Or ensure aptos is installed in your $PATH.`);
    }
    // Sort by modification time (most recent first) and return the newest
    candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const selected = candidates[0];
    console.log(`[findAptosBinary] Using aptos binary: ${selected.path}`);
    console.log(`[findAptosBinary] Last modified: ${selected.mtime.toISOString()}`);
    if (candidates.length > 1) {
        console.log(`[findAptosBinary] Other candidates found (older):`);
        for (let i = 1; i < candidates.length; i++) {
            console.log(`  - ${candidates[i].path} (${candidates[i].mtime.toISOString()})`);
        }
    }
    return selected.path;
}
/**
 * Searches for a binary in the user's $PATH
 * Skips node_modules wrappers and looks for the real CLI binary
 *
 * @param binaryName The name of the binary to find
 * @returns The absolute path to the binary, or null if not found
 */
function findInPath(binaryName) {
    // Use 'which -a' to get all matches, then filter out node_modules
    const result = (0, child_process_1.spawnSync)("which", ["-a", binaryName], {
        encoding: "utf-8",
        stdio: "pipe",
    });
    if (result.status === 0 && result.stdout) {
        const paths = result.stdout.trim().split("\n");
        // Find first path that doesn't include node_modules
        for (const path of paths) {
            const trimmedPath = path.trim();
            if (trimmedPath &&
                (0, fs_1.existsSync)(trimmedPath) &&
                !trimmedPath.includes("node_modules")) {
                return trimmedPath;
            }
        }
    }
    return null;
}
