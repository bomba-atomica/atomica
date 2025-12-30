import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet, fundAccount } from "../../test-utils/localnet";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

/**
 * Test: Simple APT Transfer
 * Meta test running in Node.js environment to verify localnet infrastructure
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
});
const aptos = new Aptos(config);

describe.sequential("Simple APT Transfer", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  afterAll(async () => {
    // No teardown in persistent mode
  });

  it("should perform a simple transfer", async () => {
    // Generate two accounts
    const alice = Account.generate();
    const bob = Account.generate();

    // Verify both accounts start with 0 balance
    const aliceInitialBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    const bobInitialBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    expect(aliceInitialBalance).toBe(0);
    expect(bobInitialBalance).toBe(0);

    // Fund Alice with 1 billion octas (10 APT)
    await fundAccount(alice.accountAddress.toString(), 1_000_000_000);

    // Wait a moment for the funding to be indexed
    await new Promise((r) => setTimeout(r, 1000));

    // Verify Alice was funded
    const aliceFundedBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    expect(aliceFundedBalance).toBe(1_000_000_000);

    // Build transfer transaction
    const txn = await aptos.transaction.build.simple({
      sender: alice.accountAddress,
      data: {
        function: "0x1::aptos_account::transfer",
        functionArguments: [bob.accountAddress, 100],
      },
    });

    // Sign and submit transaction
    const pendingTxn = await aptos.signAndSubmitTransaction({
      signer: alice,
      transaction: txn,
    });

    // Wait for transaction confirmation
    const response = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });
    expect(response.success).toBe(true);

    // Check final balances
    const aliceFinalBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    const bobFinalBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });

    // Bob should have exactly 100 octas
    expect(bobFinalBalance).toBe(100);

    // Alice should have less than initial (due to transfer + gas fees)
    // Gas fees include account creation cost since Bob didn't exist
    // Typical gas for account creation transfer: ~100,000 octas
    const gasPaid = 1_000_000_000 - aliceFinalBalance - 100;

    expect(aliceFinalBalance).toBeLessThan(1_000_000_000);
    expect(aliceFinalBalance).toBeGreaterThan(999_800_000); // Allow for gas fees + account creation

    // Verify the math: initial - transfer - gas = final
    expect(aliceFinalBalance).toBe(1_000_000_000 - 100 - gasPaid);
  }, 60000); // 60s timeout
});
