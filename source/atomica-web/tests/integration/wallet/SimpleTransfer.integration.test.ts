// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { generateTestingUtils } from "eth-testing";
import nodeFetch, { Request, Response, Headers } from "node-fetch";
import {
  setupLocalnet,
  teardownLocalnet,
  fundAccount,
} from "../../setup/localnet";
import {
  aptos,
  getDerivedAddress,
  setAptosInstance,
  submitNativeTransaction,
} from "../../../src/lib/aptos";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { URL } from "url";
import { ethers } from "ethers";
import { setTimeout } from "timers/promises";

// Polyfill fetch
global.fetch = nodeFetch as any;
global.Request = Request as any;
global.Response = Response as any;
global.Headers = Headers as any;
global.URL = URL as any;

window.fetch = nodeFetch as any;
(window as any).Request = Request;
(window as any).Response = Response;
(window as any).Headers = Headers;
(window as any).URL = URL;

// Standard Hardhat Account 0
const TEST_ACCOUNT = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.sequential("MetaMask Mock Fidelity - Simple Transfer", () => {
  const testingUtils = generateTestingUtils({ providerType: "MetaMask" });

  beforeAll(async () => {
    console.log("Starting Localnet...");
    await setupLocalnet();

    // Inject fetch-compatible Aptos instance
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    setAptosInstance(new Aptos(config));

    // Mock window.ethereum
    Object.defineProperty(window, "ethereum", {
      value: testingUtils.getProvider(),
      writable: true,
    });

    // Mock window.location
    Object.defineProperty(window, "location", {
      value: {
        protocol: "http:",
        host: "localhost:3000",
        origin: "http://localhost:3000",
        href: "http://localhost:3000/",
      },
      writable: true,
      configurable: true,
    });

    // Setup Provider Mocks
    testingUtils.mockChainId("0x4");
    testingUtils.mockAccounts([TEST_ACCOUNT]);
    testingUtils.mockRequestAccounts([TEST_ACCOUNT]);
  }, 600000);

  afterAll(async () => {
    await teardownLocalnet();
    testingUtils.clearAllMocks();
  });

  afterEach(() => {
    testingUtils.clearAllMocks();
    testingUtils.mockChainId("0x4");
    testingUtils.mockAccounts([TEST_ACCOUNT]);
  });

  it("should successfully sign and submit a simple APT transfer", async () => {
    const derivedAddr = await getDerivedAddress(TEST_ACCOUNT);
    const derivedAddrStr = derivedAddr.toString();
    console.log(`Test Account: ${TEST_ACCOUNT} -> ${derivedAddrStr}`);

    // 1. Fund Account
    await fundAccount(derivedAddrStr, 100_000_000); // 1 APT
    // Wait for funding
    await setTimeout(2000);

    // 2. Setup Signature Interceptor
    const wallet = new ethers.Wallet(TEST_PK);
    testingUtils.lowLevel.mockRequest(
      "personal_sign",
      async (params: any[]) => {
        const [msgHex] = params;
        const msgStr = ethers.toUtf8String(msgHex);
        return await wallet.signMessage(msgStr); // Standard EIP-191 sign
      },
    );

    // 3. Submit Transaction (Simple Transfer)
    const recipient =
      "0x0000000000000000000000000000000000000000000000000000000000000001"; // Burn address / Foundation
    console.log("Submitting transfer...");

    // Get initial balance
    let initialBalance = 0n;
    try {
      const res = await aptos.getAccountCoinAmount({
        accountAddress: recipient,
        coinType: "0x1::aptos_coin::AptosCoin",
      });
      initialBalance = BigInt(res);
    } catch (e) {
      // Ignore error (account might not exist)
    }
    console.log(`Initial Balance of ${recipient}: ${initialBalance}`);

    const txPromise = submitNativeTransaction(TEST_ACCOUNT, {
      function: "0x1::aptos_account::transfer",
      functionArguments: [recipient, 1000], // 1000 Octas
    });

    // 4. Verify Success
    const result = await txPromise;
    console.log("Transaction Submitted:", result.hash);

    expect(result.hash).toBeDefined();

    const txInfo = await aptos.waitForTransaction({
      transactionHash: result.hash,
    });
    expect(txInfo.success).toBe(true);
    console.log("Transaction Executed Successfully!");

    // 5. Verify Balance Change
    const finalRes = await aptos.getAccountCoinAmount({
      accountAddress: recipient,
      coinType: "0x1::aptos_coin::AptosCoin",
    });
    const finalBalance = BigInt(finalRes);
    console.log(`Final Balance of ${recipient}: ${finalBalance}`);

    expect(finalBalance).toBe(initialBalance + 1000n);
    console.log("Balance verification passed!");
  }, 120000);
});
