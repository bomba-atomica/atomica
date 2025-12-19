/**
 * Localnet Health Check - Browser Test
 *
 * This test verifies that the local Aptos testnet is running and healthy.
 * It uses browser commands to call Node.js orchestration code for setup.
 *
 * The setup command starts localnet and deploys contracts.
 * Teardown is handled by globalSetup when all tests complete.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { commands } from "vitest/browser";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
  faucet: "http://127.0.0.1:8081",
});
const aptos = new Aptos(config);

describe.sequential("Localnet Health Check", () => {
  beforeAll(async () => {
    // Start localnet via browser command (runs in Node.js)
    await commands.setupLocalnet();
    // Deploy contracts via browser command (runs in Node.js)
    await commands.deployContracts();
  }, 180000); // 3 minute timeout for setup + deploy

  // Note: We rely on globalSetup for final teardown to avoid breaking
  // the Vitest browser runner connection (which happens if we kill processes too early).
  // Setup is idempotent via browser commands.

  it("should have a running localnet with correct chain ID", async () => {
    const info = await aptos.getLedgerInfo();
    console.log(`Chain ID: ${info.chain_id}`);
    expect(info.chain_id).toBe(4);
  });
});
