import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet, fundAccount } from "../../test-utils/localnet";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

/**
 * Test: Ed25519 Account Funding via Faucet
 * Meta test running in Node.js environment to verify localnet infrastructure
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
  faucet: "http://127.0.0.1:8081",
});
const aptos = new Aptos(config);

describe.sequential("Ed25519 Faucet Funding", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  afterAll(async () => {
    // No teardown in persistent mode
  });

  it("should fund an Ed25519 account via faucet", async () => {
    console.log("Starting faucet test...");
    const alice = Account.generate();
    console.log(`Generated account: ${alice.accountAddress.toString()}`);

    // Verify account balance is 0 before funding
    const initialBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    console.log(`Initial balance: ${initialBalance} (should be 0)`);
    expect(initialBalance).toBe(0);

    const txnHash = await fundAccount(alice.accountAddress.toString());
    console.log("Funding request completed. Transaction hash:", txnHash);

    const txnRes = await aptos.waitForTransaction({ transactionHash: txnHash });
    console.log("Faucet txn confirmed! Success:", (txnRes as any).success);

    // Wait for it to be indexed/available on node
    let balance = 0;
    for (let i = 0; i < 20; i++) {
      console.log(`Checking balance attempt ${i + 1}...`);
      await new Promise((r) => setTimeout(r, 1000));
      try {
        balance = await aptos.getAccountAPTAmount({
          accountAddress: alice.accountAddress,
        });
        console.log(`Current balance: ${balance}`);
        if (balance >= 100_000_000) break;
      } catch (e: any) {
        console.log(`Balance check error (attempt ${i + 1}):`, e.message);
        // Ignore errors while waiting for indexer/node
      }
    }

    console.log(`Final balance: ${balance}, expected: 100000000`);
    expect(balance).toBe(100_000_000);
  }, 60000); // 60s timeout
});
