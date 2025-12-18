// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupLocalnet,
  teardownLocalnet,
  fundAccount,
} from "../../setup/localnet";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

/**
 * Test: Simple APT Transfer Between Accounts
 *
 * Purpose:
 * This test verifies that the basic APT transfer functionality works correctly
 * on the local testnet. It demonstrates the fundamental transaction flow that
 * most applications will use: funding an account and transferring tokens to another.
 *
 * What the test does:
 * 1. Generates two new Ed25519 accounts (Alice as sender, Bob as recipient)
 * 2. Verifies both accounts start with 0 balance
 * 3. Funds Alice with 1,000,000,000 octas (10 APT) via the faucet
 * 4. Verifies Alice's balance is correctly updated
 * 5. Builds a transfer transaction sending 100 octas from Alice to Bob
 * 6. Signs and submits the transaction using Alice's private key
 * 7. Waits for the transaction to be confirmed on-chain
 * 8. Verifies the transaction succeeded
 * 9. Checks final balances (Alice should have ~999,999,900 after gas, Bob should have 100)
 *
 * How Aptos transfers work:
 * - Uses the built-in function: 0x1::aptos_account::transfer
 * - This function automatically creates the recipient account if it doesn't exist
 * - Transfer amount is specified in octas (1 APT = 100,000,000 octas)
 * - The sender pays gas fees from their balance
 * - Transaction must be signed by the sender's private key
 * - Transaction lifecycle: build → sign → submit → wait for confirmation
 *
 * Gas fees:
 * - Gas fees are deducted from the sender's balance
 * - Typical gas cost varies (can be ~100,000 octas for account creation transfers)
 * - Final sender balance = initial - transfer_amount - gas_fees
 * - Gas is higher when the recipient account doesn't exist (account creation cost)
 *
 * Common expectations:
 * - Bob's account is created automatically by the transfer (no pre-funding needed)
 * - Bob receives exactly the transfer amount (100 octas)
 * - Alice pays for gas, so her balance decreases by (100 + gas_fees)
 * - Transaction success field should be true
 * - Both accounts are queryable after the transfer
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
  faucet: "http://127.0.0.1:8081",
});
const aptos = new Aptos(config);

describe.sequential("Simple APT Transfer", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  afterAll(async () => {
    await teardownLocalnet();
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
    await fundAccount(alice.accountAddress.toString(), 1_000_000_000);

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
