import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet } from "../../test-utils/localnet";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

/**
 * Test: Localnet Health Check
 * Meta test running in Node.js environment to verify localnet infrastructure
 *
 * This is the most basic test that verifies:
 * 1. Aptos binary can be found
 * 2. Localnet can start successfully
 * 3. Ports 8080 (API) and 8081 (faucet) respond
 * 4. Network configuration is correct
 * 5. Basic ledger info is accessible
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
});
const aptos = new Aptos(config);

describe.sequential("Localnet Health Check", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  afterAll(async () => {
    // No teardown in persistent mode
  });

  it("should verify aptos binary exists and localnet responds", async () => {
    const ledgerInfo = await aptos.getLedgerInfo();

    // Verify chain ID is 4 (local testnet)
    expect(ledgerInfo.chain_id).toBe(4);

    // Step 2: Verify ledger version exists (may be 0 at genesis)
    expect(parseInt(ledgerInfo.ledger_version)).toBeGreaterThanOrEqual(0);

    // Step 3: Verify we can query account resources (basic API functionality)
    let resourceCount = 0;
    try {
      // Query resources for account 0x1 (framework account, always exists)
      const resources = await aptos.getAccountResources({
        accountAddress: "0x1",
      });
      resourceCount = resources.length;
      expect(resourceCount).toBeGreaterThan(0);
    } catch (e: any) {
      throw new Error(`Failed to query account resources: ${e.message}`);
    }
  }, 60000); // 60s timeout
});
