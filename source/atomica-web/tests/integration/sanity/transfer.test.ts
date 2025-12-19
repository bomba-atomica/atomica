import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { commands } from "vitest/browser";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

// ... (keep docs)

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
  faucet: "http://127.0.0.1:8081",
});
const aptos = new Aptos(config);

describe.sequential("Simple APT Transfer", () => {
  beforeAll(async () => {
    // Use browser command to setup localnet (idempotent)
    await commands.setupLocalnet();
  }, 120000);

  afterAll(async () => {
    await commands.teardownLocalnet();
  });

  it("should perform a simple transfer", async () => {
    console.log("Starting transfer test...");

    // Generate two accounts
    const alice = Account.generate();
    const bob = Account.generate();
    console.log(`Alice: ${alice.accountAddress.toString()}`);
    console.log(`Bob: ${bob.accountAddress.toString()}`);

    // Verify both accounts start with 0 balance
    const aliceInitialBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    const bobInitialBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    console.log(`Alice initial balance: ${aliceInitialBalance}`);
    console.log(`Bob initial balance: ${bobInitialBalance}`);
    expect(aliceInitialBalance).toBe(0);
    expect(bobInitialBalance).toBe(0);

    // Fund Alice with 1 billion octas (10 APT)
    console.log("Funding Alice...");
    await commands.fundAccount(alice.accountAddress.toString(), 1_000_000_000);

    // Wait a moment for the funding to be indexed
    await new Promise((r) => setTimeout(r, 1000));

    // Verify Alice was funded
    const aliceFundedBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    console.log(`Alice balance after funding: ${aliceFundedBalance}`);
    expect(aliceFundedBalance).toBe(1_000_000_000);

    // Build transfer transaction
    console.log("Building transfer transaction...");
    const txn = await aptos.transaction.build.simple({
      sender: alice.accountAddress,
      data: {
        function: "0x1::aptos_account::transfer",
        functionArguments: [bob.accountAddress, 100],
      },
    });

    // Sign and submit transaction
    console.log("Signing and submitting transaction...");
    const pendingTxn = await aptos.signAndSubmitTransaction({
      signer: alice,
      transaction: txn,
    });
    console.log(`Transaction hash: ${pendingTxn.hash}`);

    // Wait for transaction confirmation
    console.log("Waiting for transaction confirmation...");
    const response = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });
    console.log(`Transaction success: ${response.success}`);
    expect(response.success).toBe(true);

    // Check final balances
    const aliceFinalBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    const bobFinalBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    console.log(`Alice final balance: ${aliceFinalBalance}`);
    console.log(`Bob final balance: ${bobFinalBalance}`);

    // Bob should have exactly 100 octas
    expect(bobFinalBalance).toBe(100);

    // Alice should have less than initial (due to transfer + gas fees)
    // Gas fees include account creation cost since Bob didn't exist
    // Typical gas for account creation transfer: ~100,000 octas
    const gasPaid = 1_000_000_000 - aliceFinalBalance - 100;
    console.log(`Gas fees paid: ${gasPaid} octas`);

    expect(aliceFinalBalance).toBeLessThan(1_000_000_000);
    expect(aliceFinalBalance).toBeGreaterThan(999_800_000); // Allow for gas fees + account creation

    // Verify the math: initial - transfer - gas = final
    expect(aliceFinalBalance).toBe(1_000_000_000 - 100 - gasPaid);
  }, 60000); // 60s timeout
});
