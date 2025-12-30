import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet, fundAccount } from "../../test-utils/localnet";
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
 * Meta test running in Node.js environment to verify localnet infrastructure
 */

const config = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
});
const aptos = new Aptos(config);

describe.sequential("SECP256k1 Account Faucet Funding", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  afterAll(async () => {
    // No teardown in persistent mode
  });

  it("should fund a SECP256k1 account via faucet", async () => {
    // Step 1: Generate a new SECP256k1 account (Ethereum-compatible)
    const bob = SingleKeyAccount.generate({
      scheme: SigningSchemeInput.Secp256k1Ecdsa,
    });

    // Verify the private key is the correct type
    expect(bob.privateKey).toBeInstanceOf(Secp256k1PrivateKey);

    // Step 2: Check initial balance (should be 0, account doesn't exist yet)
    const initialBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    expect(initialBalance).toBe(0);

    // Step 3: Fund the account via faucet
    const fundingAmount = 1_000_000_000; // 10 APT (1 APT = 100,000,000 octas)

    await fundAccount(bob.accountAddress.toString(), fundingAmount);

    // Wait a moment for the transaction to be indexed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 4: Verify the account was funded
    const finalBalance = await aptos.getAccountAPTAmount({
      accountAddress: bob.accountAddress,
    });
    expect(finalBalance).toBe(fundingAmount);

    // Step 5: Verify account was created on-chain
    const accountInfo = await aptos.getAccountInfo({
      accountAddress: bob.accountAddress,
    });
    expect(accountInfo.sequence_number).toBe("0"); // New account, no transactions yet
  }, 60000); // 60s timeout

  it("should fund SECP256k1 account created from Ethereum private key", async () => {
    // Step 1: Create SECP256k1 account from Ethereum-format private key
    const ethereumPrivateKeyHex =
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

    const aptosPrivateKey = new Secp256k1PrivateKey(ethereumPrivateKeyHex);
    const aptosAccount = new SingleKeyAccount({ privateKey: aptosPrivateKey });

    // Step 2: Verify initial balance is 0
    const initialBalance = await aptos.getAccountAPTAmount({
      accountAddress: aptosAccount.accountAddress,
    });
    expect(initialBalance).toBe(0);

    // Step 3: Fund via faucet
    const fundingAmount = 500_000_000; // 5 APT
    await fundAccount(aptosAccount.accountAddress.toString(), fundingAmount);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 4: Verify funding succeeded
    const finalBalance = await aptos.getAccountAPTAmount({
      accountAddress: aptosAccount.accountAddress,
    });
    expect(finalBalance).toBe(fundingAmount);
  }, 60000); // 60s timeout
});
