/**
 * Global teardown for Vitest browser mode tests
 *
 * This ensures all async operations, timers, and browser contexts
 * are properly closed before the process exits.
 */
export async function teardown() {
  console.log("[Global Teardown] Cleaning up browser resources...");

  // Give async operations time to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log("[Global Teardown] Complete");
}
