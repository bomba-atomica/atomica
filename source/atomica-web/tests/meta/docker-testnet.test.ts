import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DockerTestnet } from "../../test-utils/docker-testnet";

/**
 * Test: Docker Testnet - Multi-Validator Blockchain Progress
 *
 * This meta test verifies that a 2-validator Docker testnet can be automatically
 * set up, make blockchain progress, and be torn down cleanly.
 *
 * PATTERN (matches Rust harness):
 * - beforeAll: `DockerTestnet.new(2)` - Fresh testnet with automatic cleanup of old state
 * - Tests: Verify blockchain progress and multi-validator consensus
 * - afterAll: `testnet.teardown()` - Clean up containers and volumes
 *
 * KEY FEATURES TESTED:
 * 1. Automatic setup from pre-built images (no build step)
 * 2. Blockchain makes progress (block height increments)
 * 3. Multi-validator consensus works
 * 4. All validators stay in sync
 * 5. Automatic teardown cleans up properly
 *
 * REQUIREMENTS:
 * - Docker Desktop running
 * - Internet connection (first run only, to pull images)
 * - Ports 8080-8081 available
 * - 4GB RAM minimum
 *
 * NOTES:
 * - Uses pre-built images: ghcr.io/bomba-atomica/atomica-aptos/validator:latest
 * - First run: ~1-2 minutes (image download)
 * - Subsequent runs: ~30-45 seconds
 * - Matches Rust `DockerTestnet` harness pattern
 * - Each test file gets its own isolated testnet
 */

describe.sequential("Docker Testnet - Multi-Validator Progress", () => {
  let testnet: DockerTestnet;

  beforeAll(async () => {
    // Create fresh testnet with 2 validators
    // This will:
    // 1. Check Docker is running
    // 2. Clean up any existing testnet
    // 3. Start 2 fresh validators
    // 4. Wait for all to be healthy
    testnet = await DockerTestnet.new(2);
  }, 180000); // 3 minutes for image pull + startup

  afterAll(async () => {
    // Clean up all containers and volumes
    await testnet.teardown();
  }, 60000); // 1 minute for teardown

  it("should verify testnet is running with correct chain configuration", async () => {
    // Get ledger info from validator 0
    const ledgerInfo = await testnet.getLedgerInfo(0);

    // Verify chain ID is 4 (local testnet)
    expect(ledgerInfo.chain_id).toBe(4);

    // Verify ledger has progressed beyond genesis (or is at genesis)
    const blockHeight = parseInt(ledgerInfo.block_height, 10);
    expect(blockHeight).toBeGreaterThanOrEqual(0);

    // Verify ledger version exists
    const ledgerVersion = parseInt(ledgerInfo.ledger_version, 10);
    expect(ledgerVersion).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("should verify blockchain is making progress over time", async () => {
    // Get initial block height
    const initialHeight = await testnet.getBlockHeight(0);

    // Wait for 10 blocks to be produced
    await testnet.waitForBlocks(10, 60);

    // Get final block height
    const finalHeight = await testnet.getBlockHeight(0);
    const blocksProduced = finalHeight - initialHeight;

    // Verify at least 10 blocks were produced
    expect(blocksProduced).toBeGreaterThanOrEqual(10);
  }, 90000);

  it("should verify all 2 validators are responding", async () => {
    const numValidators = testnet.getNumValidators();
    const validatorHeights: number[] = [];

    for (let i = 0; i < numValidators; i++) {
      const height = await testnet.getBlockHeight(i);
      validatorHeights.push(height);
    }

    // All validators should have a block height
    expect(validatorHeights.length).toBe(2);

    // Calculate height variance (validators should be within a few blocks of each other)
    const minHeight = Math.min(...validatorHeights);
    const maxHeight = Math.max(...validatorHeights);
    const heightVariance = maxHeight - minHeight;

    // Validators should be synced within 10 blocks of each other
    expect(heightVariance).toBeLessThanOrEqual(10);
  }, 45000);

  it("should verify ledger info increments between API calls", async () => {
    // Take first snapshot
    const snapshot1 = await testnet.getLedgerInfo(0);
    const height1 = parseInt(snapshot1.block_height, 10);
    const version1 = parseInt(snapshot1.ledger_version, 10);

    // Wait 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Take second snapshot
    const snapshot2 = await testnet.getLedgerInfo(0);
    const height2 = parseInt(snapshot2.block_height, 10);
    const version2 = parseInt(snapshot2.ledger_version, 10);

    // Both should have increased
    expect(height2).toBeGreaterThan(height1);
    expect(version2).toBeGreaterThan(version1);
  }, 30000);

  it("should verify epoch and timestamp progression", async () => {
    const ledgerInfo1 = await testnet.getLedgerInfo(0);
    const timestamp1 = parseInt(ledgerInfo1.ledger_timestamp, 10);
    const epoch1 = parseInt(ledgerInfo1.epoch, 10);

    // Wait a few seconds
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const ledgerInfo2 = await testnet.getLedgerInfo(0);
    const timestamp2 = parseInt(ledgerInfo2.ledger_timestamp, 10);
    const epoch2 = parseInt(ledgerInfo2.epoch, 10);

    // Timestamp should have increased
    expect(timestamp2).toBeGreaterThan(timestamp1);

    // Epoch may or may not have changed (epochs are 30s)
    // But it should be >= initial epoch
    expect(epoch2).toBeGreaterThanOrEqual(epoch1);
  }, 30000);
});
