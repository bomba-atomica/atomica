import { describe, it, expect } from "vitest";
import { AccountAuthenticator } from "@aptos-labs/ts-sdk";

describe("Aptos SDK Test", () => {
  it("should have AccountAuthenticator", () => {
    expect(AccountAuthenticator).toBeDefined();
  });
});
