import { describe, it, expect, beforeAll } from "vitest";
import { setupBrowserWalletMock } from "../../../test-utils/browser-utils/wallet-mock";
import { ethers } from "ethers";
import {
  HARDHAT_ACCOUNT_0_ADDRESS,
  HARDHAT_ACCOUNT_0_PRIVATE_KEY,
} from "../../../shared/test-constants";

const TEST_ACCOUNT = HARDHAT_ACCOUNT_0_ADDRESS; // Hardhat Account 0
const TEST_PK = HARDHAT_ACCOUNT_0_PRIVATE_KEY;

describe.sequential("Wallet Adapter Sanity (Browser)", () => {
  beforeAll(() => {
    // Setup the mock wallet without starting localnet
    // This verifies the adapter works in isolation
    setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);
  });

  it("should have window.ethereum injected", () => {
    expect(window.ethereum).toBeDefined();
    expect(window.ethereum?.isMetaMask).toBe(true);
  });

  it("should support eth_requestAccounts", async () => {
    const accounts = await window.ethereum?.request({
      method: "eth_requestAccounts",
    });
    expect(accounts).toHaveLength(1);
    expect(accounts?.[0].toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });

  it("should support personal_sign", async () => {
    const message = "Hello Atomica!";
    const hexMessage = ethers.hexlify(ethers.toUtf8Bytes(message));

    const signature = await window.ethereum?.request({
      method: "personal_sign",
      params: [hexMessage, TEST_ACCOUNT],
    });

    expect(signature).toBeDefined();
    expect(signature).toMatch(/^0x/);

    // Verify the signature using ethers
    const recoveredAddress = ethers.verifyMessage(message, signature!);
    expect(recoveredAddress.toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });
});
