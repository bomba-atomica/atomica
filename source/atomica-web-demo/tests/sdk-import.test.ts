import { describe, it, expect } from "vitest";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";

describe("SDK Import Test", () => {
  it("should import getDerivedAddress", () => {
    expect(typeof getDerivedAddress).toBe("function");
  });
});
