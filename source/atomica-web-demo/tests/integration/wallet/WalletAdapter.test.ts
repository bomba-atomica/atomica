import { describe, it, expect, beforeAll } from "vitest";
import { setupBrowserWalletMock } from "../../../test-utils/browser-utils/wallet-mock";
import { ethers } from "ethers";

const TEST_ACCOUNT = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"; // Hardhat Account 0
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

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
