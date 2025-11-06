import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Deploying Diem Light Client (Native Prover)...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // 1. Deploy DiemLightClient
  console.log("📦 Deploying DiemLightClient...");
  const DiemLightClientFactory = await ethers.getContractFactory("DiemLightClient");
  const lightClient = await DiemLightClientFactory.deploy();
  await lightClient.waitForDeployment();
  const lightClientAddress = await lightClient.getAddress();
  console.log("✅ DiemLightClient deployed to:", lightClientAddress);

  // 2. Initialize with genesis waypoint
  console.log("\n🔧 Initializing light client...");

  // Get initial waypoint from environment or use default
  const initialWaypoint = getInitialWaypoint();

  const tx = await lightClient.initialize(
    initialWaypoint.version,
    initialWaypoint.stateRoot,
    initialWaypoint.accumulator,
    initialWaypoint.timestamp,
    initialWaypoint.epoch,
    initialWaypoint.validators
  );

  console.log("⏳ Waiting for initialization transaction...");
  const receipt = await tx.wait();
  console.log("✅ Initialized at block:", receipt?.blockNumber);
  console.log("   Gas used:", receipt?.gasUsed.toLocaleString());

  // 3. Deploy token bridge (example application)
  console.log("\n📦 Deploying DiemTokenBridge...");
  const DiemTokenBridgeFactory = await ethers.getContractFactory("DiemTokenBridge");
  const bridge = await DiemTokenBridgeFactory.deploy(lightClientAddress);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("✅ DiemTokenBridge deployed to:", bridgeAddress);

  // 4. Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      DiemLightClient: lightClientAddress,
      DiemTokenBridge: bridgeAddress,
    },
    initialization: {
      version: initialWaypoint.version.toString(),
      epoch: initialWaypoint.epoch.toString(),
      gasUsed: receipt?.gasUsed.toString(),
    },
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `deployment-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n📄 Deployment info saved to:", `deployments/${filename}`);

  console.log("\n✨ Deployment complete!\n");
  console.log("📋 Summary:");
  console.log("════════════════════════════════════════");
  console.log("DiemLightClient:", lightClientAddress);
  console.log("DiemTokenBridge:", bridgeAddress);
  console.log("════════════════════════════════════════\n");

  // Print verification commands
  console.log("🔍 To verify contracts on Etherscan:");
  console.log(`npx hardhat verify --network ${(await ethers.provider.getNetwork()).name} ${lightClientAddress}`);
  console.log(`npx hardhat verify --network ${(await ethers.provider.getNetwork()).name} ${bridgeAddress} ${lightClientAddress}`);
  console.log();
}

function getInitialWaypoint() {
  // In production, fetch this from Diem/Aptos full node
  // For now, use mock data or environment variables

  const waypointStr = process.env.INITIAL_WAYPOINT;
  if (waypointStr) {
    const [version, hash] = waypointStr.split(":");
    return {
      version: BigInt(version),
      stateRoot: hash as `0x${string}`,
      accumulator: ethers.randomBytes(32) as `0x${string}`,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      epoch: 1n,
      validators: generateMockValidators(10),
    };
  }

  // Default mock waypoint for testing
  console.log("⚠️  Using mock waypoint (set INITIAL_WAYPOINT for production)");
  return {
    version: 1000000n,
    stateRoot: ethers.randomBytes(32) as `0x${string}`,
    accumulator: ethers.randomBytes(32) as `0x${string}`,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    epoch: 1n,
    validators: generateMockValidators(10),
  };
}

function generateMockValidators(count: number) {
  return Array(count)
    .fill(null)
    .map(() => ({
      publicKey: ethers.randomBytes(96), // BLS12-381 public key
      votingPower: 100n,
      aptosAddress: ethers.randomBytes(32),
    }));
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
