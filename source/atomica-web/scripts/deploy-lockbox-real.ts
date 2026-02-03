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
 * NO MOCKING - Uses real contracts and real proofs
 */

import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { ethers } from "ethers";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { generateLockedBalanceProof } from "../src/lib/ethereum/proofs/generator.js";
import { serializeProofForAptos } from "../src/lib/ethereum/proofs/index.js";

// Contract bytecode - we'll compile on the fly
const FAKE_ETH_ABI = [
  "constructor()",
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
];

const FAKE_USD_ABI = [
  "constructor()",
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

const LOCKBOX_ABI = [
  "constructor(address _fakeETH, address _fakeUSD)",
  "function lock(address token, uint256 amount) external",
  "function getLockedBalance(address user, address token) external view returns (uint256)",
  "function calculateStorageKey(address user, address token) external pure returns (bytes32)",
];

async function deployContract(
  signer: ethers.Wallet,
  contractName: string,
  abi: string[],
  bytecode: string,
  args: any[] = []
): Promise<ethers.Contract> {
  console.log(`   Deploying ${contractName}...`);
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`   ✅ ${contractName} deployed at: ${address}`);
  return contract;
}

async function main() {
  console.log("═".repeat(80));
  console.log("  REAL Ethereum Deployment & Proof Generation");
  console.log("═".repeat(80));

  let testnet: EthereumDockerTestnet | undefined;

  try {
    // Step 1: Start Ethereum Docker testnet
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

    // Step 2: Get pre-funded account with REAL private key
    console.log("\n🔑 Step 2/6: Getting pre-funded test account...");
    const accounts = testnet.getTestAccounts();
    const deployerAccount = accounts[0];
    
    console.log(`   Address: ${deployerAccount.address}`);
    console.log(`   Private Key: ${deployerAccount.privateKey.slice(0, 10)}...`);
    
    const provider = new ethers.JsonRpcProvider(testnet.getExecutionRpcUrl());
    const deployer = new ethers.Wallet(deployerAccount.privateKey, provider);
    
    const balance = await provider.getBalance(deployerAccount.address);
    console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

    // Step 3: Compile and deploy contracts
    console.log("\n🚀 Step 3/6: Compiling and deploying contracts...");
    console.log("   Running forge build...");
    
    // We need to use forge to compile, then extract the bytecode
    const { execSync } = await import("child_process");
    execSync("forge build", { 
      cwd: "../../evm-contracts",
      stdio: "inherit"
    });
    
    // Read compiled bytecode
    const { readFileSync } = await import("fs");
    const fakeEthArtifact = JSON.parse(
      readFileSync("../../evm-contracts/out/FakeETH.sol/FakeETH.json", "utf-8")
    );
    const fakeUsdArtifact = JSON.parse(
      readFileSync("../../evm-contracts/out/FakeUSD.sol/FakeUSD.json", "utf-8")
    );
    const lockBoxArtifact = JSON.parse(
      readFileSync("../../evm-contracts/out/LockBox.sol/LockBox.json", "utf-8")
    );
    
    // Deploy FakeETH
    const fakeETH = await deployContract(
      deployer,
      "FakeETH",
      FAKE_ETH_ABI,
      fakeEthArtifact.bytecode.object
    );
    
    // Deploy FakeUSD
    const fakeUSD = await deployContract(
      deployer,
      "FakeUSD",
      FAKE_USD_ABI,
      fakeUsdArtifact.bytecode.object
    );
    
    // Deploy LockBox
    const lockBox = await deployContract(
      deployer,
      "LockBox",
      LOCKBOX_ABI,
      lockBoxArtifact.bytecode.object,
      [await fakeETH.getAddress(), await fakeUSD.getAddress()]
    );
    
    const lockBoxAddress = await lockBox.getAddress();
    const fakeETHAddress = await fakeETH.getAddress();
    const fakeUSDAddress = await fakeUSD.getAddress();

    // Step 4: Mint and lock tokens
    console.log("\n🪙 Step 4/6: Minting and locking tokens...");
    
    const amount = ethers.parseEther("10"); // 10 FAKETH
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
    await tx.wait();
    console.log("   ✅ Locked");
    
    // Verify locked balance
    const lockedBalance = await lockBox.getLockedBalance(
      deployerAccount.address,
      fakeETHAddress
    );
    console.log(`   Locked balance: ${ethers.formatEther(lockedBalance)} FAKETH`);

    // Step 5: Wait for finality and generate proof
    console.log("\n⏳ Step 5/6: Waiting for finality...");
    await new Promise((resolve) => setTimeout(resolve, 15000));
    
    const currentBlock = await provider.getBlockNumber();
    const proofBlock = currentBlock - 1;
    console.log(`   Current block: ${currentBlock}`);
    console.log(`   Proof block: ${proofBlock}`);
    
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

    // Step 6: Save proof
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
    await writeFile(outputPath, JSON.stringify(output, null, 2));
    
    console.log(`   ✅ Proof saved to ${outputPath}`);

    console.log("\n" + "═".repeat(80));
    console.log("  ✨ SUCCESS! Real Ethereum proof generated");
    console.log("═".repeat(80));
    
    console.log("\nContract Addresses:");
    console.log(`  LockBox: ${lockBoxAddress}`);
    console.log(`  FakeETH:  ${fakeETHAddress}`);
    console.log(`  FakeUSD:  ${fakeUSDAddress}`);
    
    console.log("\nNext steps:");
    console.log("  1. Update eth_proof_tests.move with this proof data");
    console.log("  2. Run: aptos move test --filter test_verify_real_ethereum_proof");
    console.log("  3. Integrate with AuctionRegistry");
    
    console.log("\n⚠️  Testnet is still running. Press Ctrl+C to stop.");
    console.log("   Or run manually: cd source/docker-testnet/ethereum-testnet/config");
    console.log("                    docker compose down -v");

  } catch (error) {
    console.error("\n❌ Error:", error);
    throw error;
  } finally {
    // Don't auto-cleanup - let user inspect the testnet
    console.log("\n💡 Testnet left running for inspection");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
