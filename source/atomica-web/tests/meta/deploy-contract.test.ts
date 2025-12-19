import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupLocalnet,
  fundAccount,
  runAptosCmd,
} from "../../test-utils/localnet";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

/**
 * Test: Move Contract Deployment
 * Meta test running in Node.js environment to verify localnet infrastructure
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
  faucet: "http://127.0.0.1:8081",
});
const aptos = new Aptos(config);

describe.sequential("Move Contract Deployment", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  afterAll(async () => {
    // No teardown in persistent mode
  });

  it("should deploy a noop contract", async () => {
    console.log("Starting contract deployment test...");

    // Generate deployer account
    const deployer = Account.generate();
    console.log(`Deployer address: ${deployer.accountAddress.toString()}`);

    // Verify deployer starts with 0 balance
    const initialBalance = await aptos.getAccountAPTAmount({
      accountAddress: deployer.accountAddress,
    });
    console.log(`Deployer initial balance: ${initialBalance}`);
    expect(initialBalance).toBe(0);

    // Fund deployer with 1 billion octas (10 APT)
    console.log("Funding deployer...");
    await fundAccount(deployer.accountAddress.toString(), 1_000_000_000);

    // Wait a moment for funding to be indexed
    await new Promise((r) => setTimeout(r, 1000));

    // Verify deployer was funded
    const fundedBalance = await aptos.getAccountAPTAmount({
      accountAddress: deployer.accountAddress,
    });
    console.log(`Deployer balance after funding: ${fundedBalance}`);
    expect(fundedBalance).toBe(1_000_000_000);

    // Path to noop contract (relative to project root, resolved by Node server)
    const NOOP_DIR = "tests/fixtures/noop";
    console.log(`Noop contract directory: ${NOOP_DIR}`);

    // Compile and publish the noop module directly without aptos init
    console.log("Publishing noop module...");

    // Run aptos CLI to publish the contract
    await runAptosCmd(
      [
        "move",
        "publish",
        "--named-addresses",
        `noop=${deployer.accountAddress.toString()}`,
        "--private-key",
        deployer.privateKey.toString(),
        "--url",
        "http://127.0.0.1:8080",
        "--assume-yes",
      ],
      NOOP_DIR,
    );

    // Check if module exists on-chain
    console.log("Verifying module deployment...");
    const modules = await aptos.getAccountModules({
      accountAddress: deployer.accountAddress,
    });
    console.log(`Found ${modules.length} module(s) at deployer address`);

    const noopModule = modules.find((m) => m.abi?.name === "noop");
    expect(noopModule).toBeDefined();
    console.log(`Noop module found: ${noopModule?.abi?.name}`);

    // Verify the module has the expected function
    const hasDoNothing = noopModule?.abi?.exposed_functions.some(
      (f) => f.name === "do_nothing",
    );
    expect(hasDoNothing).toBe(true);
    console.log("Module has 'do_nothing' function: true");

    // Check deployer's final balance
    const finalBalance = await aptos.getAccountAPTAmount({
      accountAddress: deployer.accountAddress,
    });
    console.log(`Deployer final balance: ${finalBalance}`);
    const gasUsed = 1_000_000_000 - finalBalance;
    console.log(`Gas used for deployment: ${gasUsed} octas`);

    expect(finalBalance).toBeLessThan(1_000_000_000);
    expect(gasUsed).toBeGreaterThan(0);
    expect(gasUsed).toBeLessThan(1_000_000);
  }, 180000);
});
