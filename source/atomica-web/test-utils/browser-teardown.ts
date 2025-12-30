/**
 * Global teardown for Vitest browser mode tests
 *
 * This ensures all async operations, timers, browser contexts,
 * and Docker testnet are properly closed before the process exits.
 */
import { teardownLocalnet } from "./localnet";

export async function teardown() {
  // Give async operations time to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Tear down the Docker testnet if it's running
  try {
    await teardownLocalnet();
  } catch {
    // Silently handle teardown errors
  }
}
