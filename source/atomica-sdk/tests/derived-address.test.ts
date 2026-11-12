import { describe, it, expect } from "vitest";
import { getDerivedAddress } from "../src/siwe";

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

    it("getDerivedAddress returns one address for the checksummed, lowercase and uppercase-hex forms of an Ethereum address", async () => {
      const domain = "localhost:3000";
      const lower = await getDerivedAddress(
        "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        domain,
      );
      const checksummed = await getDerivedAddress(
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        domain,
      );
      const upperHex = await getDerivedAddress(
        "0xF39FD6E51AAD88F6F4CE6AB8827279CFFFB92266",
        domain,
      );

      expect(checksummed.toString()).toBe(lower.toString());
      expect(upperHex.toString()).toBe(lower.toString());
    });

    // Recorded on main at 4ca0acd, before getDerivedAddress lowercased its input.
    it("getDerivedAddress of a fixed lowercase address and domain equals the constant recorded before the change", async () => {
      const addr = await getDerivedAddress(
        "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        "localhost:3000",
      );
      expect(addr.toString()).toBe(
        "0x50ccc023d06341b127ca69fd9a204f401118aca3385292926aa2a9ed42ae80e6",
      );
    });
  });
});
