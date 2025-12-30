/**
 * Global teardown for Vitest browser mode tests
 *
 * This ensures all async operations, timers, browser contexts,
 * and Docker testnet are properly closed before the process exits.
 */
import { teardownLocalnet } from "./localnet";

export async function teardown() {
  console.log("[Global Teardown] Cleaning up browser resources...");

  // Give async operations time to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Tear down the Docker testnet if it's running
  try {
    await teardownLocalnet();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Global Teardown] Failed to cleanup testnet:", message);
  }

  console.log("[Global Teardown] Complete");
}
