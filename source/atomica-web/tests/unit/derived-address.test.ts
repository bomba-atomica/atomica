import { describe, it, expect } from "vitest";
import { getDerivedAddress } from "../../src/lib/aptos";

describe("Address Derivation Helpers", () => {
  describe("getDerivedAddress", () => {
    it("should derive a consistent address", async () => {
      const ethAddr = "0x1234567890123456789012345678901234567890";
      const addr1 = await getDerivedAddress(ethAddr);
      const addr2 = await getDerivedAddress(ethAddr);

      expect(addr1.toString()).toEqual(addr2.toString());
      // We know it produces an Aptos address (32 bytes / 64 hex chars + 0x)
      expect(addr1.toString()).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });
});
