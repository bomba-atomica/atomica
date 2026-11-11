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
  });
});

describe("planned tests (SCOUT)", () => {
  it.todo(
    "SCOUT(#232) getDerivedAddress returns one address for the checksummed, lowercase and uppercase-hex forms of an Ethereum address",
  );
  // Recorded on main at 4ca0acd: getDerivedAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "localhost:3000")
  // is 0x50ccc023d06341b127ca69fd9a204f401118aca3385292926aa2a9ed42ae80e6.
  it.todo(
    "SCOUT(#232) getDerivedAddress of a fixed lowercase address and domain equals the constant recorded before the change",
  );
});
