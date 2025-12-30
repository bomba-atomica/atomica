import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupLocalnet,
  fundAccount,
  getTestnet,
} from "../../test-utils/localnet";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";
import { resolve as pathResolve } from "path";

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

    // Path to noop contract (absolute path required by Docker SDK)
    const NOOP_DIR = pathResolve(process.cwd(), "tests/fixtures/noop");
    console.log(`Noop contract directory: ${NOOP_DIR}`);

    // Compile and publish the noop module using Docker SDK
    console.log("Publishing noop module...");

    const testnet = getTestnet();
    await testnet.deployContracts({
      contractsDir: NOOP_DIR,
      deployerPrivateKey: deployer.privateKey.toString(),
      deployerAddress: deployer.accountAddress.toString(),
      namedAddresses: { noop: deployer.accountAddress.toString() },
      fundAmount: 0n, // Already funded above
    });

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
