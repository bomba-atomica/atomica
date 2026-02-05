/**
 * Test eth_getProof using viem (like state-proofs does) vs ethers
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { createPublicClient, http, type Hex } from "viem";
import { mainnet } from "viem/chains";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { calculateLockedBalanceStorageKey } from "../../../src/lib/ethereum/proofs/index.js";
import {
  compileContracts,
  getFakeETHArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "./solidity-compiler.js";

describe("Viem vs Ethers eth_getProof", () => {
  let testnet: EthereumDockerTestnet;
  let provider: ethers.Provider;
  let deployer: ethers.Wallet;

  let fakeETHAddress: string;
  let lockBoxAddress: string;

  let fakeETH: ethers.Contract;
  let lockBox: ethers.Contract;

  beforeAll(async () => {
    console.log("\n=== SETUP ===");
    testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy(180);

    provider = new ethers.JsonRpcProvider(testnet.getExecutionRpcUrl());

    const testAccounts = testnet.getTestAccounts();
    deployer = new ethers.Wallet(testAccounts[0].privateKey, provider);

    await compileContracts();

    const fakeETHArtifact = getFakeETHArtifact();
    const FakeETHFactory = new ethers.ContractFactory(
      fakeETHArtifact.abi,
      fakeETHArtifact.bytecode.object,
      deployer,
    );

    fakeETH = await deployWithRetry(FakeETHFactory, deployer);
    await fakeETH.waitForDeployment();
    fakeETHAddress = await fakeETH.getAddress();

    const lockBoxArtifact = getLockBoxArtifact();
    const LockBoxFactory = new ethers.ContractFactory(
      lockBoxArtifact.abi,
      lockBoxArtifact.bytecode.object,
      deployer,
    );

    lockBox = await deployWithRetry(LockBoxFactory, deployer, [
      fakeETHAddress,
      fakeETHAddress,
    ]);
    await lockBox.waitForDeployment();
    lockBoxAddress = await lockBox.getAddress();

    console.log(`FakeETH: ${fakeETHAddress}`);
    console.log(`LockBox: ${lockBoxAddress}`);
  }, 300000);

  afterAll(async () => {
    if (testnet) {
      await testnet.teardown();
    }
  });

  it("should compare viem vs ethers eth_getProof", async () => {
    console.log("\n=== COMPARING VIEM VS ETHERS ===\n");

    const lockAmount = ethers.parseEther("50");

    // Lock tokens
    const mintTx = await fakeETH.mint(deployer.address, lockAmount);
    await mintTx.wait(1);

    const approveTx = await fakeETH.approve(lockBoxAddress, lockAmount);
    await approveTx.wait(1);

    const lockTx = await lockBox.lock(fakeETHAddress, lockAmount);
    const lockReceipt = await lockTx.wait(1);
    const lockBlock = lockReceipt.blockNumber;

    console.log(`Locked in block ${lockBlock}`);

    // Verify with direct contract read
    const directValue = await lockBox.getLockedBalance(
      deployer.address,
      fakeETHAddress,
    );
    console.log(
      `\n✓ Direct contract read: ${directValue} (${ethers.formatEther(directValue)} ETH)`,
    );

    // Calculate storage key
    const storageKey = calculateLockedBalanceStorageKey(
      deployer.address,
      fakeETHAddress,
    );
    console.log(`Storage key: ${storageKey}`);

    // Test 1: Using ethers at lock block
    console.log(`\n📦 ETHERS eth_getProof at block ${lockBlock}:`);
    const ethersProof = await provider.send("eth_getProof", [
      lockBoxAddress,
      [storageKey],
      `0x${lockBlock.toString(16)}`,
    ]);
    const ethersValue = BigInt(ethersProof.storageProof?.[0]?.value || "0x0");
    console.log(`   Storage value: ${ethersValue}`);
    console.log(`   Match: ${ethersValue === lockAmount}`);

    // Test 2: Using ethers at "latest"
    console.log(`\n📦 ETHERS eth_getProof at "latest":`);
    const ethersProofLatest = await provider.send("eth_getProof", [
      lockBoxAddress,
      [storageKey],
      "latest",
    ]);
    const ethersValueLatest = BigInt(
      ethersProofLatest.storageProof?.[0]?.value || "0x0",
    );
    console.log(`   Storage value: ${ethersValueLatest}`);
    console.log(`   Match: ${ethersValueLatest === lockAmount}`);

    // Test 3: Using viem at lock block
    console.log(`\n🔷 VIEM client.getProof at block ${lockBlock}:`);
    const viemClient = createPublicClient({
      chain: mainnet,
      transport: http(testnet.getExecutionRpcUrl()),
    });

    const viemProof = await viemClient.getProof({
      address: lockBoxAddress as Hex,
      storageKeys: [storageKey as Hex],
      blockNumber: BigInt(lockBlock),
    });

    const viemValue = viemProof.storageProof[0].value;
    console.log(`   Storage value: ${viemValue}`);
    console.log(`   Match: ${viemValue === lockAmount}`);

    // Test 4: Using viem at "latest"
    console.log(`\n🔷 VIEM client.getProof at "latest":`);
    const viemProofLatest = await viemClient.getProof({
      address: lockBoxAddress as Hex,
      storageKeys: [storageKey as Hex],
      blockTag: "latest",
    });

    const viemValueLatest = viemProofLatest.storageProof[0].value;
    console.log(`   Storage value: ${viemValueLatest}`);
    console.log(`   Match: ${viemValueLatest === lockAmount}`);

    // Summary
    console.log(`\n=== SUMMARY ===`);
    console.log(`Direct contract read works: ${directValue === lockAmount}`);
    console.log(`Ethers at lock block works: ${ethersValue === lockAmount}`);
    console.log(
      `Ethers at "latest" works: ${ethersValueLatest === lockAmount}`,
    );
    console.log(`Viem at lock block works: ${viemValue === lockAmount}`);
    console.log(`Viem at "latest" works: ${viemValueLatest === lockAmount}`);

    if (viemValueLatest === lockAmount || ethersValueLatest === lockAmount) {
      console.log(`\n✅ FOUND IT! Querying at "latest" works!`);
    } else {
      console.log(
        `\n❌ All queries fail - fundamental issue with eth_getProof for this storage layout`,
      );
    }

    expect(directValue).toBe(lockAmount);
  }, 120000);
});
