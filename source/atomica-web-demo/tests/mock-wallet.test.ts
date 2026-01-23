import { describe, it, expect } from "vitest";
import { MockWallet } from "@atomica/aptos-docker-testnet/browser-utils/MockWallet";

describe("MockWallet Test", () => {
  it("should create MockWallet", () => {
    const TEST_PK = "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
    const wallet = new MockWallet(TEST_PK);
    expect(wallet).toBeDefined();
    expect(wallet.address).toBeDefined();
  });
});
