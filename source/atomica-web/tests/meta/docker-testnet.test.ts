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
    console.log("\n=== Docker Testnet Setup ===\n");

    // Create fresh testnet with 2 validators
    // This will:
    // 1. Check Docker is running
    // 2. Clean up any existing testnet
    // 3. Start 2 fresh validators
    // 4. Wait for all to be healthy
    testnet = await DockerTestnet.new(2);

    console.log("\n✓ Testnet ready for testing\n");
  }, 180000); // 3 minutes for image pull + startup

  afterAll(async () => {
    console.log("\n=== Docker Testnet Teardown ===\n");

    // Clean up all containers and volumes
    await testnet.teardown();

    console.log("✓ Testnet cleaned up\n");
  }, 60000); // 1 minute for teardown

  it("should verify testnet is running with correct chain configuration", async () => {
    console.log("\n=== Test 1: Basic Configuration ===\n");

    // Get ledger info from validator 0
    const ledgerInfo = await testnet.getLedgerInfo(0);

    console.log(`Chain ID: ${ledgerInfo.chain_id}`);
    console.log(`Ledger version: ${ledgerInfo.ledger_version}`);
    console.log(`Block height: ${ledgerInfo.block_height}`);
    console.log(`Ledger timestamp: ${ledgerInfo.ledger_timestamp}`);

    // Verify chain ID is 4 (local testnet)
    expect(ledgerInfo.chain_id).toBe(4);
    console.log("✓ Chain ID is correct (4 = local testnet)");

    // Verify ledger has progressed beyond genesis (or is at genesis)
    const blockHeight = parseInt(ledgerInfo.block_height, 10);
    expect(blockHeight).toBeGreaterThanOrEqual(0);
    console.log(`✓ Blockchain initialized (height: ${blockHeight})`);

    // Verify ledger version exists
    const ledgerVersion = parseInt(ledgerInfo.ledger_version, 10);
    expect(ledgerVersion).toBeGreaterThanOrEqual(0);
    console.log(`✓ Ledger version exists (version: ${ledgerVersion})`);
  }, 30000);

  it("should verify blockchain is making progress over time", async () => {
    console.log("\n=== Test 2: Blockchain Progress ===\n");

    // Get initial block height
    const initialHeight = await testnet.getBlockHeight(0);
    console.log(`Initial block height: ${initialHeight}`);

    // Wait for 10 blocks to be produced
    console.log("Waiting for 10 new blocks...");
    const startTime = Date.now();

    await testnet.waitForBlocks(10, 60);

    const endTime = Date.now();
    const elapsedSeconds = ((endTime - startTime) / 1000).toFixed(1);

    // Get final block height
    const finalHeight = await testnet.getBlockHeight(0);
    const blocksProduced = finalHeight - initialHeight;

    console.log(`Final block height: ${finalHeight}`);
    console.log(`Blocks produced: ${blocksProduced}`);
    console.log(`Time elapsed: ${elapsedSeconds}s`);
    console.log(
      `Block production rate: ${(blocksProduced / parseFloat(elapsedSeconds)).toFixed(2)} blocks/second`,
    );

    // Verify at least 10 blocks were produced
    expect(blocksProduced).toBeGreaterThanOrEqual(10);
    console.log("✓ Blockchain making progress");
  }, 90000);

  it("should verify all 2 validators are responding", async () => {
    console.log("\n=== Test 3: Multi-Validator Health ===\n");

    const numValidators = testnet.getNumValidators();
    const validatorHeights: number[] = [];

    for (let i = 0; i < numValidators; i++) {
      console.log(`Querying Validator ${i}...`);

      const height = await testnet.getBlockHeight(i);
      validatorHeights.push(height);
      console.log(`  ✓ Validator ${i}: block height ${height}`);
    }

    // All validators should have a block height
    expect(validatorHeights.length).toBe(2);

    // Calculate height variance (validators should be within a few blocks of each other)
    const minHeight = Math.min(...validatorHeights);
    const maxHeight = Math.max(...validatorHeights);
    const heightVariance = maxHeight - minHeight;

    console.log(`\nHeight variance: ${heightVariance} blocks`);
    console.log(`  Min: ${minHeight}`);
    console.log(`  Max: ${maxHeight}`);

    // Validators should be synced within 10 blocks of each other
    expect(heightVariance).toBeLessThanOrEqual(10);
    console.log("✓ All validators are synced (within 10 blocks)");
  }, 45000);

  it("should verify ledger info increments between API calls", async () => {
    console.log("\n=== Test 4: Real-Time Progress Verification ===\n");

    // Take first snapshot
    const snapshot1 = await testnet.getLedgerInfo(0);
    const height1 = parseInt(snapshot1.block_height, 10);
    const version1 = parseInt(snapshot1.ledger_version, 10);

    console.log(`Snapshot 1:`);
    console.log(`  Block height: ${height1}`);
    console.log(`  Ledger version: ${version1}`);

    // Wait 5 seconds
    console.log("\nWaiting 5 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Take second snapshot
    const snapshot2 = await testnet.getLedgerInfo(0);
    const height2 = parseInt(snapshot2.block_height, 10);
    const version2 = parseInt(snapshot2.ledger_version, 10);

    console.log(`\nSnapshot 2:`);
    console.log(`  Block height: ${height2}`);
    console.log(`  Ledger version: ${version2}`);

    // Calculate increments
    const heightIncrement = height2 - height1;
    const versionIncrement = version2 - version1;

    console.log(`\nIncrement:`);
    console.log(`  Block height: +${heightIncrement}`);
    console.log(`  Ledger version: +${versionIncrement}`);

    // Both should have increased
    expect(height2).toBeGreaterThan(height1);
    expect(version2).toBeGreaterThan(version1);

    console.log("✓ Block height incrementing over time");
    console.log("✓ Ledger version incrementing over time");
  }, 30000);

  it("should verify epoch and timestamp progression", async () => {
    console.log("\n=== Test 5: Time Progression ===\n");

    const ledgerInfo1 = await testnet.getLedgerInfo(0);
    const timestamp1 = parseInt(ledgerInfo1.ledger_timestamp, 10);
    const epoch1 = parseInt(ledgerInfo1.epoch, 10);

    console.log(`Initial state:`);
    console.log(`  Epoch: ${epoch1}`);
    console.log(`  Timestamp: ${timestamp1} microseconds`);

    // Wait a few seconds
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const ledgerInfo2 = await testnet.getLedgerInfo(0);
    const timestamp2 = parseInt(ledgerInfo2.ledger_timestamp, 10);
    const epoch2 = parseInt(ledgerInfo2.epoch, 10);

    console.log(`\nAfter 3 seconds:`);
    console.log(`  Epoch: ${epoch2}`);
    console.log(`  Timestamp: ${timestamp2} microseconds`);

    // Timestamp should have increased
    const timestampDelta = timestamp2 - timestamp1;
    console.log(`\nTimestamp delta: ${timestampDelta} microseconds`);
    expect(timestamp2).toBeGreaterThan(timestamp1);

    // Epoch may or may not have changed (epochs are 30s)
    // But it should be >= initial epoch
    expect(epoch2).toBeGreaterThanOrEqual(epoch1);

    console.log("✓ Blockchain time advancing");
  }, 30000);
});
