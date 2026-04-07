// Integration test for Aptos transaction signing via Ed25519.
// Validates that native Ed25519 accounts can sign and submit transactions to the localnet.
// FakeETH/FakeUSD minting is EVM-only; this suite tests the Ed25519 signing path with APT transfers.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";
import { commands } from "vitest/browser";

// Recipient for APT transfers used as test transactions
const TRANSFER_RECIPIENT =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

describe.sequential("Aptos Ed25519 Transaction Signing", () => {
  let aptos: Aptos;
  let testAccount: Account;

  beforeAll(async () => {
    console.log("Starting Localnet...");
    await commands.setupLocalnet();
    // No deployContracts() needed — tests use native APT transfers only

    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    aptos = new Aptos(config);

    testAccount = Account.generate();
    console.log(
      `Test Account Address: ${testAccount.accountAddress.toString()}`,
    );

    await commands.fundAccount(
      testAccount.accountAddress.toString(),
      500_000_000, // 5 APT — covers max gas reservation (2M units * 100 price = 200M octas minimum)
    );

    await new Promise((r) => setTimeout(r, 2000));
  }, 120000);

  afterAll(async () => {
    console.log("Stopping Localnet...");
    await commands.teardownLocalnet();
  });

  it("should sign and submit a native APT transfer with Ed25519", async () => {
    const transaction = await aptos.transaction.build.simple({
      sender: testAccount.accountAddress,
      data: {
        function: "0x1::aptos_account::transfer",
        functionArguments: [TRANSFER_RECIPIENT, 1000],
      },
    });

    console.log("Signing transaction with Ed25519...");
    const committedTx = await aptos.signAndSubmitTransaction({
      signer: testAccount,
      transaction,
    });

    console.log(`Transaction Hash: ${committedTx.hash}`);
    expect(committedTx.hash).toBeDefined();

    const txInfo = await aptos.waitForTransaction({
      transactionHash: committedTx.hash,
    });

    console.log("Transaction committed:", txInfo.success);
    expect(txInfo.success).toBe(true);
  }, 60000);

  it("should submit multiple sequential transactions with Ed25519", async () => {
    for (const amount of [500, 300]) {
      const tx = await aptos.transaction.build.simple({
        sender: testAccount.accountAddress,
        data: {
          function: "0x1::aptos_account::transfer",
          functionArguments: [TRANSFER_RECIPIENT, amount],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({
        signer: testAccount,
        transaction: tx,
      });

      await aptos.waitForTransaction({ transactionHash: committed.hash });
    }

    console.log("Multiple sequential transactions completed successfully");
  }, 60000);
});
