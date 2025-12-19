import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { commands } from "vitest/browser";
import {
  Aptos,
  AptosConfig,
  Network,
  SingleKeyAccount,
  Secp256k1PrivateKey,
  SigningSchemeInput,
} from "@aptos-labs/ts-sdk";

/**
 * Test: SECP256k1 Account Funding via Faucet
 * ...
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
  faucet: "http://127.0.0.1:8081",
});
const aptos = new Aptos(config);

describe.sequential("SECP256k1 Account Faucet Funding", () => {
  beforeAll(async () => {
    await commands.setupLocalnet();
  }, 120000);

  afterAll(async () => {
    await commands.teardownLocalnet();
  });

  it("should fund a SECP256k1 account via faucet", async () => {
    console.log("\n=== Starting SECP256k1 Faucet Test ===\n");

    // Step 1: Generate a new SECP256k1 account (Ethereum-compatible)
    console.log("Step 1: Generating SECP256k1 account (Bob)...");
    const bob = SingleKeyAccount.generate({
      scheme: SigningSchemeInput.Secp256k1Ecdsa,
    });

    console.log(`Bob's address: ${bob.accountAddress.toString()}`);
    console.log(`Bob's key type: SECP256k1 (Ethereum-compatible)`);
    console.log(`Bob's private key: ${bob.privateKey.toString()}`);

    // Verify the private key is the correct type
    expect(bob.privateKey).toBeInstanceOf(Secp256k1PrivateKey);
    console.log("✓ Confirmed Bob uses SECP256k1 private key");

    // Step 2: Check initial balance (should be 0, account doesn't exist yet)
    console.log("\nStep 2: Checking initial balance...");
    const initialBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    console.log(`Initial balance: ${initialBalance} octas`);
    console.log("Note: New accounts return 0 balance (not an error)");
    expect(initialBalance).toBe(0);

    // Step 3: Fund the account via faucet
    console.log("\nStep 3: Requesting funding from faucet...");
    const fundingAmount = 1_000_000_000; // 10 APT (1 APT = 100,000,000 octas)
    console.log(`Requesting ${fundingAmount} octas (10 APT)...`);

    await commands.fundAccount(bob.accountAddress.toString(), fundingAmount);

    // ...

    // Wait a moment for the transaction to be indexed
    console.log("Waiting for transaction to be indexed...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 4: Verify the account was funded
    console.log("\nStep 4: Verifying account was funded...");
    const finalBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    console.log(`Final balance: ${finalBalance} octas`);
    expect(finalBalance).toBe(fundingAmount);

    // Step 5: Verify account was created on-chain
    console.log("\nStep 5: Verifying account exists on-chain...");
    const accountInfo = await aptos.getAccountInfo({
      accountAddress: bob.accountAddress,
    });
    console.log(`Account sequence number: ${accountInfo.sequence_number}`);
    console.log(
      `Account authentication key: ${accountInfo.authentication_key}`,
    );
    expect(accountInfo.sequence_number).toBe("0"); // New account, no transactions yet

    // Summary
    console.log("\n=== Test Summary ===");
    console.log("✓ SECP256k1 account generated successfully");
    console.log("✓ Initial balance was 0 (account didn't exist)");
    console.log(`✓ Faucet funded account with ${fundingAmount} octas`);
    console.log("✓ Account was created on-chain automatically");
    console.log(`✓ Final balance: ${finalBalance} octas`);
    console.log(
      "\nKey Takeaway: SECP256k1 accounts work identically to Ed25519 accounts",
    );
    console.log("for faucet funding. The faucet is key-type agnostic.\n");
  }, 60000); // 60s timeout

  it("should fund SECP256k1 account created from Ethereum private key", async () => {
    console.log("\n=== Testing Ethereum Private Key Compatibility ===\n");

    // Step 1: Create SECP256k1 account from Ethereum-format private key
    console.log(
      "Step 1: Creating SECP256k1 account from Ethereum private key...",
    );
    const ethereumPrivateKeyHex =
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    console.log(`Ethereum private key: ${ethereumPrivateKeyHex}`);

    const aptosPrivateKey = new Secp256k1PrivateKey(ethereumPrivateKeyHex);
    const aptosAccount = new SingleKeyAccount({ privateKey: aptosPrivateKey });

    console.log(`Aptos address: ${aptosAccount.accountAddress.toString()}`);
    console.log(
      "Note: Address differs from Ethereum due to SHA3-256 vs Keccak-256",
    );

    // Step 2: Verify initial balance is 0
    console.log("\nStep 2: Checking initial balance...");
    const initialBalance = await aptos.getAccountAPTAmount({
      accountAddress: aptosAccount.accountAddress,
    });
    console.log(`Initial balance: ${initialBalance} octas`);
    expect(initialBalance).toBe(0);

    // Step 3: Fund via faucet
    console.log("\nStep 3: Funding account via faucet...");
    const fundingAmount = 500_000_000; // 5 APT
    await commands.fundAccount(aptosAccount.accountAddress.toString(), fundingAmount);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 4: Verify funding succeeded
    console.log("\nStep 4: Verifying funding...");
    const finalBalance = await aptos.getAccountAPTAmount({
      accountAddress: aptosAccount.accountAddress,
    });
    console.log(`Final balance: ${finalBalance} octas`);
    expect(finalBalance).toBe(fundingAmount);

    // Summary
    console.log("\n=== Test Summary ===");
    console.log("✓ Ethereum private key imported to Aptos");
    console.log("✓ Aptos address derived (differs from Ethereum address)");
    console.log("✓ Faucet funded the account successfully");
    console.log(`✓ Account balance: ${finalBalance} octas`);
    console.log(
      "\nKey Insight: Ethereum private keys work on Aptos, but produce",
    );
    console.log("different addresses. Faucet funding works regardless.\n");
  }, 60000); // 60s timeout
});
