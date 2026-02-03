#!/usr/bin/env bun
/**
 * REAL Deployment and Proof Generation Script
 * 
 * This script:
 * 1. Starts Ethereum Docker testnet
 * 2. Deploys LockBox, FakeETH, FakeUSD contracts using ethers.js
 * 3. Mints and locks tokens
 * 4. Generates a REAL state proof
 * 5. Saves proof for Move tests
 * 
 * NO MOCKING - Uses real production Solidity contracts
 */

import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { ethers } from "ethers";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { generateLockedBalanceProof } from "../src/lib/ethereum/proofs/generator";
import { serializeProofForAptos } from "../src/lib/ethereum/proofs/index";

interface TokenContract {
  mint(to: string, amount: bigint): Promise<unknown>;
  approve(spender: string, amount: bigint): Promise<unknown>;
  balanceOf(account: string): Promise<bigint>;
  getAddress(): Promise<string>;
}

interface LockBoxContract {
  lock(token: string, amount: bigint): Promise<unknown>;
  getLockedBalance(user: string, token: string): Promise<bigint>;
  getAddress(): Promise<string>;
}

async function deployContract<T>(
  signer: ethers.Wallet,
  contractName: string,
  abi: ethers.InterfaceAbi,
  bytecode: string,
  args: unknown[] = []
): Promise<T> {
  console.log(`   Deploying ${contractName}...`);
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`   ✅ ${contractName} deployed at: ${address}`);
  return contract as unknown as T;
}

async function main() {
  console.log("═".repeat(80));
  console.log("  REAL Ethereum Deployment & Proof Generation");
  console.log("═".repeat(80));

  let testnet: EthereumDockerTestnet | undefined;

  try {
    console.log("\n📦 Step 1/6: Starting Ethereum Docker testnet...");
    console.log("   (This may take 2-3 minutes for first-time setup)");
      
    testnet = await EthereumDockerTestnet.start(8);
    console.log("   ✅ Testnet started");
      
    console.log("\n⏳ Waiting for network to be healthy...");
    await testnet.waitForHealthy(300);
    console.log("   ✅ Network is healthy");
      
    console.log("\n⏳ Waiting for block production...");
    await testnet.waitForBlocks(2, 120);
    console.log("   ✅ Blocks being produced");

    console.log("\n🔑 Step 2/6: Getting pre-funded test account...");
    const accounts = testnet.getTestAccounts();
    const deployerAccount = accounts[0];
      
    console.log(`   Address: ${deployerAccount.address}`);
    console.log(`   Private Key: ${deployerAccount.privateKey.slice(0, 10)}...`);
      
    const provider = new ethers.JsonRpcProvider(testnet.getExecutionRpcUrl());
    const deployer = new ethers.Wallet(deployerAccount.privateKey, provider);
      
    const balance = await provider.getBalance(deployerAccount.address);
    console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

    console.log("\n🚀 Step 3/6: Compiling contracts...");
    console.log("   Compiling production Solidity contracts...");
    try {
      execSync("cd ../evm-contracts && forge build", { stdio: "inherit" });
    } catch {
      throw new Error("Forge build failed");
    }
      
    const fakeEthArtifact = JSON.parse(
      readFileSync("../evm-contracts/out/FakeETH.sol/FakeETH.json", "utf-8")
    );
    const fakeUsdArtifact = JSON.parse(
      readFileSync("../evm-contracts/out/FakeUSD.sol/FakeUSD.json", "utf-8")
    );
    const lockBoxArtifact = JSON.parse(
      readFileSync("../evm-contracts/out/LockBox.sol/LockBox.json", "utf-8")
    );
      
    const fakeETH = await deployContract<TokenContract>(
      deployer, "FakeETH", fakeEthArtifact.abi, fakeEthArtifact.bytecode.object
    );
      
    const fakeUSD = await deployContract<TokenContract>(
      deployer, "FakeUSD", fakeUsdArtifact.abi, fakeUsdArtifact.bytecode.object
    );
      
    const fakeETHAddress = await fakeETH.getAddress();
    const fakeUSDAddress = await fakeUSD.getAddress();
      
    const lockBox = await deployContract<LockBoxContract>(
      deployer, "LockBox", lockBoxArtifact.abi, lockBoxArtifact.bytecode.object,
      [fakeETHAddress, fakeUSDAddress]
    );
      
    const lockBoxAddress = await lockBox.getAddress();

    console.log("\n🪙 Step 4/6: Minting and locking tokens...");
      
    const amount = ethers.parseEther("10");
    console.log(`   Minting ${ethers.formatEther(amount)} FAKETH...`);
      
    let tx = await fakeETH.mint(deployerAccount.address, amount);
    await tx.wait();
    console.log("   ✅ Minted");
      
    console.log("   Approving LockBox...");
    tx = await fakeETH.approve(lockBoxAddress, amount);
    await tx.wait();
    console.log("   ✅ Approved");
      
    console.log("   Locking tokens...");
    tx = await lockBox.lock(fakeETHAddress, amount);
    const lockReceipt = await tx.wait();
    console.log("   ✅ Locked");
      
    if (!lockReceipt || !lockReceipt.blockNumber) {
      throw new Error("Lock transaction failed");
    }
    const lockBlock = lockReceipt.blockNumber;
    console.log(`   Lock transaction in block: ${lockBlock}`);
      
    const lockedBalance = await lockBox.getLockedBalance(deployerAccount.address, fakeETHAddress);
    console.log(`   Locked balance: ${ethers.formatEther(lockedBalance)} FAKETH`);

    console.log("\n⏳ Step 5/6: Waiting for finality...");
    console.log(`   Waiting for blocks after lock transaction (block ${lockBlock})...`);
      
    let currentBlock = await provider.getBlockNumber();
    const targetBlock = lockBlock + 2;
      
    while (currentBlock < targetBlock) {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      currentBlock = await provider.getBlockNumber();
      console.log(`   Current block: ${currentBlock}, target: ${targetBlock}`);
    }
      
    const proofBlock = lockBlock + 1;
    console.log(`   Using proof block: ${proofBlock}`);
      
    console.log("\n⚙️  Generating REAL state proof...");
    const proof = await generateLockedBalanceProof(
      provider,
      lockBoxAddress,
      deployerAccount.address,
      fakeETHAddress,
      proofBlock
    );
      
    console.log("   ✅ Proof generated!");
    console.log(`   Block: ${proof.blockNumber}`);
    console.log(`   Storage value: ${proof.storageValue.toString()}`);
    console.log(`   Account proof nodes: ${proof.accountProof.length}`);
    console.log(`   Storage proof nodes: ${proof.storageProof.length}`);

    console.log("\n💾 Step 6/6: Saving proof to fixtures...");
      
    const outputDir = "tests/fixtures";
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }
      
    const output = {
      proof,
      serializedForAptos: serializeProofForAptos(proof),
      contractAddresses: {
        lockBox: lockBoxAddress,
        fakeETH: fakeETHAddress,
        fakeUSD: fakeUSDAddress,
      },
      metadata: {
        generated_at: new Date().toISOString(),
        testnet: "ethereum-docker",
        mnemonic: testnet.getMnemonic(),
        account: deployerAccount.address,
        block: proofBlock,
      },
    };
      
    const outputPath = `${outputDir}/real-ethereum-proof.json`;
    await writeFile(outputPath, JSON.stringify(output, (_key: string, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value
    , 2));
      
    console.log(`   ✅ Proof saved to ${outputPath}`);

    console.log("\n" + "═".repeat(80));
    console.log("  ✨ SUCCESS! Real Ethereum proof generated");
    console.log("═".repeat(80));
      
    console.log("\nContract Addresses:");
    console.log(`  LockBox: ${lockBoxAddress}`);
    console.log(`  FakeETH:  ${fakeETHAddress}`);
    console.log(`  FakeUSD:  ${fakeUSDAddress}`);
      
    console.log("\n⚠️  Testnet is still running. Press Ctrl+C to stop.");

  } catch (error) {
    console.error("\n❌ Error:", error);
    throw error;
  } finally {
    console.log("\n💡 Testnet left running for inspection");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
