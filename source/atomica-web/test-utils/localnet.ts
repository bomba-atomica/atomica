import { spawn, ChildProcess, exec as execCb } from "child_process";
import { resolve as pathResolve, dirname } from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import http from "node:http";
import { rmSync, mkdirSync, existsSync } from "fs";

const exec = promisify(execCb);
let localnetProcess: ChildProcess | null = null;
let setupComplete = false;

import { findAptosBinary } from "./findAptosBinary";

// Ensure cleanup happens on process exit
let cleanupRegistered = false;
let forceExitTimer: NodeJS.Timeout | null = null;

function registerCleanupHandlers() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const cleanup = () => {
    if (localnetProcess && !localnetProcess.killed) {
      console.log("\n[Cleanup] Killing localnet process...");
      try {
        localnetProcess.kill("SIGKILL");
      } catch (e) {
        // Process may already be dead
      }
      localnetProcess = null;
    }
  };

  // Register handlers for various exit scenarios
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
    cleanup();
    process.exit(1);
  });
}

// Adjust paths relative to this file's location
const TEST_SETUP_DIR = dirname(fileURLToPath(import.meta.url));
const APTOS_BIN = findAptosBinary();
const WEB_DIR = pathResolve(TEST_SETUP_DIR, "..");

export async function killZombies() {
  try {
    console.log("Cleaning up zombie Aptos processes...");

    // Initial kill attempt
    await exec("pkill -f 'aptos' || true");

    const ports = [8070, 8080, 8081, 9101, 9102, 50051, 6180, 6181, 7180];

    // Retry loop to ensure ports are free
    const start = Date.now();
    while (Date.now() - start < 10000) {
      // 10s timeout
      let busyPorts = [];
      for (const port of ports) {
        try {
          const { stdout } = await exec(`lsof -ti :${port} || true`);
          const pids = stdout
            .trim()
            .split("\n")
            .filter((pid) => pid);
          if (pids.length > 0) {
            busyPorts.push(port);
            for (const pid of pids) {
              // console.log(`Killing process ${pid} on port ${port}`);
              await exec(`kill -9 ${pid} || true`);
            }
          }
        } catch {
          // lsof failed implies port free or error
        }
      }

      if (busyPorts.length === 0) {
        // Double check after a brief pause
        await new Promise((r) => setTimeout(r, 500));
        // We could check again but let's assume if 0 found, we are good.
        // Actually, let's verify cleanliness.
        // If we found nothing, break.
        break;
      }

      console.log(`Waiting for ports ${busyPorts.join(", ")} to free...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Clean up stale localnet directory
    const LOCAL_TEST_DIR = pathResolve(WEB_DIR, ".aptos/testnet");
    if (existsSync(LOCAL_TEST_DIR)) {
      // console.log(`Removing stale localnet directory: ${LOCAL_TEST_DIR}`);
      rmSync(LOCAL_TEST_DIR, { recursive: true, force: true });
    }
  } catch {
    // Ignore errors
  }
}

const CONTRACTS_DIR = pathResolve("../atomica-move-contracts");
const TEST_CONFIG_DIR = pathResolve(".aptos_test_config");

export async function fundAccount(
  address: string,
  amount: number = 100_000_000,
): Promise<string> {
  const maxRetries = 3;
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(
        `[fundAccount] Requesting ${amount} for ${address}... (Attempt ${i + 1}/${maxRetries})`,
      );
      return await new Promise<string>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:8081/mint?amount=${amount}&address=${address}`,
          { method: "POST" },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              if (res.statusCode === 200) {
                console.log(`[fundAccount] Success: ${data}`);
                resolve(data);
              } else {
                reject(
                  new Error(
                    `Funding failed with status: ${res.statusCode} Body: ${data}`,
                  ),
                );
              }
            });
          },
        );
        req.on("error", (e) => reject(e));
        req.end();
      });
    } catch (e) {
      console.error(`[fundAccount] Attempt ${i + 1} failed:`, e);
      lastError = e;
      await new Promise((r) => setTimeout(r, 1000)); // Wait before retry
    }
  }
  throw lastError || new Error("Funding failed after retries");
}

const DEPLOYER_PK =
  "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";

export async function runAptosCmd(
  args: string[],
  cwd: string = WEB_DIR,
): Promise<{ stdout: string; stderr: string }> {
  // Ensure config dir exists
  if (!existsSync(TEST_CONFIG_DIR)) {
    mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(APTOS_BIN, args, {
      cwd,
      // Isolate config
      env: {
        ...process.env,
        RUST_LOG: "warn",
        // Position trace.log alongside validator.log in the test directory
        MOVE_VM_TRACE: pathResolve(
          process.env.HOME || "",
          ".aptos/testnet/trace.log",
        ),
        APTOS_GLOBAL_CONFIG_DIR: TEST_CONFIG_DIR,
        APTOS_DISABLE_TELEMETRY: "true",
      },
      stdio: "pipe", // Capture output
    });
    proc.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      // process.stdout.write(`[Aptos Out] ${s}`); // Debug
    });
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      // process.stderr.write(`[Aptos Err] ${s}`); // Debug
    });
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `Aptos cmd failed with code ${code}: ${args.join(" ")}\nStderr: ${stderr}\nStdout: ${stdout}`,
          ),
        );
    });
  });
}

let contractsDeployed = false;

export async function deployContracts() {
  // Guard against double deployment (globalSetup may run twice in browser mode)
  if (contractsDeployed) {
    console.log("[deployContracts] Already deployed, skipping");
    return;
  }

  console.log("Deploying Contracts...");

  // Clean config
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_CONFIG_DIR, { recursive: true });

  // 1. Init
  await runAptosCmd(
    [
      "init",
      "--network",
      "local",
      "--profile",
      "default",
      "--private-key",
      DEPLOYER_PK,
      "--assume-yes",
    ],
    WEB_DIR,
  );

  // 2. Fund
  console.log("Funding Deployer...");
  await new Promise<void>((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:8081/mint?amount=1000000000&address=${DEPLOYER_ADDR}`,
      { method: "POST" },
      (res) => {
        if (res.statusCode === 200) resolve();
        else reject(new Error("Funding failed"));
      },
    );
    req.on("error", reject);
    req.end();
  });

  // 3. Publish
  console.log("Publishing...");
  await runAptosCmd(
    [
      "move",
      "publish",
      "--package-dir",
      CONTRACTS_DIR,
      "--named-addresses",
      "atomica=default",
      "--profile",
      "default",
      "--assume-yes",
    ],
    WEB_DIR,
  );

  // 4. Init Registry
  console.log("Initializing Registry...");
  await runAptosCmd(
    [
      "move",
      "run",
      "--function-id",
      "default::registry::initialize",
      "--args",
      "hex:0123456789abcdef",
      "--profile",
      "default",
      "--assume-yes",
    ],
    WEB_DIR,
  );

  // 5. Init fake_eth
  console.log("Initializing fake_eth...");
  await runAptosCmd(
    [
      "move",
      "run",
      "--function-id",
      "default::fake_eth::initialize",
      "--profile",
      "default",
      "--assume-yes",
    ],
    WEB_DIR,
  );

  // 6. Init fake_usd
  console.log("Initializing fake_usd...");
  await runAptosCmd(
    [
      "move",
      "run",
      "--function-id",
      "default::fake_usd::initialize",
      "--profile",
      "default",
      "--assume-yes",
    ],
    WEB_DIR,
  );

  console.log("Contracts Deployed!");
  contractsDeployed = true;
}

export async function setupLocalnet() {
  // Guard against double setup (globalSetup + test beforeAll can both call this)
  if (setupComplete && localnetProcess) {
    console.log("[setupLocalnet] Already running, skipping setup");
    return;
  }

  // Ensure clean slate
  await killZombies();

  // Ensure framework bundle is built and up-to-date
  // await ensureFramework();

  const LOCAL_TEST_DIR = pathResolve(WEB_DIR, ".aptos/testnet");
  const TRACE_PATH = pathResolve(LOCAL_TEST_DIR, "trace.log");
  const VALIDATOR_LOG_PATH = pathResolve(LOCAL_TEST_DIR, "validator.log");

  // Clean previous trace
  if (existsSync(TRACE_PATH)) {
    rmSync(TRACE_PATH);
  }

  console.log("Starting Local Testnet...");

  // We assume 'aptos' binary is available or use strict path
  // The previous orchestration used "aptos" in path or found it.
  // For reliability in tests, we can follow orchestrator logic or expected path.
  // Let's assume 'aptos' is in path for now, or use the one we found earlier.

  // Use the locally built aptos binary from zapatos (unified target dir) to ensure latest framework
  const aptosBinPath = APTOS_BIN;

  // Register cleanup handlers before spawning
  registerCleanupHandlers();

  localnetProcess = spawn(
    aptosBinPath,
    [
      "node",
      "run-local-testnet",
      "--force-restart",
      "--assume-yes",
      "--with-faucet",
      "--faucet-port",
      "8081",
      "--test-dir",
      LOCAL_TEST_DIR,
      /*
      "--genesis-framework",
      GENESIS_FRAMEWORK_PATH,
      */
    ],
    {
      cwd: WEB_DIR,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        RUST_LOG: "warn",
        // Position trace.log alongside validator.log in the test directory
        MOVE_VM_TRACE: TRACE_PATH,
      },
    },
  );

  let processExited = false;
  localnetProcess.on("exit", (code) => {
    console.error(`[Localnet] Process exited with code ${code}`);
    if (code !== null && code !== 0) {
      console.error(`[Localnet] Output:\n${localnetOutput}`);
    }
    processExited = true;
  });

  // Mute verbose output - only capture for error diagnosis
  let localnetOutput = "";
  localnetProcess.stdout?.on("data", (data) => {
    localnetOutput += data.toString();
  });
  localnetProcess.stderr?.on("data", (data) => {
    localnetOutput += data.toString();
  });

  console.log("Waiting for Localnet to be ready...");
  const start = Date.now();
  let checkCount = 0;
  let lastStatus = "";

  // Increase timeout to 5 minutes for debug builds
  while (Date.now() - start < 300000) {
    if (processExited) throw new Error("Localnet process exited prematurely");

    checkCount++;
    const status = await checkAllReadiness();

    if (status === true) {
      console.log(
        `Localnet Started (Readiness OK after ${checkCount} checks).`,
      );

      // Decoupled: Tests must call deployContracts() explicitly if needed
      // Note: We no longer tail the validator log to reduce noise
      // Logs are available at: VALIDATOR_LOG_PATH if debugging is needed
      console.log(
        `[Localnet] Validator log available at: ${VALIDATOR_LOG_PATH}`,
      );
      setupComplete = true;
      return;
    }

    // Only log status changes to reduce verbosity
    if (status !== lastStatus) {
      console.log(`[Readiness Check ${checkCount}] ${status}`);
      lastStatus = status;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Localnet failed to start within 120s");
}

function checkPortReadiness(port: number, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      if (res.statusCode === 200) {
        // console.log(`[Readiness] ${name} is OK (200)`);
        resolve(true);
      } else {
        console.log(`[Readiness] ${name} returned ${res.statusCode}`);
        resolve(false);
      }
      res.resume();
    });
    req.on("error", () => {
      // console.log(`[Readiness] ${name} connection failed`); // noisy
      resolve(false);
    });
    req.end();
  });
}

async function checkAllReadiness(): Promise<boolean | string> {
  // Ensure both Node (8070 - readiness endpoint provided by localnet) and Faucet (8081) are up
  // Actually, run-local-testnet output says "Readiness endpoint: http://127.0.0.1:8070/"
  // Faucet is at 8081 /health or /
  // Port 8070 often returns 503 in this environment even when node is working.
  // We rely on 8080 (API) and 8081 (Faucet).
  // const nodeReady = await checkPortReadiness(8070, "Node Readiness");
  const apiReady = await checkPortReadiness(8080, "Node API");
  const faucetReady = await checkPortReadiness(8081, "Faucet");

  if (apiReady && faucetReady) {
    return true;
  } else if (apiReady && !faucetReady) {
    return "API OK, waiting for Faucet...";
  } else if (!apiReady && faucetReady) {
    return "Faucet OK, waiting for API...";
  } else {
    return "Waiting for API and Faucet...";
  }
}

export async function teardownLocalnet() {
  console.log("Stopping Localnet...");
  if (localnetProcess) {
    // Try graceful shutdown first
    localnetProcess.kill("SIGTERM");

    // Wait a bit for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // If still alive, force kill
    if (!localnetProcess.killed) {
      localnetProcess.kill("SIGKILL");
    }

    localnetProcess = null;
  }
  setupComplete = false;
  // Force clean up any potential lingering processes
  await killZombies();
}
