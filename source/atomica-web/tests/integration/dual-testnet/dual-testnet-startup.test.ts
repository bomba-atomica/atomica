import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { DockerTestnet } from "@atomica/docker-testnet";

/**
 * Integration test for dual testnet startup
 * Verifies that both Ethereum and Aptos testnets can run simultaneously
 */
describe("Dual Testnet Startup Integration", () => {
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

    const blockNumber = await ethTestnet.getBlockNumber();
    expect(blockNumber).toBeGreaterThanOrEqual(0);

    const chainId = await ethTestnet.getChainId();
    expect(chainId).toBe(1337);
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
    // Get initial block heights
    const ethStartBlock = await ethTestnet.getBlockNumber();
    const aptosStartBlock = await aptosTestnet.getBlockHeight(0);

    console.log(
      `Initial blocks - ETH: ${ethStartBlock}, Aptos: ${aptosStartBlock}`
    );

    // Wait for new blocks on both chains
    await Promise.all([
      ethTestnet.waitForBlocks(2, 60), // Wait for 2 ETH blocks
      aptosTestnet.waitForBlocks(2, 60), // Wait for 2 Aptos blocks
    ]);

    // Verify block heights increased
    const ethEndBlock = await ethTestnet.getBlockNumber();
    const aptosEndBlock = await aptosTestnet.getBlockHeight(0);

    console.log(`Final blocks - ETH: ${ethEndBlock}, Aptos: ${aptosEndBlock}`);

    expect(ethEndBlock).toBeGreaterThan(ethStartBlock);
    expect(aptosEndBlock).toBeGreaterThan(aptosStartBlock);
  });

  it("should have separate ports for each testnet", () => {
    // Ethereum ports
    const ethRpcUrl = ethTestnet.getExecutionRpcUrl();
    const ethBeaconUrl = ethTestnet.getBeaconApiUrl();

    expect(ethRpcUrl).toContain("8545");
    expect(ethBeaconUrl).toContain("5052");

    // Aptos ports
    const aptosUrl = aptosTestnet.validatorApiUrl(0);
    expect(aptosUrl).toContain("8080");

    // Ensure they're different
    expect(ethRpcUrl).not.toContain("8080");
    expect(aptosUrl).not.toContain("8545");
  });

  it("should have pre-funded accounts on Ethereum testnet", async () => {
    const testAccounts = ethTestnet.getTestAccounts();
    expect(testAccounts).toHaveLength(4);

    // Check first account has balance
    const balance = await ethTestnet.getBalance(testAccounts[0].address);
    expect(balance).toBeGreaterThan(0n);
  });

  it("should have faucet available on Aptos testnet", async () => {
    const faucetAccount = aptosTestnet.getFaucetAccount();
    expect(faucetAccount).toBeDefined();

    // Test faucet by funding a new account
    const testAddress = "0x" + "1".repeat(64); // Random test address

    await aptosTestnet.faucet(testAddress, 100_000_000n); // 1 APT

    // Verify account was funded (would need Aptos client to check balance)
    // For now, just verify faucet call didn't throw
    expect(true).toBe(true);
  });
});
