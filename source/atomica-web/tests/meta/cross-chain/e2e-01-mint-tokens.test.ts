import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import {
  getFakeETHArtifact,
  getFakeUSDArtifact,
} from "../ethereum/solidity-compiler";
import { sendAndWaitForTx } from "../helpers/transaction-utils";
import {
  setupDualChainFixture,
  teardownDualChainFixture,
  DualChainFixture,
} from "./helpers/dual-chain-fixture";

/**
 * E2E Test 1: Mint FakeETH and FakeUSD on Ethereum
 *
 * Verifies that:
 * - FakeETH can be minted to a user address
 * - FakeUSD can be minted to a user address
 * - Balances are correctly reflected on-chain
 */
describe("E2E 01: Mint Tokens on Ethereum", () => {
  let fixture: DualChainFixture;

  // Test amounts
  const MINT_AMOUNT_ETH = ethers.parseEther("1000"); // 1000 FakeETH
  const MINT_AMOUNT_USD = ethers.parseUnits("5000", 6); // 5000 FakeUSD (6 decimals)

  beforeAll(async () => {
    fixture = await setupDualChainFixture();
  }, 600000); // 10 minute timeout for setup

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should mint FakeETH and FakeUSD on Ethereum", async () => {
    console.log("\n[TEST 1] Minting FakeETH and FakeUSD...");

    // Mint FakeETH
    const fakeETHArtifact = getFakeETHArtifact();
    const fakeEthContract = new ethers.Contract(
      fixture.eth.contracts.fakeETH,
      fakeETHArtifact.abi,
      fixture.eth.signer,
    );

    console.log(`  Minting ${ethers.formatEther(MINT_AMOUNT_ETH)} FakeETH...`);
    const mintEthReceipt = await sendAndWaitForTx(
      fakeEthContract.mint(fixture.eth.signer.address, MINT_AMOUNT_ETH),
      1,
    );
    console.log(
      `  ✓ Tx hash: ${mintEthReceipt.hash} (status: ${mintEthReceipt.status})`,
    );

    const ethBalance = await fakeEthContract.balanceOf(
      fixture.eth.signer.address,
    );
    expect(ethBalance).toBe(MINT_AMOUNT_ETH);
    console.log(`  ✓ Balance: ${ethers.formatEther(ethBalance)} FakeETH`);

    // Mint FakeUSD
    const fakeUSDArtifact = getFakeUSDArtifact();
    const fakeUsdContract = new ethers.Contract(
      fixture.eth.contracts.fakeUSD,
      fakeUSDArtifact.abi,
      fixture.eth.signer,
    );

    console.log(
      `  Minting ${ethers.formatUnits(MINT_AMOUNT_USD, 6)} FakeUSD...`,
    );
    const mintUsdReceipt = await sendAndWaitForTx(
      fakeUsdContract.mint(fixture.eth.signer.address, MINT_AMOUNT_USD),
      1,
    );
    console.log(
      `  ✓ Tx hash: ${mintUsdReceipt.hash} (status: ${mintUsdReceipt.status})`,
    );

    const usdBalance = await fakeUsdContract.balanceOf(
      fixture.eth.signer.address,
    );
    expect(usdBalance).toBe(MINT_AMOUNT_USD);
    console.log(`  ✓ Balance: ${ethers.formatUnits(usdBalance, 6)} FakeUSD`);
  }, 60000);
});
