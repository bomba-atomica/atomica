import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { ethers } from "ethers";

const __dirname = dirname(import.meta.url.replace("file://", ""));
const EVM_CONTRACTS_DIR = join(__dirname, "../../../../evm-contracts");

interface Artifact {
  abi: object[];
  bytecode: { object: string };
}

function getArtifact(contractName: string): Artifact {
  const artifactPath = join(
    EVM_CONTRACTS_DIR,
    "out",
    `${contractName}.sol`,
    `${contractName}.json`,
  );

  if (!existsSync(artifactPath)) {
    console.log(`Compiling contracts...`);
    execSync("forge build", { cwd: EVM_CONTRACTS_DIR, stdio: "inherit" });
  }

  return JSON.parse(readFileSync(artifactPath, "utf-8"));
}

export function getFakeETHArtifact(): Artifact {
  return getArtifact("FakeETH");
}

export function getFakeUSDArtifact(): Artifact {
  return getArtifact("FakeUSD");
}

export function getLockBoxArtifact(): Artifact {
  return getArtifact("LockBox");
}

export function getMinimalTestArtifact(): Artifact {
  return getArtifact("MinimalTest");
}

export async function compileContracts(): Promise<void> {
  console.log("Ensuring contracts are compiled...");
  if (!existsSync(join(EVM_CONTRACTS_DIR, "out"))) {
    execSync("forge build", { cwd: EVM_CONTRACTS_DIR, stdio: "inherit" });
  }
}

export async function deployWithRetry(
  factory: ethers.ContractFactory,
  deployer: ethers.Wallet,
  args: unknown[] = [],
  maxRetries: number = 5,
): Promise<ethers.Contract> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Deployment attempt ${attempt}/${maxRetries}...`);

      // Deploy using factory.deploy() which handles everything correctly
      console.log(`   Debug: Deploying with factory.deploy()...`);
      const contract = await factory.deploy(...args);
      console.log(
        `   Transaction sent: ${contract.deploymentTransaction()?.hash}`,
      );

      // Wait for deployment to complete
      console.log(`   Waiting for confirmation...`);
      const deployedContract = await contract.waitForDeployment();
      const deployedAddress = await deployedContract.getAddress();

      console.log(`   Contract deployed at: ${deployedAddress}`);

      // Get the deployment transaction receipt for debugging
      const deployTx = contract.deploymentTransaction();
      if (deployTx) {
        const receipt = await deployTx.wait();
        if (receipt) {
          console.log(`   Confirmed in block ${receipt.blockNumber}`);
          console.log(`   Receipt details:`);
          console.log(`     - Status: ${receipt.status}`);
          console.log(`     - Gas used: ${receipt.gasUsed.toString()}`);

          if (receipt.status === 0) {
            throw new Error(
              `Deployment transaction reverted (tx: ${deployTx.hash})`,
            );
          }

          // Debug: Check if bytecode exists
          const code = await deployer.provider.getCode(deployedAddress);
          console.log(`   Bytecode check:`);
          console.log(`     - Length: ${code.length} characters`);
          if (code === "0x" || code === "0x0") {
            console.log(`     ⚠️  WARNING: No bytecode at address!`);
          } else {
            console.log(`     ✓ Bytecode exists!`);
          }
        }
      }

      return deployedContract;
    } catch (error: any) {
      lastError = error;
      console.log(`   Attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        console.log(`   Waiting 5 seconds before retry...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  throw lastError;
}
