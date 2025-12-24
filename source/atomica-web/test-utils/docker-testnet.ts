/**
 * Docker Testnet Harness for Node.js Tests
 *
 * This module provides a `DockerTestnet` class that automatically manages
 * a 4-validator Docker testnet, similar to the Rust `DockerTestnet` harness.
 *
 * KEY FEATURES:
 * - Automatic setup: Fresh testnet for each test file
 * - Automatic teardown: Cleanup on test completion (even on failure)
 * - Full isolation: Each test gets clean state
 * - Progress verification: Waits for blockchain to make progress before tests run
 *
 * USAGE PATTERN (matches Rust harness):
 *
 * ```typescript
 * import { DockerTestnet } from "../../test-utils/docker-testnet";
 *
 * describe("My Test Suite", () => {
 *   let testnet: DockerTestnet;
 *
 *   beforeAll(async () => {
 *     testnet = await DockerTestnet.new(4);  // 4 validators
 *   }, 120000);
 *
 *   afterAll(async () => {
 *     await testnet.teardown();
 *   });
 *
 *   it("should test something", async () => {
 *     const height = await testnet.getBlockHeight(0);
 *     // ... test logic ...
 *   });
 * });
 * ```
 *
 * NOTES:
 * - Tests must run sequentially (vitest fileParallelism: false)
 * - Uses pre-built images: ghcr.io/0o-de-lally/atomica/zapatos-bin:5df0e6d1
 * - Validators on ports 8080-8083
 * - Automatic cleanup even on test failure
 */

import { spawn } from "child_process";
import { resolve as pathResolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

/**
 * Directory paths
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_DIR = pathResolve(__dirname, "..");
const DOCKER_TESTNET_DIR = pathResolve(WEB_DIR, "../../docker-testnet");

/** Base API port for validators (incremented for each validator) */
const BASE_API_PORT = 8080;

/** Docker binary path */
const DOCKER_BIN = "/usr/local/bin/docker";

/**
 * Load environment variables from atomica-web/.env file
 * These override the defaults in docker-testnet/.env
 */
function loadEnvVariables(): Record<string, string> {
  const envPath = pathResolve(WEB_DIR, ".env");
  const envVars: Record<string, string> = {};

  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");

    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed === "") {
        continue;
      }

      // Parse KEY=VALUE
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        envVars[key] = value;
      }
    }
  }

  return envVars;
}

/**
 * Execute a docker compose command with timeout
 */
async function runCompose(
  args: string[],
  cwd: string = DOCKER_TESTNET_DIR,
  timeoutMs: number = 60000, // 60 second timeout
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Load environment variables from atomica-web/.env
    const envVars = loadEnvVariables();
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
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`docker compose ${args.join(" ")} timed out after ${timeoutMs}ms`));
        }
      }
    }, timeoutMs);

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (finished) return; // Already handled by timeout
      finished = true;
      clearTimeout(timeout);

      // Don't error on 'down' commands as they're used for cleanup
      if (code === 0 || args[0] === "down") {
        resolve({ stdout, stderr });
      } else {
        // Provide helpful diagnostics for common failures
        const errorLines = [
          `❌ docker compose ${args.join(" ")} failed (exit ${code})`,
          "",
        ];

        // Check for image pull authentication errors
        if (stderr.includes("failed to authorize") || stderr.includes("401 Unauthorized")) {
          errorLines.push(
            "Diagnosis: Unable to pull Docker image from GitHub Container Registry",
            "",
            "The image ghcr.io/0o-de-lally/atomica/zapatos-bin:5df0e6d1 is private.",
            "",
            "Solutions:",
            "",
            "Option 1: Authenticate with GitHub Container Registry (GHCR)",
            "  1. Create a GitHub Personal Access Token (Classic):",
            "     - Go to: https://github.com/settings/tokens",
            "     - Click 'Generate new token' → 'Generate new token (classic)'",
            "     - Note: 'GHCR access for atomica docker images'",
            "     - Select scope: read:packages",
            "     - Click 'Generate token' and copy it",
            "     - Important: Fine-grained tokens don't support package registry",
            "  2. Update source/atomica-web/.env:",
            "     VALIDATOR_IMAGE_REPO=ghcr.io/0o-de-lally/atomica/zapatos-bin",
            "     IMAGE_TAG=5df0e6d1",
            "     GHCR_USERNAME=your_github_username",
            "     GHCR_TOKEN=ghp_YourPersonalAccessTokenHere",
            "  3. Run the test again (authentication happens automatically)",
            "",
            "Option 2: Build the image locally from source",
            "  1. Navigate to docker-testnet directory:",
            "     cd docker-testnet",
            "  2. Build the image (10-20 minutes first time):",
            "     ./build-local-image.sh",
            "  3. Update docker-testnet/.env to use local image:",
            "     VALIDATOR_IMAGE_REPO=zapatos-testnet/validator",
            "     IMAGE_TAG=latest",
            "  4. Run the test again",
            "",
            "Recommended: Use Option 2 (build locally) for development",
            "",
          );
        } else if (
          stderr.includes("no such image") ||
          stderr.includes("image not found") ||
          stderr.includes("pull access denied") ||
          stderr.includes("repository does not exist")
        ) {
          errorLines.push(
            "Diagnosis: Docker image not found locally and cannot be pulled",
            "",
            "The image needs to be built from source.",
            "",
            "Solution:",
            "  1. Build the image locally (10-20 minutes first time):",
            "     cd docker-testnet",
            "     ./build-local-image.sh",
            "",
            "  2. Your atomica-web/.env is already configured for local images:",
            "     VALIDATOR_IMAGE_REPO=zapatos-testnet/validator",
            "     IMAGE_TAG=latest",
            "",
            "  3. Run the test again:",
            "     npm run test:docker",
            "",
          );
        } else {
          // Generic error
          errorLines.push(
            "Error output:",
            stderr.trim(),
            "",
          );
        }

        reject(new Error(errorLines.join("\n")));
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

/**
 * Check if the required Docker image is available or accessible
 */
async function checkImageAvailability(): Promise<{
  available: boolean;
  message: string;
}> {
  // Load env vars from atomica-web/.env (falls back to docker-testnet/.env defaults)
  const envVars = loadEnvVariables();

  // Try atomica-web/.env first, then docker-testnet/.env
  let imageRepo = envVars.VALIDATOR_IMAGE_REPO;
  let imageTag = envVars.IMAGE_TAG;

  // If not in atomica-web/.env, check docker-testnet/.env
  if (!imageRepo || !imageTag) {
    const dockerEnvPath = pathResolve(DOCKER_TESTNET_DIR, ".env");
    if (existsSync(dockerEnvPath)) {
      const dockerEnvContent = readFileSync(dockerEnvPath, "utf-8");
      const repoMatch = dockerEnvContent.match(/VALIDATOR_IMAGE_REPO=(.+)/);
      const tagMatch = dockerEnvContent.match(/IMAGE_TAG=(.+)/);

      if (repoMatch) imageRepo = repoMatch[1].trim();
      if (tagMatch) imageTag = tagMatch[1].trim();
    }
  }

  // Use docker-compose defaults if still not found
  if (!imageRepo) imageRepo = "zapatos-testnet/validator";
  if (!imageTag) imageTag = "local";

  const fullImage = `${imageRepo}:${imageTag}`;

  // Check if image exists locally
  return new Promise((resolve) => {
    const proc = spawn(DOCKER_BIN, ["image", "inspect", fullImage], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({
          available: true,
          message: `✓ Image available locally: ${fullImage}`,
        });
      } else {
        // Image not local - check if it's a remote GHCR image
        if (imageRepo.includes("ghcr.io")) {
          resolve({
            available: false,
            message: `⚠ Image not available locally: ${fullImage}\n  This is a private GitHub Container Registry image.\n  See error message below for authentication instructions.`,
          });
        } else {
          // Likely needs to be built
          resolve({
            available: false,
            message: `⚠ Image not available locally: ${fullImage}\n  Run: cd docker-testnet && ./build-local-image.sh`,
          });
        }
      }
    });

    proc.on("error", () => {
      resolve({
        available: false,
        message: "Failed to check image availability",
      });
    });
  });
}

/**
 * Authenticate with GitHub Container Registry if needed
 *
 * In GitHub Actions CI:
 * - When running in the same repo, GITHUB_TOKEN provides automatic access
 * - No explicit docker login needed for packages in the same org/repo
 * - The GITHUB_TOKEN is automatically available and has read:packages scope
 *
 * In local development:
 * - Requires explicit credentials (GHCR_USERNAME + GHCR_TOKEN)
 * - Must use Personal Access Token (Classic) with read:packages scope
 */
async function authenticateGHCR(envVars: Record<string, string>): Promise<void> {
  const imageRepo = envVars.VALIDATOR_IMAGE_REPO || "";

  // Skip if not using GHCR
  if (!imageRepo.includes("ghcr.io")) {
    return;
  }

  // Check if running in GitHub Actions CI
  const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  const githubToken = process.env.GITHUB_TOKEN;

  if (isCI && githubToken) {
    // In GitHub Actions with GITHUB_TOKEN available
    console.log("  Running in GitHub Actions - using GITHUB_TOKEN for GHCR access");

    return new Promise((resolve, reject) => {
      const proc = spawn(DOCKER_BIN, ["login", "ghcr.io", "-u", "github-actions", "--password-stdin"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      // Write GITHUB_TOKEN to stdin
      proc.stdin?.write(githubToken + "\n");
      proc.stdin?.end();

      proc.on("close", (code) => {
        if (code === 0) {
          console.log("  ✓ Authenticated with GHCR using GITHUB_TOKEN");
          resolve();
        } else {
          // In CI, this is non-fatal - image might be public or already authenticated
          console.log("  ⚠ GHCR authentication failed, will attempt to pull anyway");
          console.log("    (Image might be public or cached)");
          resolve(); // Don't fail, let docker compose try
        }
      });

      proc.on("error", (err) => {
        console.log("  ⚠ Docker login failed:", err.message);
        resolve(); // Don't fail in CI
      });
    });
  }

  // Local development - check for explicit credentials
  const username = envVars.GHCR_USERNAME;
  const token = envVars.GHCR_TOKEN;

  if (!username || !token) {
    // No credentials provided - skip authentication
    // Docker compose will attempt to pull and fail with helpful error if needed
    return;
  }

  console.log("  Authenticating with GitHub Container Registry...");

  return new Promise((resolve, reject) => {
    const proc = spawn(DOCKER_BIN, ["login", "ghcr.io", "-u", username, "--password-stdin"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    // Write token to stdin
    proc.stdin?.write(token + "\n");
    proc.stdin?.end();

    proc.on("close", (code) => {
      if (code === 0) {
        console.log("  ✓ Authenticated with GHCR as " + username);
        resolve();
      } else {
        const errorLines = [
          "❌ Failed to authenticate with GitHub Container Registry",
          "",
          "Username: " + username,
          "Registry: ghcr.io",
          "",
        ];

        if (stderr.includes("unauthorized") || stderr.includes("incorrect username or password")) {
          errorLines.push(
            "Diagnosis: Invalid credentials",
            "",
            "Solutions:",
            "  1. Verify GHCR_USERNAME in .env is your GitHub username",
            "  2. Verify GHCR_TOKEN is a valid Personal Access Token (Classic)",
            "  3. Ensure the token has 'read:packages' scope",
            "  4. Create a new token at: https://github.com/settings/tokens",
            "",
          );
        } else {
          errorLines.push("Error output:", stderr.trim(), "");
        }

        reject(new Error(errorLines.join("\n")));
      }
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `Failed to execute docker login: ${err.message}\n\n` +
          "Ensure Docker is installed and running.",
        ),
      );
    });
  });
}

/**
 * Check if Docker is running and daemon is accessible
 */
async function checkDocker(): Promise<void> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(DOCKER_BIN, ["info"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log("✓ Docker daemon is running and accessible");
        resolve();
      } else {
        // Provide detailed diagnostics
        const errorLines = [
          "❌ Docker check failed",
          "",
          "Docker binary found at: " + DOCKER_BIN,
          "Exit code: " + code,
        ];

        if (stderr.includes("Cannot connect to the Docker daemon")) {
          errorLines.push(
            "",
            "Diagnosis: Docker daemon is not running",
            "",
            "Solutions:",
            "  1. Start Docker Desktop application",
            "  2. Wait for Docker to fully start (check menu bar icon)",
            "  3. Verify with: docker info",
            "  4. Try again once Docker is running",
          );
        } else if (stderr.includes("permission denied")) {
          errorLines.push(
            "",
            "Diagnosis: Permission denied accessing Docker",
            "",
            "Solutions:",
            "  1. Add your user to the docker group: sudo usermod -aG docker $USER",
            "  2. Log out and log back in",
            "  3. Or use: sudo docker info",
          );
        } else if (stderr) {
          errorLines.push("", "Docker error output:", stderr.trim());
        }

        if (stdout) {
          errorLines.push("", "Docker info output:", stdout.trim());
        }

        reject(new Error(errorLines.join("\n")));
      }
    });

    proc.on("error", (err) => {
      const errorLines = [
        "❌ Failed to execute Docker command",
        "",
        "Attempted to run: " + DOCKER_BIN,
        "Error: " + err.message,
        "",
      ];

      if (err.message.includes("ENOENT")) {
        errorLines.push(
          "Diagnosis: Docker binary not found",
          "",
          "Solutions:",
          "  1. Install Docker Desktop from https://www.docker.com/products/docker-desktop",
          "  2. Verify installation with: which docker",
          "  3. If Docker is installed elsewhere, update DOCKER_BIN in test-utils/docker-testnet.ts",
        );
      } else {
        errorLines.push(
          "Diagnosis: Unknown error spawning Docker process",
          "Please ensure Docker is installed and accessible",
        );
      }

      reject(new Error(errorLines.join("\n")));
    });
  });
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

    for (let i = 0; i < numValidators; i++) {
      const url = `http://127.0.0.1:${BASE_API_PORT + i}/v1`;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          healthyCount++;
        }
      } catch {
        // Validator not ready yet
      }
    }

    if (healthyCount === numValidators) {
      console.log(`  ✓ All ${numValidators} validators healthy`);
      return;
    }

    console.log(`  ${healthyCount}/${numValidators} validators healthy`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(
    "Timeout waiting for validators. Check 'docker compose logs' for details.",
  );
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
 *
 * This class manages a 4-validator Docker testnet with automatic cleanup.
 * Modeled after the Rust `DockerTestnet` harness.
 *
 * KEY BEHAVIORS:
 * - `new()`: Starts a fresh testnet (cleans up any existing one first)
 * - `teardown()`: Stops and removes all containers/volumes
 * - Each test file gets its own isolated testnet
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
   * This will:
   * 1. Check Docker is running
   * 2. Clean up any existing testnet
   * 3. Start fresh validators
   * 4. Wait for all validators to be healthy
   *
   * @param numValidators Number of validators (typically 4)
   * @returns Promise resolving to DockerTestnet instance
   */
  static async new(numValidators: number): Promise<DockerTestnet> {
    if (numValidators < 1 || numValidators > 7) {
      throw new Error(
        `numValidators must be between 1 and 7, got ${numValidators}`,
      );
    }

    const composeDir = DockerTestnet.findComposeDir();
    await checkDocker();

    // Load environment variables
    const envVars = loadEnvVariables();

    // Authenticate with GHCR if credentials are provided
    await authenticateGHCR(envVars);

    // Check if the required image is available
    console.log("  Checking Docker image availability...");
    const imageCheck = await checkImageAvailability();
    console.log("  " + imageCheck.message.replace(/\n/g, "\n  "));

    if (!imageCheck.available) {
      console.log(
        "\n  ⚠ Attempting to start anyway (docker compose will try to pull)...\n",
      );
    }

    console.log(
      `Setting up fresh Docker testnet with ${numValidators} validators...`,
    );

    // Clean up any existing testnet
    console.log("  Cleaning up any existing testnet...");
    await runCompose(["down", "--remove-orphans", "-v"], composeDir);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start the testnet
    console.log("  Starting validators...");
    // Use 5 minute timeout for 'up' command (image pull can be slow)
    await runCompose(["up", "-d"], composeDir, 300000);

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
   *
   * This removes all containers and volumes for a clean state.
   * Safe to call multiple times.
   */
  async teardown(): Promise<void> {
    console.log("Tearing down Docker testnet...");
    await runCompose(["down", "--remove-orphans", "-v"], this.composeDir);
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
    const startVersion = parseInt(
      (await this.getLedgerInfo(0)).ledger_version,
      10,
    );
    const targetVersion = startVersion + numBlocks;

    console.log(
      `  Waiting for ${numBlocks} blocks (from version ${startVersion} to ${targetVersion})`,
    );

    while (Date.now() < deadline) {
      const currentVersion = parseInt(
        (await this.getLedgerInfo(0)).ledger_version,
        10,
      );
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
  private static findComposeDir(): string {
    // Try various paths relative to the web directory
    const candidates = [
      DOCKER_TESTNET_DIR,
      pathResolve(WEB_DIR, "../../docker-testnet"),
      pathResolve(WEB_DIR, "../../../docker-testnet"),
    ];

    for (const path of candidates) {
      if (existsSync(pathResolve(path, "docker-compose.yaml"))) {
        return path;
      }
    }

    throw new Error(
      "docker-testnet directory not found. Run tests from the atomica root directory.",
    );
  }
}
