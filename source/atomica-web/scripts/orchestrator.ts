import { spawn, execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Helper to get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const WORKSPACE_ROOT = join(__dirname, "../../.."); // web -> atomica-web -> source -> atomica
const ZAPATOS_DIR = join(WORKSPACE_ROOT, "source/zapatos");
const CONTRACTS_DIR = join(WORKSPACE_ROOT, "source/atomica-move-contracts");
const WEB_DIR = join(WORKSPACE_ROOT, "source/atomica-web");

const DEPLOYER_PK =
  "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";

async function main() {
  console.log("🚀 Starting Atomica Demo Orchestrator (Node.js)...");
  console.log(`📂 Workspace Root: ${WORKSPACE_ROOT}`);

  // 0. Environment Setup
  // Force Aptos CLI to use a local isolated config directory to avoid global config issues
  const ISOLATED_CONFIG_DIR = join(CONTRACTS_DIR, ".aptos_isolated");
  if (!existsSync(ISOLATED_CONFIG_DIR)) {
    // node:fs needed mkdirSync? Imported?
    // Let's rely on aptos init creating it? No, aptos init creates config.yaml inside.
    // We need to ensure the dir exists?
    // Actually invoke mkdirSync if imported.
    // I need to import mkdirSync.
  }
  process.env.APTOS_GLOBAL_CONFIG_DIR = ISOLATED_CONFIG_DIR;
  process.env.APTOS_DISABLE_TELEMETRY = "true";

  console.log(`🔒 Using isolated Aptos Config: ${ISOLATED_CONFIG_DIR}`);

  // 0. Cleanup Zombies
  cleanupPorts([8080, 8081, 4173]);

  // 1. Start Webapp (Dev Mode)
  console.log("🌐 Starting Webapp (Dev Mode)...");
  await runCommand("npm", ["install"], WEB_DIR);
  // runCommand("npm", ["run", "build"], WEB_DIR); // SKIP BUILD

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

  // 2. Find Aptos CLI
  console.log("🔍 Looking for 'aptos' binary...");
  const candidatePaths = [
    join(ZAPATOS_DIR, "target/debug/aptos"),
    join(ZAPATOS_DIR, "target/release/aptos"),
    join(WORKSPACE_ROOT, "source/target/debug/aptos"),
    join(WORKSPACE_ROOT, "source/target/release/aptos"),
    join(WORKSPACE_ROOT, "target/debug/aptos"),
    join(WORKSPACE_ROOT, "target/release/aptos"),
  ];

  let aptosBin = null;
  for (const p of candidatePaths) {
    if (existsSync(p)) {
      aptosBin = p;
      break;
    }
  }

  if (!aptosBin) {
    console.error(
      "❌ 'aptos' binary NOT found in any of the following locations:",
    );
    candidatePaths.forEach((p) => console.error(`   - ${p}`));
    console.error(
      "💡 Please build the CLI first (e.g. 'cargo build -p aptos')",
    );
    process.exit(1);
  }
  console.log(`✅ Found 'aptos' binary at: ${aptosBin}`);

  // 3. Start Local Testnet
  console.log("⛓️ Starting Local Testnet...");
  const nodeProcess = spawn(
    aptosBin,
    [
      "node",
      "run-local-testnet",
      "--with-faucet",
      "--force-restart",
      "--assume-yes",
    ],
    {
      stdio: ["ignore", "pipe", "inherit"], // Pipe stdout to detect readiness or just ignore?
      // Let's inherit stderr to see errors, pipe stdout to avoid spam but maybe we want to see it?
      // Inheriting everything is easiest for debug.
      stdio: "inherit",
    },
  );

  // Wait for network ready (simplistic sleep)
  // Wait for network ready
  console.log(
    "⏳ Waiting for network to be ready (Poll http://127.0.0.1:8080/v1)...",
  );
  await waitForUrl("http://127.0.0.1:8080/v1");
  // Wait for Faucet
  console.log(
    "⏳ Waiting for Faucet to be ready (Poll http://127.0.0.1:8081)...",
  );
  await waitForUrl("http://127.0.0.1:8081");
  console.log("✅ Network & Faucet are Ready!");

  // 3. Setup Contracts
  console.log("📜 Setting up Contracts...");

  // Clean .aptos dir
  const aptosConfigDir = join(CONTRACTS_DIR, ".aptos");
  if (existsSync(aptosConfigDir)) {
    console.log("🧹 Cleaning old .aptos config...");
    rmSync(aptosConfigDir, { recursive: true, force: true });
  }

  // Init
  await runCommand(
    aptosBin,
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
    CONTRACTS_DIR,
  );

  // Fund
  console.log(`💸 Funding Deployer: ${DEPLOYER_ADDR}`);
  try {
    await fetch(
      `http://127.0.0.1:8081/mint?amount=1000000000&address=${DEPLOYER_ADDR}`,
      { method: "POST" },
    );
    console.log("✅ Funded.");
  } catch (e) {
    console.error("⚠️ Failed to fund (is faucet running?)", e);
  }

  // Publish
  console.log("🚀 Publishing Contracts...");
  await runCommand(
    aptosBin,
    [
      "move",
      "publish",
      "--named-addresses",
      "atomica=default",
      "--profile",
      "default",
      "--assume-yes",
    ],
    CONTRACTS_DIR,
  );

  // Init Registry
  console.log("⚙️  Initializing Registry...");
  await runCommand(
    aptosBin,
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
    CONTRACTS_DIR,
  );

  // Init FAKEETH
  console.log("💰 Initializing FAKEETH...");
  await runCommand(
    aptosBin,
    [
      "move",
      "run",
      "--function-id",
      "default::fake_eth::initialize",
      "--profile",
      "default",
      "--assume-yes",
    ],
    CONTRACTS_DIR,
  );

  // Init FAKEUSD
  console.log("💵 Initializing FAKEUSD...");
  await runCommand(
    aptosBin,
    [
      "move",
      "run",
      "--function-id",
      "default::fake_usd::initialize",
      "--profile",
      "default",
      "--assume-yes",
    ],
    CONTRACTS_DIR,
  );

  // 5. Host Webapp (Moved to start)

  // Handle Cleanup on Exit
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    nodeProcess.kill();
    webProcess.kill();
    process.exit();
  });
}

async function waitForUrl(url) {
  while (true) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(1000);
    }
  }
}

function runCommand(cmd, args, cwd): Promise<void> {
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

function cleanupPorts(ports) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
