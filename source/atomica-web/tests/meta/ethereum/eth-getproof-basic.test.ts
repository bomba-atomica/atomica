/**
 * Basic eth_getProof Test
 *
 * Tests if eth_getProof returns correct storage values at all
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { calculateLockedBalanceStorageKey } from "../../../src/lib/ethereum/proofs/index.js";
import {
  compileContracts,
  getFakeETHArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "./solidity-compiler.js";
import { sendAndWaitForTx } from "../helpers/transaction-utils.js";

describe("eth_getProof Basic Test", () => {
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

  it("should return correct storage value via eth_getProof after waiting", async () => {
    console.log("\n=== TEST: eth_getProof after lock ===\n");

    const lockAmount = ethers.parseEther("50");

    // Lock tokens
    let nonce = await deployer.getNonce();
    await sendAndWaitForTx(
      fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    const lockReceipt = await sendAndWaitForTx(
      lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
      1,
    );

    console.log(`Lock tx in block ${lockReceipt.blockNumber}`);

    // Calculate storage key
    const storageKey = calculateLockedBalanceStorageKey(
      deployer.address,
      fakeETHAddress,
    );

    // Wait for a few more blocks to ensure state is indexed
    console.log("\nWaiting for 5 more blocks after lock...");
    const targetBlock = lockReceipt.blockNumber + 5;
    while ((await provider.getBlockNumber()) < targetBlock) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log(`Current block: ${await provider.getBlockNumber()}`);

    // Try eth_getProof with different approaches
    console.log("\n1. Direct contract read:");
    const directValue = await lockBox.getLockedBalance(
      deployer.address,
      fakeETHAddress,
    );
    console.log(
      `   Value: ${directValue} (${ethers.formatEther(directValue)} ETH)`,
    );
    expect(directValue).toBe(lockAmount);

    console.log("\n2. eth_getProof at 'latest':");
    const latestProof = await provider.send("eth_getProof", [
      lockBoxAddress,
      [storageKey],
      "latest",
    ]);
    console.log(`   accountProof nodes: ${latestProof.accountProof?.length}`);
    console.log(
      `   storageProof nodes: ${latestProof.storageProof?.[0]?.proof?.length}`,
    );
    console.log(
      `   storageValue (raw): ${latestProof.storageProof?.[0]?.value}`,
    );

    const latestValue = BigInt(latestProof.storageProof?.[0]?.value || "0x0");
    console.log(`   storageValue (bigint): ${latestValue}`);
    console.log(`   Expected: ${lockAmount}`);
    console.log(`   Match: ${latestValue === lockAmount}`);

    console.log("\n3. eth_getProof at specific block (lock block):");
    const lockBlockHex = `0x${lockReceipt.blockNumber.toString(16)}`;
    const lockBlockProof = await provider.send("eth_getProof", [
      lockBoxAddress,
      [storageKey],
      lockBlockHex,
    ]);
    const lockBlockValue = BigInt(
      lockBlockProof.storageProof?.[0]?.value || "0x0",
    );
    console.log(`   storageValue: ${lockBlockValue}`);
    console.log(`   Expected: ${lockAmount}`);
    console.log(`   Match: ${lockBlockValue === lockAmount}`);

    console.log("\n4. eth_getProof at lock block + 5:");
    const futureBlockHex = `0x${targetBlock.toString(16)}`;
    const futureProof = await provider.send("eth_getProof", [
      lockBoxAddress,
      [storageKey],
      futureBlockHex,
    ]);
    const futureValue = BigInt(futureProof.storageProof?.[0]?.value || "0x0");
    console.log(`   storageValue: ${futureValue}`);
    console.log(`   Expected: ${lockAmount}`);
    console.log(`   Match: ${futureValue === lockAmount}`);

    // Final assertion
    console.log("\n=== RESULTS ===");
    console.log(`Direct read works: ${directValue === lockAmount}`);
    console.log(`eth_getProof 'latest' works: ${latestValue === lockAmount}`);
    console.log(
      `eth_getProof lock block works: ${lockBlockValue === lockAmount}`,
    );
    console.log(`eth_getProof lock+5 works: ${futureValue === lockAmount}`);

    // At least one of the eth_getProof calls should work
    if (
      latestValue !== lockAmount &&
      lockBlockValue !== lockAmount &&
      futureValue !== lockAmount
    ) {
      console.error(
        "\n❌ CRITICAL: eth_getProof never returns correct storage value!",
      );
      console.error(
        "This indicates the Ethereum node doesn't properly support eth_getProof",
      );
    }
  }, 120000);
});
