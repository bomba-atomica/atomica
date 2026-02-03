#!/usr/bin/env bun
/**
 * End-to-End Script: Deploy LockBox and Generate Real Ethereum Proof
 *
 * This script:
 * 1. Starts Ethereum Docker testnet (Geth + Lighthouse)
 * 2. Deploys FakeETH, FakeUSD, and LockBox contracts
 * 3. Locks tokens in LockBox
 * 4. Generates a real state proof
 * 5. Saves proof to fixtures for Move tests
 *
 * CRITICAL: Uses Ethereum Docker SDK (NOT Anvil/Hardhat)
 *
 * NOTE: This script is a template/placeholder. Full implementation requires:
 * - Private key management
 * - Contract deployment integration
 * - Token minting/locking transactions
 */

import { ethers } from "ethers";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { generateLockedBalanceProof } from "../src/lib/ethereum/proofs/generator.js";
import { serializeProofForAptos } from "../src/lib/ethereum/proofs/index.js";

// NOTE: Uncomment when @atomica/ethereum-docker-testnet is available in package.json
// import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";

async function main() {
  console.log("═".repeat(80));
  console.log("  Phase 4D: Deploy LockBox & Generate Real Ethereum Proof");
  console.log("═".repeat(80));

  console.log("\n⚠️  This script is a template/placeholder.");
  console.log(
    "For now, use manual workflow documented in PHASE-4D-PROGRESS.md\n",
  );

  try {
    // Step 1: Start Ethereum Docker testnet
    console.log("\n📦 Step 1/5: Starting Ethereum Docker testnet...");
    console.log(
      "   Run manually: cd source/docker-testnet/ethereum-testnet/typescript-sdk",
    );
    console.log("   Then: bun run test/block-production.test.ts");

    // NOTE: Uncomment when implementing
    // const testnet = await EthereumDockerTestnet.start(8);
    // await testnet.waitForHealthy(300);

    // Step 2: Connect to testnet
    console.log("\n🔌 Step 2/5: Connecting to Ethereum...");
    const rpcUrl = process.env.ETH_RPC_URL || "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const blockNumber = await provider.getBlockNumber();
    console.log(`   ✅ Connected (block: ${blockNumber})`);

    // Step 3: Deploy contracts (manual for now)
    console.log("\n🚀 Step 3/5: Deploying contracts...");
    console.log("   Run manually: cd source/evm-contracts");
    console.log(
      "   Then: forge script script/DeployLockBox.s.sol:DeployLockBox \\",
    );
    console.log("         --rpc-url http://localhost:8545 --broadcast");

    const lockBoxAddress = process.env.VITE_LOCKBOX_ADDRESS;
    const fakeETHAddress = process.env.VITE_FAKE_ETH_ADDRESS;

    if (!lockBoxAddress || !fakeETHAddress) {
      console.log("\n❌ Contract addresses not found in environment");
      console.log("   Set VITE_LOCKBOX_ADDRESS and VITE_FAKE_ETH_ADDRESS");
      return;
    }

    // Step 4: Lock tokens (manual for now)
    console.log("\n🔒 Step 4/5: Locking tokens...");
    console.log("   Run manually with cast:");
    console.log('   cast send $LOCKBOX_ADDRESS "lock(address,uint256)" \\');
    console.log("         $FAKE_ETH_ADDRESS 10000000000000000000 \\");
    console.log("         --rpc-url http://localhost:8545");

    // Step 5: Generate proof
    console.log("\n⚙️  Step 5/5: Generating proof...");
    const userAddress = process.env.USER_ADDRESS;

    if (!userAddress) {
      console.log("   ⚠️  USER_ADDRESS not set, skipping proof generation");
      console.log("   Use scripts/generate-proof.ts after locking tokens");
      return;
    }

    const proofBlock = blockNumber - 1;
    const proof = await generateLockedBalanceProof(
      provider,
      lockBoxAddress,
      userAddress,
      fakeETHAddress,
      proofBlock,
    );

    console.log("   ✅ Proof generated");

    // Save proof
    const outputDir = "tests/fixtures";
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const output = {
      proof,
      serializedForAptos: serializeProofForAptos(proof),
      metadata: {
        generated_at: new Date().toISOString(),
        testnet: "ethereum-docker",
      },
    };

    await writeFile(
      `${outputDir}/real-ethereum-proof.json`,
      JSON.stringify(output, null, 2),
    );

    console.log("\n✨ Done! See PHASE-4D-PROGRESS.md for next steps");
  } catch (error) {
    console.error("\n❌ Error:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
