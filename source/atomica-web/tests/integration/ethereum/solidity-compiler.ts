import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { ethers } from "ethers";

const __dirname = dirname(import.meta.url.replace("file://", ""));
const EVM_CONTRACTS_DIR = join(__dirname, "../../../evm-contracts");

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

      // First, send the deployment transaction without waiting for receipt
      const tx = factory.getDeployTransaction(...args);
      const sentTx = await deployer.sendTransaction(tx);
      console.log(`   Transaction sent: ${sentTx.hash}`);

      // Poll for the transaction receipt manually
      console.log(`   Waiting for confirmation...`);
      let receipt = null;
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          receipt = await deployer.provider.getTransactionReceipt(sentTx.hash);
          if (receipt) {
            console.log(`   Confirmed in block ${receipt.blockNumber}`);
            break;
          }
        } catch (e: any) {
          // Ignore indexing errors during polling
          if (!e.message?.includes("transaction indexing is in progress")) {
            throw e;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!receipt) {
        throw new Error("Transaction receipt not found after polling");
      }

      const deployedAddress = receipt.contractAddress;
      console.log(`   Contract deployed at: ${deployedAddress}`);

      // Create contract instance with the known address
      const contract = factory.attach(deployedAddress);
      return contract;
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
