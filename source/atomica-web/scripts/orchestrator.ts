import { DockerTestnet } from "@atomica/docker-testnet";
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Helper to get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const WORKSPACE_ROOT = join(__dirname, "../../.."); // web -> atomica-web -> source -> atomica
const ZAPATOS_DIR = join(WORKSPACE_ROOT, "source/atomica-aptos");
const CONTRACTS_DIR = join(WORKSPACE_ROOT, "source/atomica-move-contracts");
const WEB_DIR = join(WORKSPACE_ROOT, "source/atomica-web");

// Test Keys (NOT FOR MAINNET)
const DEPLOYER_PK =
  "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";

async function main() {
  console.log("🚀 Starting Atomica Demo Orchestrator (Node.js)...");
  console.log(`📂 Workspace Root: ${WORKSPACE_ROOT}`);

  // 0. Docker Check
  try {
    execSync("docker info", { stdio: "ignore" });
  } catch (_e) {
    console.error("\n========================================================");
    console.error("⛔️  ABORTING: Docker Not Running");
    console.error("========================================================");
    console.error("Docker is required to run the local testnet.");
    console.error("Please start Docker Desktop or the Docker daemon.");
    console.error("========================================================\n");
    process.exit(1);
  }

  // 1. Environment Setup
  // Force Aptos CLI to use a local isolated config directory to avoid global config issues
  const ISOLATED_CONFIG_DIR = join(CONTRACTS_DIR, ".aptos_isolated");
  process.env.APTOS_GLOBAL_CONFIG_DIR = ISOLATED_CONFIG_DIR;
  process.env.APTOS_DISABLE_TELEMETRY = "true";

  console.log(`🔒 Using isolated Aptos Config: ${ISOLATED_CONFIG_DIR}`);

  // 2. Cleanup Zombies (Webapp port only, Docker handles its own ports)
  cleanupPorts([4173]);

  // 3. Start Webapp (Dev Mode)
  console.log("🌐 Starting Webapp (Dev Mode)...");
  await runCommand("npm", ["install"], WEB_DIR);

  console.log("👉 OPEN IN BROWSER: http://localhost:4173");

  const webProcess = spawn(
    "npm",
    ["run", "dev", "--", "--port", "4173", "--host"],
    {
      cwd: WEB_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_CONTRACT_ADDRESS: DEPLOYER_ADDR,
      },
    },
  );

  // Wait for Webapp Health
  console.log("⏳ Waiting for Webapp availability...");
  await waitForUrl("http://localhost:4173");
  console.log("✅ Webapp is Live!");

  // 4. Find Aptos CLI (Keep check for clarity, required by SDK)
  const candidatePaths = [
    join(ZAPATOS_DIR, "target/debug/aptos"),
    join(ZAPATOS_DIR, "target/release/aptos"),
    join(WORKSPACE_ROOT, "source/target/debug/aptos"),
    join(WORKSPACE_ROOT, "source/target/release/aptos"),
    join(WORKSPACE_ROOT, "target/debug/aptos"),
    join(WORKSPACE_ROOT, "target/release/aptos"),
  ];

  let aptosBin: string | null = null;

  // Check PATH
  try {
    const pathBin = execSync("which aptos").toString().trim();
    if (pathBin && existsSync(pathBin)) {
      aptosBin = pathBin;
      console.log(`✅ Found 'aptos' binary in $PATH at: ${aptosBin}`);
    }
  } catch (_e) {
    // Ignore error if not found in PATH
  }

  // If not in PATH, check candidates
  if (!aptosBin) {
    console.log("🔍 Looking for 'aptos' binary in workspace...");
    for (const p of candidatePaths) {
      if (existsSync(p)) {
        aptosBin = p;
        break;
      }
    }
  }

  if (!aptosBin) {
    console.error(
      "❌ 'aptos' binary NOT found in PATH or any of the following locations:",
    );
    candidatePaths.forEach((p) => console.error(`   - ${p}`));
    console.error("\n========================================================");
    console.error("⛔️  ABORTING: Developer Environment Not Configured");
    console.error("========================================================");
    console.error("You are missing the 'aptos' CLI tool.");
    console.error("Please do one of the following:");
    console.error("  1. Install it globally (e.g. brew install aptos)");
    console.error("  2. Build it from source:");
    console.error("     cd source/atomica-aptos && cargo build -p aptos");
    console.error("========================================================\n");
    process.exit(1);
  }

  // 5. Start Docker Testnet
  console.log("chains⛓️ Starting Docker Testnet (expecting 4 validators + faucet)...");

  // Create and wait for testnet readiness
  const testnet = await DockerTestnet.new(4);
  console.log("✅ Docker Testnet is Ready!");

  // Wait for Faucet Service (now provided by Docker on port 8081)
  console.log("⏳ Waiting for Faucet Service (http://127.0.0.1:8081)...");
  await waitForUrl("http://127.0.0.1:8081");
  console.log("✅ Faucet Service is Ready!");

  // 6. Deploy Contracts using SDK
  console.log("📜 Deploying Contracts...");

  await testnet.deployContracts({
    contractsDir: CONTRACTS_DIR,
    deployerPrivateKey: DEPLOYER_PK,
    deployerAddress: DEPLOYER_ADDR,
    namedAddresses: { atomica: DEPLOYER_ADDR },
    initFunctions: [
      {
        functionId: `${DEPLOYER_ADDR}::registry::initialize`,
        args: ["hex:0123456789abcdef"],
      },
      {
        functionId: `${DEPLOYER_ADDR}::fake_eth::initialize`,
        args: [],
      },
      {
        functionId: `${DEPLOYER_ADDR}::fake_usd::initialize`,
        args: [],
      },
    ],
    fundAmount: 10_000_000_000n, // 100 APT
  });

  // Handle Cleanup on Exit
  // Note: DockerTestnet handles its own cleanup on signal, but we also want to stop webapp.
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    webProcess.kill();
    // testnet.teardown() will be called by SDK's own handler
  });
}

async function waitForUrl(url: string) {
  while (true) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(1000);
    }
  }
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(cmd, args, { cwd, stdio: "inherit" });
    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`⚠️ ${cmd} exited with code ${code}`));
      } else {
        resolve();
      }
    });
    process.on("error", (err) => {
      reject(new Error(`❌ Failed to run ${cmd}: ${err.message}`));
    });
  });
}

function cleanupPorts(ports: number[]) {
  for (const port of ports) {
    try {
      const output = execSync(`lsof -t -i tcp:${port}`).toString().trim();
      if (output) {
        const pids = output.split("\n");
        for (const pid of pids) {
          if (pid) {
            console.log(
              `🧹 Killing zombie process on port ${port} (PID: ${pid})`,
            );
            execSync(`kill -9 ${pid}`);
          }
        }
      }
    } catch {
      // lsof returns exit code 1 if no process found, which throws error. Ignore it.
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
