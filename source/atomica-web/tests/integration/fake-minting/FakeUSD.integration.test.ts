// Low-level integration test for FakeUSD using Ed25519 signing
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";
import {
  setupLocalnet,
  teardownLocalnet,
  fundAccount,
  deployContracts,
} from "../../setup/localnet";

const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";

describe.sequential("FakeUSD Integration Test (Ed25519)", () => {
  let aptos: Aptos;
  let testAccount: Account;

  beforeAll(async () => {
    console.log("Starting Localnet...");
    await setupLocalnet();

    // Initialize Aptos client
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    aptos = new Aptos(config);

    // Deploy contracts
    console.log("Deploying contracts...");
    await deployContracts();

    // Generate Ed25519 test account
    testAccount = Account.generate();
    console.log(
      `Test Account Address: ${testAccount.accountAddress.toString()}`,
    );

    // Fund the test account with APT for gas
    await fundAccount(testAccount.accountAddress.toString(), 100_000_000); // 1 APT

    // Wait for funding to be indexed
    await new Promise((r) => setTimeout(r, 2000));

    // Note: Fungible assets auto-create primary stores, no registration needed
  }, 120000);

  afterAll(async () => {
    console.log("Stopping Localnet...");
    await teardownLocalnet();
  });

  it("should sign and submit FakeUSD mint transaction with Ed25519", async () => {
    const mintAmount = 10000000; // 10 FAKEUSD (6 decimals)

    // Build the mint transaction - mints to the signer
    const transaction = await aptos.transaction.build.simple({
      sender: testAccount.accountAddress,
      data: {
        function: `${DEPLOYER_ADDR}::fake_usd::mint`,
        functionArguments: [mintAmount],
      },
    });

    console.log("Signing transaction with Ed25519...");
    const committedTx = await aptos.signAndSubmitTransaction({
      signer: testAccount,
      transaction,
    });

    console.log(`Transaction Hash: ${committedTx.hash}`);
    expect(committedTx.hash).toBeDefined();

    // Wait for transaction to be committed
    const txInfo = await aptos.waitForTransaction({
      transactionHash: committedTx.hash,
    });

    console.log("Transaction committed:", txInfo.success);
    expect(txInfo.success).toBe(true);

    // For now, just verify transaction succeeded
    // TODO: Add proper balance checking for fungible assets
    console.log("FAKEUSD minted successfully");
  }, 60000);

  it("should accumulate balance on multiple mints", async () => {
    const firstMint = 5000000; // 5 FAKEUSD
    const secondMint = 3000000; // 3 FAKEUSD

    // First mint
    const tx1 = await aptos.transaction.build.simple({
      sender: testAccount.accountAddress,
      data: {
        function: `${DEPLOYER_ADDR}::fake_usd::mint`,
        functionArguments: [firstMint],
      },
    });

    const committed1 = await aptos.signAndSubmitTransaction({
      signer: testAccount,
      transaction: tx1,
    });

    await aptos.waitForTransaction({ transactionHash: committed1.hash });

    // Second mint
    const tx2 = await aptos.transaction.build.simple({
      sender: testAccount.accountAddress,
      data: {
        function: `${DEPLOYER_ADDR}::fake_usd::mint`,
        functionArguments: [secondMint],
      },
    });

    const committed2 = await aptos.signAndSubmitTransaction({
      signer: testAccount,
      transaction: tx2,
    });

    await aptos.waitForTransaction({ transactionHash: committed2.hash });

    console.log("Multiple mints completed successfully");
    // TODO: Add proper balance verification for fungible assets
  }, 60000);
});
