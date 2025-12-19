import { existsSync, statSync } from "node:fs";
import { join, resolve as pathResolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

interface BinaryCandidate {
  path: string;
  mtime: Date;
}

/**
 * Finds the aptos binary by checking multiple locations in priority order:
 * 1. source/target/release/aptos
 * 2. source/target/debug/aptos
 * 3. User's $PATH
 *
 * If multiple binaries are found, returns the most recently modified one.
 *
 * @returns The absolute path to the aptos binary
 * @throws Error if no aptos binary is found
 */
export function findAptosBinary(): string {
  const candidates: BinaryCandidate[] = [];

  // Determine workspace root (atomica/source directory)
  const currentDir = dirname(fileURLToPath(import.meta.url)); // atomica-web/tests/utils
  const webDir = pathResolve(currentDir, "../.."); // atomica-web
  const sourceDir = pathResolve(webDir, ".."); // source

  // Check source/target/release/aptos
  const releasePath = join(sourceDir, "target/release/aptos");
  if (existsSync(releasePath)) {
    const stats = statSync(releasePath);
    candidates.push({ path: releasePath, mtime: stats.mtime });
  }

  // Check source/target/debug/aptos
  const debugPath = join(sourceDir, "target/debug/aptos");
  if (existsSync(debugPath)) {
    const stats = statSync(debugPath);
    candidates.push({ path: debugPath, mtime: stats.mtime });
  }

  // Check user's $PATH (findInPath already filters out node_modules)
  const pathBinary = findInPath("aptos");
  if (pathBinary) {
    const stats = statSync(pathBinary);
    candidates.push({ path: pathBinary, mtime: stats.mtime });
  }

  // If no candidates found, throw error
  if (candidates.length === 0) {
    throw new Error(
      `aptos binary not found. Checked:\n` +
        `  - ${releasePath}\n` +
        `  - ${debugPath}\n` +
        `  - $PATH\n\n` +
        `Please build the aptos CLI:\n` +
        `  cd ${sourceDir} && cargo build -p aptos\n` +
        `Or ensure aptos is installed in your $PATH.`,
    );
  }

  // Sort by modification time (most recent first) and return the newest
  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const selected = candidates[0];
  console.log(`[findAptosBinary] Using aptos binary: ${selected.path}`);
  console.log(
    `[findAptosBinary] Last modified: ${selected.mtime.toISOString()}`,
  );

  if (candidates.length > 1) {
    console.log(`[findAptosBinary] Other candidates found (older):`);
    for (let i = 1; i < candidates.length; i++) {
      console.log(
        `  - ${candidates[i].path} (${candidates[i].mtime.toISOString()})`,
      );
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
function findInPath(binaryName: string): string | null {
  // Use 'which -a' to get all matches, then filter out node_modules
  const result = spawnSync("which", ["-a", binaryName], {
    encoding: "utf-8",
    stdio: "pipe",
  });

  if (result.status === 0 && result.stdout) {
    const paths = result.stdout.trim().split("\n");

    // Find first path that doesn't include node_modules
    for (const path of paths) {
      const trimmedPath = path.trim();
      if (trimmedPath && existsSync(trimmedPath) && !trimmedPath.includes("node_modules")) {
        return trimmedPath;
      }
    }
  }

  return null;
}
