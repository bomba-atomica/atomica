import { spawn, ChildProcess, exec as execCb } from "child_process";
import { resolve as pathResolve, dirname } from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import http from "node:http";
import { rmSync, mkdirSync, existsSync } from "fs";

const exec = promisify(execCb);
let localnetProcess: ChildProcess | null = null;

import { findAptosBinary } from "./findAptosBinary";

// Adjust paths relative to this file's location
const TEST_SETUP_DIR = dirname(fileURLToPath(import.meta.url));
const APTOS_BIN = findAptosBinary();
const WEB_DIR = pathResolve(TEST_SETUP_DIR, "../..");

export async function killZombies() {
  try {
    console.log("Cleaning up zombie Aptos processes...");
    // Kill potential zombie aptos processes to free ports 8080/8081
    await exec("pkill -f 'aptos node run-local-testnet' || true");
    // Also simpler check if standard name is used
    await exec("pkill -f 'aptos' || true");

    // Kill by port to catch all services:
    // - 8070: Readiness endpoint
    // - 8080: REST API
    // - 8081: Faucet
    // - 9101: Inspection/metrics service
    // - 9102: Admin service
    // - 50051: Indexer gRPC (transaction streaming)
    // - 6180, 6181, 7180: Fullnode network ports
    const ports = [8070, 8080, 8081, 9101, 9102, 50051, 6180, 6181, 7180];
    for (const port of ports) {
      try {
        // Find and kill process listening on port
        const { stdout } = await exec(`lsof -ti :${port} || true`);
        const pids = stdout
          .trim()
          .split("\n")
          .filter((pid) => pid);
        for (const pid of pids) {
          console.log(`Killing process ${pid} on port ${port}`);
          await exec(`kill -9 ${pid} || true`);
        }
      } catch {
        // Ignore errors - port might not be in use
      }
    }

    // Clean up stale localnet directory to prevent port binding issues
    const LOCAL_TEST_DIR = pathResolve(WEB_DIR, ".aptos/testnet");
    if (existsSync(LOCAL_TEST_DIR)) {
      console.log(`Removing stale localnet directory: ${LOCAL_TEST_DIR}`);
      rmSync(LOCAL_TEST_DIR, { recursive: true, force: true });
    }

    await new Promise((resolve) => setTimeout(resolve, 2000)); // Give time to release ports and clean up
  } catch {
    // Ignore errors if no process found
  }
}

const CONTRACTS_DIR = pathResolve("../atomica-move-contracts");
const TEST_CONFIG_DIR = pathResolve(".aptos_test_config");

export function fundAccount(
  address: string,
  amount: number = 100_000_000,
): Promise<string> {
  console.log(`[fundAccount] Requesting ${amount} for ${address}...`);
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:8081/mint?amount=${amount}&address=${address}`,
      { method: "POST" },
      (res) => {
        console.log(`[fundAccount] Response status: ${res.statusCode}`);
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`[fundAccount] Response body: ${data}`);
          if (res.statusCode === 200) {
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
    req.on("error", (e) => {
      console.error(`[fundAccount] Request error:`, e);
      reject(e);
    });
    req.end();
  });
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
        RUST_LOG: "debug",
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

export async function deployContracts() {
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
}

export async function setupLocalnet() {
  // Ensure framework bundle is built and up-to-date
  // await ensureFramework();

  // Ensure clean slate
  await killZombies();

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
        RUST_LOG: "debug",
        // Position trace.log alongside validator.log in the test directory
        MOVE_VM_TRACE: TRACE_PATH,
      },
    },
  );

  let processExited = false;
  localnetProcess.on("exit", (code) => {
    console.error(`[Localnet] Process exited with code ${code}`);
    processExited = true;
  });

  localnetProcess.stdout?.on("data", (data) =>
    console.log(`[Localnet] ${data} `),
  );
  localnetProcess.stderr?.on("data", (data) =>
    console.error(`[Localnet ER] ${data} `),
  );

  console.log("Waiting for Localnet to be ready...");
  const start = Date.now();
  // Increase timeout to 5 minutes for debug builds
  while (Date.now() - start < 300000) {
    if (processExited) throw new Error("Localnet process exited prematurely");

    // Parse Log Path
    // We look for: 'Log file: "/path/to/validator.log"' in stdout
    // But stdout is being piped to console directly in the listener above.
    // We need to capture it in a variable too?
    // Let's implement a cleaner way:
    if (await checkAllReadiness()) {
      console.log("Localnet Started (Readiness OK).");

      // Start tailing logs if we can guess the path or found it
      // Default path is typically ~/.aptos/testnet/validator.log for local network
      // Or relative to workspace if we didn't specify?
      // "aptos node run-local-testnet" usually uses ~/.aptos/testnet
      // Let's rely on standard location for now or try to parse

      // const home = process.env.HOME; // Unused
      const logPath = VALIDATOR_LOG_PATH;
      // We set APTOS_GLOBAL_CONFIG_DIR = TEST_CONFIG_DIR in runAptosCmd (deployment),
      // BUT localnetProcess was spawned WITHOUT that env var in setupLocalnet!
      // Wait, setupLocalnet spawning aptosBin does NOT set env vars for config dir?
      // Line 23: localnetProcess = spawn(aptosBin, [...], { cwd, stdio... }) -> no env provided?
      // If no env provided, it uses default ~/.aptos/testnet.
      // Duplicate assignment removed

      // Spawn tail
      console.log(`Tailing validator log: ${logPath}`);
      const tail = spawn("tail", ["-f", logPath], { stdio: "inherit" });
      // Track it to kill later?
      // quick hack: attach to localnetProcess object or valid scope
      (localnetProcess as any)._tail = tail;

      // Decoupled: Tests must call deployContracts() explicitely if needed
      return;
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

async function checkAllReadiness() {
  // Ensure both Node (8070 - readiness endpoint provided by localnet) and Faucet (8081) are up
  // Actually, run-local-testnet output says "Readiness endpoint: http://127.0.0.1:8070/"
  // Faucet is at 8081 /health or /
  // Port 8070 often returns 503 in this environment even when node is working.
  // We rely on 8080 (API) and 8081 (Faucet).
  // const nodeReady = await checkPortReadiness(8070, "Node Readiness");
  const apiReady = await checkPortReadiness(8080, "Node API");
  const faucetReady = await checkPortReadiness(8081, "Faucet");

  if (apiReady && !faucetReady)
    console.log("[Readiness] API OK, waiting for Faucet...");

  return apiReady && faucetReady;
}

export async function teardownLocalnet() {
  console.log("Stopping Localnet...");
  if (localnetProcess) {
    if ((localnetProcess as any)._tail) {
      (localnetProcess as any)._tail.kill();
    }
    localnetProcess.kill();
    localnetProcess = null;
  }
  // Force clean up any potential lingering processes
  await killZombies();
}
