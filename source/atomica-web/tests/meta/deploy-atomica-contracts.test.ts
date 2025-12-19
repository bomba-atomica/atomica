import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet, fundAccount, runAptosCmd } from "../../test-utils/localnet";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

/**
 * Test: Atomica Contract Deployment
 * Meta test running in Node.js environment to verify localnet infrastructure
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
  faucet: "http://127.0.0.1:8081",
});
const aptos = new Aptos(config);

describe.sequential("Atomica Contract Deployment", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  afterAll(async () => {
    // No teardown in persistent mode
  });

  it("should deploy atomica contracts and verify modules exist", async () => {
    console.log("Starting Atomica contract deployment test...");

    // Generate deployer account
    const deployer = Account.generate();
    console.log(`Deployer address: ${deployer.accountAddress.toString()}`);

    // Fund deployer with 10 APT
    console.log("Funding deployer...");
    await fundAccount(deployer.accountAddress.toString(), 1_000_000_000);

    // Wait for funding to be indexed
    await new Promise((r) => setTimeout(r, 1000));

    // Verify deployer was funded
    const fundedBalance = await aptos.getAccountAPTAmount({
      accountAddress: deployer.accountAddress,
    });
    console.log(`Deployer balance after funding: ${fundedBalance}`);
    expect(fundedBalance).toBe(1_000_000_000);

    // Path to atomica-move-contracts relative to project root (WEB_DIR)
    // Assuming structure: source/atomica-web and source/atomica-move-contracts are siblings
    const CONTRACTS_DIR = "../atomica-move-contracts";
    console.log(`Contracts directory: ${CONTRACTS_DIR}`);

    // Publish the atomica-move-contracts package
    console.log("Publishing atomica contracts...");
    await runAptosCmd([
      "move",
      "publish",
      "--package-dir",
      CONTRACTS_DIR,
      "--named-addresses",
      `atomica=${deployer.accountAddress.toString()}`,
      "--private-key",
      deployer.privateKey.toString(),
      "--url",
      "http://127.0.0.1:8080",
      "--assume-yes",
    ]);

    // Wait for deployment to be indexed
    await new Promise((r) => setTimeout(r, 2000));

    // Check if modules exist on-chain
    console.log("Verifying module deployment...");
    const modules = await aptos.getAccountModules({
      accountAddress: deployer.accountAddress,
    });
    console.log(`Found ${modules.length} module(s) at deployer address`);

    // Log all module names
    const moduleNames = modules.map((m) => m.abi?.name || "unknown");
    console.log(`Module names: ${moduleNames.join(", ")}`);

    // Verify expected modules exist
    const expectedModules = ["registry", "fake_eth", "fake_usd"];

    for (const expectedModule of expectedModules) {
      const module = modules.find((m) => m.abi?.name === expectedModule);
      expect(
        module,
        `Module ${expectedModule} should be deployed`,
      ).toBeDefined();
      console.log(`✓ Module '${expectedModule}' found`);
    }

    // Verify registry module has expected functions
    const registryModule = modules.find((m) => m.abi?.name === "registry");
    expect(
      registryModule?.abi?.exposed_functions.some(
        (f) => f.name === "initialize",
      ),
    ).toBe(true);
    console.log("✓ Registry module has expected functions");

    // Verify fake_eth module has expected functions
    const fakeEthModule = modules.find((m) => m.abi?.name === "fake_eth");
    expect(
      fakeEthModule?.abi?.exposed_functions.some(
        (f) => f.name === "initialize",
      ),
    ).toBe(true);
    console.log("✓ fake_eth module has expected functions");

    // Verify fake_usd module has expected functions
    const fakeUsdModule = modules.find((m) => m.abi?.name === "fake_usd");
    expect(
      fakeUsdModule?.abi?.exposed_functions.some(
        (f) => f.name === "initialize",
      ),
    ).toBe(true);
    console.log("✓ fake_usd module has expected functions");

    // Check deployer's final balance
    const finalBalance = await aptos.getAccountAPTAmount({
      accountAddress: deployer.accountAddress,
    });
    console.log(`Deployer final balance: ${finalBalance}`);
    const gasUsed = 1_000_000_000 - finalBalance;
    console.log(`Gas used for deployment: ${gasUsed} octas`);

    expect(finalBalance).toBeLessThan(1_000_000_000);
    expect(gasUsed).toBeGreaterThan(0);

    console.log(
      "\n✅ All Atomica contracts deployed and verified successfully!",
    );
  }, 180000);
});
