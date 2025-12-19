// Test the simplest possible transaction to isolate the issue
// This tests just the signature verification without complex contracts

import { submitNativeTransaction } from "./aptos";

/**
 * Test with the simplest possible entry function
 * This mimics what the Rust smoke test does
 */
export async function testSimpleTransaction(ethAddress: string) {
  console.log("=== Testing Simple Transaction ===");
  console.log("This will attempt to call aptos_account::transfer");
  console.log("If this fails, the issue is with signature verification itself");
  console.log(
    "If this succeeds, the issue might be with the FAKEETH contract\n",
  );

  try {
    // Try a simple transfer (like the Rust smoke test)
    // Transfer 1 APT to a random address
    const randomAddress = "0x" + "1".repeat(64); // Just a dummy address

    await submitNativeTransaction(ethAddress, {
      function: "0x1::aptos_account::transfer",
      functionArguments: [randomAddress, 100], // 100 octas (very small amount)
    });

    console.log("\n✅ Simple transaction succeeded!");
    console.log("This means signature verification is working correctly");
    console.log("The issue might be specific to the FAKEETH contract");

    return { success: true };
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("\n❌ Simple transaction failed:", errorMessage);
    console.error(
      "This means there's an issue with signature verification itself",
    );

    if (errorMessage.includes("INVALID_SIGNATURE")) {
      console.error("\nINVALID_SIGNATURE error detected");
      console.error("Possible causes:");
      console.error(
        "1. The Move contract is receiving different message bytes than what we signed",
      );
      console.error("2. There's a bug in the BCS serialization");
      console.error(
        "3. The entry function name extraction in Move differs from what we put in SIWE message",
      );
    }

    return { success: false, error: e.message };
  }
}
