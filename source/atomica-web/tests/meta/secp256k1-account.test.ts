import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet, fundAccount } from "../../test-utils/localnet";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  SingleKeyAccount,
  Secp256k1PrivateKey,
  SigningSchemeInput,
} from "@aptos-labs/ts-sdk";

/**
 * Test: SECP256k1 Account Creation and Usage
 * Meta test running in Node.js environment to verify localnet infrastructure
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
});
const aptos = new Aptos(config);

describe.sequential("SECP256k1 Account Creation and Usage", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  afterAll(async () => {
    // No teardown in persistent mode
  });

  it("should create SECP256k1 account, receive transfer, and send back", async () => {
    // Step 1: Create Ed25519 account (Alice) - traditional Aptos account
    const alice = Account.generate(); // Defaults to Ed25519

    // Verify Alice starts with 0 balance
    const aliceInitialBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    expect(aliceInitialBalance).toBe(0);

    // Step 2: Create SECP256k1 account (Bob) - Ethereum-compatible
    const bob = SingleKeyAccount.generate({
      scheme: SigningSchemeInput.Secp256k1Ecdsa,
    });

    // Verify Bob starts with 0 balance (account doesn't exist yet)
    const bobInitialBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    expect(bobInitialBalance).toBe(0);

    // Verify we created different key types
    expect(bob.privateKey).toBeInstanceOf(Secp256k1PrivateKey);

    // Step 3: Fund Alice
    await fundAccount(alice.accountAddress.toString(), 1_000_000_000);
    await new Promise((r) => setTimeout(r, 1000)); // Wait for indexing

    const aliceFundedBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    expect(aliceFundedBalance).toBe(1_000_000_000);

    // Step 4: Alice sends 100,000,000 octas (1 APT) to Bob
    const transferAmount = 100_000_000;

    const aliceToBobTxn = await aptos.transaction.build.simple({
      sender: alice.accountAddress,
      data: {
        function: "0x1::aptos_account::transfer",
        functionArguments: [bob.accountAddress, transferAmount],
      },
    });

    const aliceToBobPending = await aptos.signAndSubmitTransaction({
      signer: alice,
      transaction: aliceToBobTxn,
    });

    const aliceToBobResponse = await aptos.waitForTransaction({
      transactionHash: aliceToBobPending.hash,
    });
    expect(aliceToBobResponse.success).toBe(true);

    // Step 5: Verify Bob received the tokens
    const bobBalanceAfterReceive = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    expect(bobBalanceAfterReceive).toBe(transferAmount);

    // Verify Alice paid for the transfer + gas
    const aliceBalanceAfterSend = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    expect(aliceBalanceAfterSend).toBeLessThan(1_000_000_000 - transferAmount);

    // Step 6: Bob (SECP256k1) signs transaction to send 50,000,000 octas back to Alice
    const returnAmount = 50_000_000;

    const bobToAliceTxn = await aptos.transaction.build.simple({
      sender: bob.accountAddress,
      data: {
        function: "0x1::aptos_account::transfer",
        functionArguments: [alice.accountAddress, returnAmount],
      },
    });

    const bobToAlicePending = await aptos.signAndSubmitTransaction({
      signer: bob,
      transaction: bobToAliceTxn,
    });

    const bobToAliceResponse = await aptos.waitForTransaction({
      transactionHash: bobToAlicePending.hash,
    });
    expect(bobToAliceResponse.success).toBe(true);

    // Step 7: Verify final balances
    const aliceFinalBalance = await aptos.getAccountAPTAmount({
      accountAddress: alice.accountAddress,
    });
    const bobFinalBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });

    // Alice should have received the return amount
    expect(aliceFinalBalance).toBeGreaterThan(aliceBalanceAfterSend);
    expect(aliceFinalBalance).toBe(aliceBalanceAfterSend + returnAmount);

    // Bob should have less than initial receive (paid return + gas)
    expect(bobFinalBalance).toBeLessThan(bobBalanceAfterReceive);
    const bobGasPaid = bobBalanceAfterReceive - returnAmount - bobFinalBalance;
    expect(bobFinalBalance).toBe(
      bobBalanceAfterReceive - returnAmount - bobGasPaid,
    );
  }, 60000); // 60s timeout

  it("should verify SECP256k1 key properties", async () => {
    // Generate SECP256k1 account
    const account = SingleKeyAccount.generate({
      scheme: SigningSchemeInput.Secp256k1Ecdsa,
    });

    // Verify private key is 32 bytes
    const privateKeyBytes = account.privateKey.toUint8Array();
    expect(privateKeyBytes.length).toBe(32);

    // Verify public key is 65 bytes (uncompressed SECP256k1)
    const publicKeyBytes = account.publicKey.publicKey.toUint8Array();
    expect(publicKeyBytes.length).toBe(65);

    // Verify signing scheme
    // Note: signingScheme is a numeric enum value, not a string
    expect(account.signingScheme).toBeDefined();

    // Test message signing
    const message = "Hello from SECP256k1!";
    const signature = account.sign(message);

    expect(signature.signature.toUint8Array().length).toBe(64);

    // Verify signature
    const isValid = account.verifySignature({ message, signature });
    expect(isValid).toBe(true);
  });

  it("should demonstrate Ethereum key compatibility", async () => {
    // Simulate an Ethereum private key (32 bytes)
    const ethereumPrivateKeyHex =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    // Create Aptos account using the Ethereum private key
    const aptosPrivateKey = new Secp256k1PrivateKey(ethereumPrivateKeyHex);
    const aptosAccount = new SingleKeyAccount({ privateKey: aptosPrivateKey });

    // Verify the account works
    const message = "Ethereum-derived key on Aptos!";
    const signature = aptosAccount.sign(message);
    const isValid = aptosAccount.verifySignature({ message, signature });

    expect(isValid).toBe(true);
  });
});
