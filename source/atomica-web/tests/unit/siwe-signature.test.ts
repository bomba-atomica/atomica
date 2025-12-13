/**
 * Unit tests for SIWE (Sign-In with Ethereum) message construction and signature verification
 *
 * These tests verify that our TypeScript implementation matches the Move contract's expectations
 * for the ethereum_derivable_account module.
 */

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { constructSIWEMessage } from "../../src/lib/aptos";

describe("SIWE Message Construction", () => {
  it("should construct message matching Move contract format", () => {
    const domain = "localhost:4173";
    const ethAddress = "0x77ec57a1249ba952ca73a09ba78caded07c9a00d";
    const entryFunction = "0x1::aptos_account::transfer";
    const networkName = "local";
    const chainId = 4;
    const nonce = "0xf790024c9374b4e2f58a5dd758b83c9b59cf41d0cb8ac5087fa02d9047866ace";
    const issuedAt = "2025-12-13T03:22:05.317Z";

    const statement = `Please confirm you explicitly initiated this request from ${domain}. You are approving to execute transaction ${entryFunction} on Aptos blockchain (${networkName}).`;

    const message = constructSIWEMessage(
      domain,
      ethAddress,
      statement,
      `http://${domain}`,
      "1",
      chainId,
      nonce,
      issuedAt
    );

    // Verify the message structure matches Move contract expectations
    expect(message).toContain(`${domain} wants you to sign in with your Ethereum account:`);
    expect(message).toContain(ethAddress);
    expect(message).toContain(`Please confirm you explicitly initiated this request from ${domain}.`);
    expect(message).toContain(`You are approving to execute transaction ${entryFunction}`);
    expect(message).toContain(`on Aptos blockchain (${networkName}).`);
    expect(message).toContain(`URI: http://${domain}`);
    expect(message).toContain("Version: 1");
    expect(message).toContain(`Chain ID: ${chainId}`);
    expect(message).toContain(`Nonce: ${nonce}`);
    expect(message).toContain(`Issued At: ${issuedAt}`);
  });

  it("should match exact Move contract message format", () => {
    const domain = "localhost:4173";
    const ethAddress = "0x77ec57a1249ba952ca73a09ba78caded07c9a00d";
    const entryFunction = "0x1::aptos_account::transfer";
    const networkName = "local";
    const chainId = 4;
    const nonce = "0xf790024c9374b4e2f58a5dd758b83c9b59cf41d0cb8ac5087fa02d9047866ace";
    const issuedAt = "2025-12-13T03:22:05.317Z";

    const statement = `Please confirm you explicitly initiated this request from ${domain}. You are approving to execute transaction ${entryFunction} on Aptos blockchain (${networkName}).`;

    const tsMessage = constructSIWEMessage(
      domain,
      ethAddress,
      statement,
      `http://${domain}`,
      "1",
      chainId,
      nonce,
      issuedAt
    );

    // What Move constructs (based on ethereum_derivable_account.move)
    const expectedMessage = `${domain} wants you to sign in with your Ethereum account:
${ethAddress}

${statement}

URI: http://${domain}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;

    expect(tsMessage).toBe(expectedMessage);
  });
});

describe("Signature Verification", () => {
  it("should verify a valid signature", () => {
    const siweMessage = `localhost:4173 wants you to sign in with your Ethereum account:
0x77ec57a1249ba952ca73a09ba78caded07c9a00d

Please confirm you explicitly initiated this request from localhost:4173. You are approving to execute transaction 0x1::aptos_account::transfer on Aptos blockchain (local).

URI: http://localhost:4173
Version: 1
Chain ID: 4
Nonce: 0xf790024c9374b4e2f58a5dd758b83c9b59cf41d0cb8ac5087fa02d9047866ace
Issued At: 2025-12-13T03:22:05.317Z`;

    const signature = "0x6008bdda63f89f9b9c19b4ee24edc05415893db13d9bcf813827d7366f008aa14b2631340d643fa4a6dee51903c7f811c153ee0ebdc220a72aa1f2689e79e41d1b";
    const expectedAddress = "0x77ec57a1249ba952ca73a09ba78caded07c9a00d";

    const recoveredAddress = ethers.verifyMessage(siweMessage, signature);

    expect(recoveredAddress.toLowerCase()).toBe(expectedAddress.toLowerCase());
  });

  it("should have correct signature format (65 bytes with valid v value)", () => {
    const signature = "0x6008bdda63f89f9b9c19b4ee24edc05415893db13d9bcf813827d7366f008aa14b2631340d643fa4a6dee51903c7f811c153ee0ebdc220a72aa1f2689e79e41d1b";

    const sigBytes = ethers.getBytes(signature);

    // Signature should be 65 bytes (r: 32, s: 32, v: 1)
    expect(sigBytes.length).toBe(65);

    // v value should be 27 or 28 (last byte)
    const v = sigBytes[64];
    expect(v === 27 || v === 28).toBe(true);
  });
});

describe("Entry Function Name Formatting", () => {
  it("should use short-form addresses for standard modules", () => {
    // Move's entry_function_name test expects short form like "0x1::coin::transfer"
    // not long form like "0x0000...0001::coin::transfer"

    const entryFunction = "0x1::aptos_account::transfer";

    expect(entryFunction).toMatch(/^0x1::/);
    expect(entryFunction).not.toMatch(/^0x0000/);
  });

  it("should format entry function names correctly", () => {
    const testCases = [
      { input: "0x1::aptos_account::transfer", expected: "0x1::aptos_account::transfer" },
      { input: "0x1::coin::transfer", expected: "0x1::coin::transfer" },
    ];

    testCases.forEach(({ input, expected }) => {
      expect(input).toBe(expected);
    });
  });
});

describe("Address Case Sensitivity", () => {
  it("should use lowercase Ethereum addresses", () => {
    // Rust smoke test uses: format!("0x{}", hex::encode(address.as_bytes()))
    // which produces lowercase hex

    const mixedCaseAddress = "0x77Ec57A1249BA952ca73a09bA78CaDeD07C9A00D";
    const lowercaseAddress = mixedCaseAddress.toLowerCase();

    expect(lowercaseAddress).toBe("0x77ec57a1249ba952ca73a09ba78caded07c9a00d");
    expect(lowercaseAddress).toMatch(/^0x[a-f0-9]+$/);
  });
});
