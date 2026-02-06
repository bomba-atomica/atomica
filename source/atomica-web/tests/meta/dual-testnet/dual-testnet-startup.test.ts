import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { DockerTestnet } from "@atomica/docker-testnet";

/**
 * Integration test for dual testnet startup
 * Verifies that both Ethereum and Aptos testnets can run simultaneously
 */
describe.sequential("Dual Testnet Startup Integration", () => {
  let ethTestnet: EthereumDockerTestnet;
  let aptosTestnet: DockerTestnet;

  beforeAll(async () => {
    console.log("Starting both testnets in parallel...");

    // Start both testnets simultaneously
    [ethTestnet, aptosTestnet] = await Promise.all([
      EthereumDockerTestnet.start(4), // 4 Ethereum validators
      DockerTestnet.new(4), // 4 Aptos validators
    ]);

    console.log("Waiting for both networks to be healthy...");

    // Wait for both networks to be ready
    await Promise.all([
      ethTestnet.waitForHealthy(180),
      aptosTestnet.waitForBlocks(1, 120),
    ]);

    console.log("Both testnets are healthy!");
  }, 400000); // 6.67 min timeout for startup

  afterAll(async () => {
    console.log("Tearing down both testnets...");

    if (ethTestnet && aptosTestnet) {
      // Teardown in parallel
      await Promise.all([ethTestnet.teardown(), aptosTestnet.teardown()]);
    }

    console.log("Cleanup complete");
  });

  it("should start Ethereum testnet successfully", async () => {
    expect(ethTestnet).toBeDefined();

    const chainId = await ethTestnet.getChainId();
    expect(chainId).toBe(32382);
  });

  it("should start Aptos testnet successfully", async () => {
    expect(aptosTestnet).toBeDefined();

    const ledgerInfo = await aptosTestnet.getLedgerInfo(0);
    expect(ledgerInfo).toBeDefined();
    expect(ledgerInfo.chain_id).toBe(4);

    const blockHeight = await aptosTestnet.getBlockHeight(0);
    expect(blockHeight).toBeGreaterThan(0);
  });

  it("should have both testnets producing blocks simultaneously", async () => {
    expect(ethTestnet).toBeDefined();
    expect(aptosTestnet).toBeDefined();

    const ethBlock0 = await ethTestnet.getBlockNumber();
    const aptosBlock0 = await aptosTestnet.getBlockHeight(0);

    console.log(`Initial blocks - ETH: ${ethBlock0}, Aptos: ${aptosBlock0}`);

    // Wait for at least 2 more blocks on both
    await Promise.all([
      ethTestnet.waitForBlocks(2, 60),
      aptosTestnet.waitForBlocks(2, 60),
    ]);

    const ethBlock1 = await ethTestnet.getBlockNumber();
    const aptosBlock1 = await aptosTestnet.getBlockHeight(0);

    console.log(`Final blocks - ETH: ${ethBlock1}, Aptos: ${aptosBlock1}`);

    expect(ethBlock1).toBeGreaterThan(ethBlock0);
    expect(aptosBlock1).toBeGreaterThan(aptosBlock0);
  }, 90000);

  it("should have separate ports for each testnet", () => {
    const ethRpcUrl = ethTestnet.getExecutionRpcUrl();
    const aptosUrl = aptosTestnet.validatorApiUrl(0);

    expect(ethRpcUrl).toContain(":8545");
    expect(aptosUrl).toContain(":8080");

    expect(ethRpcUrl).not.toBe(aptosUrl);
  });

  it("should have pre-funded accounts on Ethereum testnet", async () => {
    const accounts = ethTestnet.getTestAccounts();
    expect(accounts.length).toBeGreaterThan(0);

    const balance = await ethTestnet.getBalance(accounts[0].address);
    expect(balance).toBeGreaterThan(0n);
  });

  it("should have faucet available on Aptos testnet", async () => {
    const faucetAccount = aptosTestnet.getFaucetAccount();
    expect(faucetAccount).toBeDefined();

    const testAddress = "0x" + "1".repeat(64);
    await aptosTestnet.faucet(testAddress, 100_000_000n);
    expect(true).toBe(true);
  }, 60000);
});
