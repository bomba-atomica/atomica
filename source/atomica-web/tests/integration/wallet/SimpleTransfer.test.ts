/**
 * SimpleTransfer Browser Test
 *
 * PURPOSE:
 * This test validates the complete end-to-end flow of submitting an Aptos blockchain
 * transaction using Sign-In with Ethereum (SIWE) authentication IN A REAL BROWSER.
 * It demonstrates that an Ethereum wallet (MetaMask) can control an Aptos account
 * through cryptographic signatures without requiring the user to have an Aptos wallet.
 *
 * WHAT IT TESTS:
 * 1. Ethereum wallet mocking - Simulates MetaMask without browser extension
 * 2. SIWE authentication - Ethereum address signs a message to prove ownership
 * 3. Aptos address derivation - Derives deterministic Aptos address from Ethereum address
 * 4. Transaction submission - Submits native Aptos transaction (APT transfer)
 * 5. Signature verification - Ensures the blockchain accepts the Ethereum signature
 * 6. Balance verification - Confirms the transaction executed successfully on-chain
 *
 * KEY ARCHITECTURE CONCEPTS:
 * - Uses a deterministic mapping: Ethereum Address -> Aptos Address
 * - The derived Aptos address is controlled by the Ethereum wallet's signatures
 * - No Aptos private key exists - only the Ethereum private key is used
 * - Signatures are created using Secp256k1 (Ethereum) but verified on Aptos blockchain
 * - This enables "wallet-less" Aptos interactions using existing Ethereum wallets
 *
 * TEST ENVIRONMENT:
 * - Runs in REAL Chromium browser via Playwright (not happy-dom simulation)
 * - Uses browser-compatible wallet mock (setupBrowserWalletMock)
 * - Connects to local Aptos testnet (localnet) running on port 8080
 * - Uses deterministic test wallet (Hardhat Account 0)
 *
 * ARCHITECTURE DECISIONS:
 * - **Browser-only code**: This test uses ONLY browser APIs (fetch, window, etc.)
 * - **No Node.js modules**: All Node.js-specific code (fs, http, child_process) is in
 *   test setup files (global-setup.ts, localnet.ts) which run in Node.js context
 * - **Separation of concerns**:
 *   - global-setup.ts (Node.js): Starts localnet, deploys contracts
 *   - This test file (Browser): Pure web code that runs in Chromium
 * - **Browser-compatible utilities**: Uses native fetch for faucet calls instead of
 *   Node.js http module
 *
 * DIFFERENCES FROM HAPPY-DOM VERSION:
 * - Uses browser-compatible wallet mock instead of eth-testing (which requires Node.js)
 * - Uses native fetch instead of node-fetch polyfills
 * - Runs in actual Chromium browser (more realistic testing)
 * - Better testing of real browser APIs and behaviors
 * - All code in this file can run in production web environment
 */

import { describe, it, expect, beforeAll } from "vitest";
import { setupBrowserWalletMock } from "../../browser-utils/wallet-mock";
import { commands } from "vitest/browser";
import {
  aptos,
  getDerivedAddress,
  setAptosInstance,
  submitNativeTransaction,
} from "../../../src/lib/aptos";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

/**
 * Browser-compatible faucet funding function
 * Uses native fetch which is available in browser test environment
 */
async function fundAccountBrowser(address: string, amount: number) {
  console.log(`[Browser fundAccount] Requesting ${amount} for ${address}...`);

  const response = await fetch(
    `http://127.0.0.1:8081/mint?amount=${amount}&address=${address}`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(
      `Faucet funding failed with status: ${response.status} ${response.statusText}`,
    );
  }

  console.log(`[Browser fundAccount] Response status: ${response.status}`);
  const body = await response.json();
  console.log(`[Browser fundAccount] Response body: ${JSON.stringify(body)}`);
  return body;
}

const TEST_ACCOUNT = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"; // Hardhat Account 0
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.sequential(
  "MetaMask Mock Fidelity - Simple Transfer (Browser)",
  () => {
    beforeAll(async () => {
      // 1. Ensure localnet is running and contracts deployed
      await commands.setupLocalnet();
      await commands.deployContracts();

      console.log("[Browser Test] Initializing test environment...");

      // 2. Inject fetch-compatible Aptos instance
      const config = new AptosConfig({
        network: Network.LOCAL,
        fullnode: "http://127.0.0.1:8080/v1",
        faucet: "http://127.0.0.1:8081",
      });
      setAptosInstance(new Aptos(config));

      // 3. Setup browser-compatible wallet mock
      setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);

      console.log("[Browser Test] Setup complete");
    }, 180000); // 3-minute timeout for setup

    it("should successfully sign and submit a simple APT transfer", async () => {
      /**
       * TEST FLOW OVERVIEW:
       * 1. Derive Aptos address from Ethereum address
       * 2. Fund the derived Aptos account with APT for gas fees
       * 3. Mock the personal_sign RPC method to sign messages with Ethereum wallet
       * 4. Submit an APT transfer transaction using SIWE authentication
       * 5. Verify the transaction succeeded on-chain
       * 6. Verify the recipient's balance increased by the transfer amount
       */

      // STEP 1: Derive the Aptos address from the Ethereum address
      // This uses a deterministic derivation function:
      // derivedAddress = sha3_256(ethereumAddress + domain_separator)
      const derivedAddr = await getDerivedAddress(TEST_ACCOUNT);
      const derivedAddrStr = derivedAddr.toString();
      console.log(
        `[Browser Test] Test Account: ${TEST_ACCOUNT} -> ${derivedAddrStr}`,
      );

      // STEP 2: Fund the derived Aptos account
      // The derived account needs APT (Aptos native coin) to pay for gas fees
      // 100_000_000 Octas = 1 APT (Aptos uses 8 decimals)
      await fundAccountBrowser(derivedAddrStr, 100_000_000); // 1 APT
      // Wait for funding transaction to be indexed by the blockchain
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // STEP 3: Submit transaction using SIWE authentication
      // NOTE: The browser wallet mock (set up in beforeAll) already handles personal_sign
      // When submitNativeTransaction calls window.ethereum.request({ method: "personal_sign" }),
      // the mock will automatically sign the message with the Ethereum wallet
      // This tests the complete flow:
      // a. submitNativeTransaction() generates a SIWE message
      // b. Calls window.ethereum.request({ method: "personal_sign" })
      // c. Our mock above signs the message with the Ethereum wallet
      // d. The signature is used to authenticate the Aptos transaction
      // e. The transaction is submitted to the blockchain
      const recipient =
        "0x0000000000000000000000000000000000000000000000000000000000000001"; // Burn address / Foundation
      console.log("[Browser Test] Submitting transfer...");

      // Get initial balance of recipient to verify balance change later
      let initialBalance = 0n;
      try {
        const res = await aptos.getAccountCoinAmount({
          accountAddress: recipient,
          coinType: "0x1::aptos_coin::AptosCoin",
        });
        initialBalance = BigInt(res);
      } catch {
        // Ignore error (account might not exist yet)
      }
      console.log(
        `[Browser Test] Initial Balance of ${recipient}: ${initialBalance}`,
      );

      // Submit the APT transfer transaction
      // This will:
      // 1. Generate SIWE message
      // 2. Call personal_sign (intercepted by our mock)
      // 3. Construct Aptos transaction with the signature
      // 4. Submit to blockchain
      const txPromise = submitNativeTransaction(TEST_ACCOUNT, {
        function: "0x1::aptos_account::transfer", // Built-in Aptos transfer function
        functionArguments: [recipient, 1000], // Transfer 1000 Octas (0.00001 APT)
      });

      // STEP 4: Verify transaction submission and execution
      const result = await txPromise;
      console.log("[Browser Test] Transaction Submitted:", result.hash);

      // Verify we got a transaction hash back
      expect(result.hash).toBeDefined();

      // Wait for transaction to be committed and check success
      const txInfo = await aptos.waitForTransaction({
        transactionHash: result.hash,
      });
      expect(txInfo.success).toBe(true);
      console.log("[Browser Test] Transaction Executed Successfully!");

      // STEP 5: Verify balance change on-chain
      // This is the ultimate proof that:
      // - The transaction was submitted correctly
      // - The blockchain accepted the Ethereum signature
      // - The transfer executed as expected
      const finalRes = await aptos.getAccountCoinAmount({
        accountAddress: recipient,
        coinType: "0x1::aptos_coin::AptosCoin",
      });
      const finalBalance = BigInt(finalRes);
      console.log(
        `[Browser Test] Final Balance of ${recipient}: ${finalBalance}`,
      );

      // Balance should increase by exactly 1000 Octas
      expect(finalBalance).toBe(initialBalance + 1000n);
      console.log("[Browser Test] Balance verification passed!");

      /**
       * WHAT THIS TEST PROVES:
       * 1. Ethereum signatures can authenticate Aptos transactions IN A REAL BROWSER
       * 2. No Aptos wallet is needed - only MetaMask (or any Ethereum wallet)
       * 3. The SIWE flow works end-to-end in a browser environment
       * 4. The derived Aptos account is properly controlled by the Ethereum address
       * 5. Transactions execute correctly and balances update as expected
       * 6. Browser-specific APIs (fetch, window, etc.) work correctly
       *
       * WHY THIS MATTERS:
       * This enables users to interact with Aptos dApps using their existing
       * Ethereum wallets (MetaMask, Coinbase Wallet, etc.) in a real browser
       * environment, without needing to:
       * - Install a separate Aptos wallet
       * - Manage Aptos private keys
       * - Understand Aptos-specific wallet concepts
       *
       * They simply sign a message with their Ethereum wallet in the browser,
       * and it "just works" on Aptos blockchain.
       */
    }, 120000);
  },
);
