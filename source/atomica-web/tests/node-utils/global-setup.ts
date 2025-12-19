/**
 * Global setup for browser tests
 *
 * Setup: Nothing (browser commands handle orchestration)
 * Teardown: Ensure localnet is stopped when all tests complete
 */
import { teardownLocalnet } from "./localnet";

export async function setup() {
  // No-op: Browser commands handle all setup
  // Tests use: await commands.setupLocalnet(); await commands.deployContracts();
}

export async function teardown() {
  console.log("[Global Teardown] Stopping localnet...");
  await teardownLocalnet();
  console.log("[Global Teardown] Complete");
}
