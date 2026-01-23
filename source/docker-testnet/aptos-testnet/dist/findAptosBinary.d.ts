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
/**
 * Finds the aptos binary by checking multiple locations.
 *
 * @returns The absolute path to the aptos binary
 * @throws Error if no aptos binary is found in any location
 */
export declare function findAptosBinary(): string;
