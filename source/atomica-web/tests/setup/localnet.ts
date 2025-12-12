import { spawn, ChildProcess, exec as execCb } from "child_process";
import { resolve, join } from "path";
import { promisify } from "util";
import http from "node:http";
import { rmSync, mkdirSync, existsSync } from "fs";

const exec = promisify(execCb);
let localnetProcess: ChildProcess | null = null;

// Adjust paths relative to atomica-web root or where vitest runs
const APTOS_CLI_PATH = resolve("../../target/debug/aptos");
const WEB_DIR = resolve(".");

export async function killZombies() {
  try {
    console.log("Cleaning up zombie Aptos processes...");
    // Kill potential zombie aptos processes to free ports 8080/8081
    await exec("pkill -f 'aptos node run-local-testnet' || true");
    // Also simpler check if standard name is used
    await exec("pkill -f 'aptos' || true");
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Give time to release ports
  } catch (_e) {
    // Ignore errors if no process found
    // console.log("Kill failed", e);
  }
}

const CONTRACTS_DIR = resolve("../../atomica-move-contracts");
const TEST_CONFIG_DIR = resolve(".aptos_test_config");

const DEPLOYER_PK =
  "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const APTOS_BIN = "/Users/lucas/code/rust/atomica/source/target/debug/aptos";

async function runAptosCmd(args: string[], cwd: string = WEB_DIR) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(APTOS_BIN, args, {
      cwd,
      // Isolate config
      env: {
        ...process.env,
        APTOS_GLOBAL_CONFIG_DIR: TEST_CONFIG_DIR,
        APTOS_DISABLE_TELEMETRY: "true",
      },
      stdio: "pipe", // Capture output
    });
    proc.stdout.on("data", (d) => console.log(`[Aptos Out] ${d}`));
    proc.stderr.on("data", (d) => console.error(`[Aptos Err] ${d}`));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`Aptos cmd failed with code ${code}: ${args.join(" ")}`),
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

  console.log("Contracts Deployed!");
}

export async function setupLocalnet() {
  // Ensure clean slate
  await killZombies();

  console.log("Starting Local Testnet...");

  // We assume 'aptos' binary is available or use strict path
  // The previous orchestration used "aptos" in path or found it.
  // For reliability in tests, we can follow orchestrator logic or expected path.
  // Let's assume 'aptos' is in path for now, or use the one we found earlier.

  const aptosBin = "/Users/lucas/code/rust/atomica/source/target/debug/aptos";

  localnetProcess = spawn(
    aptosBin,
    [
      "node",
      "run-local-testnet",
      "--force-restart",
      "--assume-yes",
      "--with-faucet",
      "--faucet-port",
      "8081",
    ],
    {
      cwd: WEB_DIR,
      stdio: ["pipe", "pipe", "pipe"],
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
  while (Date.now() - start < 120000) {
    if (processExited) throw new Error("Localnet process exited prematurely");

    // Parse Log Path
    // We look for: 'Log file: "/path/to/validator.log"' in stdout
    // But stdout is being piped to console directly in the listener above.
    // We need to capture it in a variable too?
    // Let's implement a cleaner way:
    if (await checkReadiness()) {
      console.log("Localnet Started (Readiness OK).");

      // Start tailing logs if we can guess the path or found it
      // Default path is typically ~/.aptos/testnet/validator.log for local network
      // Or relative to workspace if we didn't specify?
      // "aptos node run-local-testnet" usually uses ~/.aptos/testnet
      // Let's rely on standard location for now or try to parse

      // const home = process.env.HOME; // Unused
      const logPath = `${process.env.HOME}/.aptos/testnet/validator.log`;
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

      await deployContracts();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Localnet failed to start within 120s");
}

function checkReadiness(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8070/", (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        // console.log(`[Readiness probe] Status: ${res.statusCode}`); // Optional debug
        resolve(false);
      }
      res.resume();
    });
    req.on("error", (e) => {
      // console.log(`[Readiness probe] Error: ${e.message}`); // Optional debug
      resolve(false);
    });
    req.end();
  });
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
