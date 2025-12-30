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
    const alice = Account.generate();

    // Verify account balance is 0 before funding
    const initialBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    expect(initialBalance).toBe(0);

    const txnHash = await fundAccount(alice.accountAddress.toString());

    await aptos.waitForTransaction({ transactionHash: txnHash });

    // Wait for it to be indexed/available on node
    let balance = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        balance = await aptos.getAccountAPTAmount({
          accountAddress: alice.accountAddress,
        });
        if (balance >= 100_000_000) break;
      } catch {
        // Ignore errors while waiting for indexer/node
      }
    }

    expect(balance).toBe(100_000_000);
  }, 60000); // 60s timeout
});
