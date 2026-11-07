import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  SIWEAccountAuthenticator,
  serializeSIWEAbstractPublicKey,
  serializeSIWEAbstractSignature,
} from "../src/siwe";
import { Serializer } from "@aptos-labs/ts-sdk";
import goldenVectors from "./fixtures/golden_vectors.json";

describe("Authenticator Serialization", () => {
  describe("Golden Vector Correctness", () => {
    it("should match rust-generated BCS for SIWEAbstractPublicKey", () => {
      // ethereum_derivable_account.move reads the address as the utf8 bytes
      // of the 0x-prefixed hex string, which is what getDerivedAddress passes.
      expect(goldenVectors.abstract_public_key.length).toBeGreaterThan(0);
      for (const testCase of goldenVectors.abstract_public_key) {
        const { ethereum_address, domain } = testCase.input;
        const bytes = serializeSIWEAbstractPublicKey(
          new TextEncoder().encode(ethereum_address),
          domain,
        );
        expect(ethers.hexlify(bytes).substring(2)).toBe(testCase.bcs_hex);
      }
    });

    it("should match rust-generated BCS for SIWEAbstractSignature", () => {
      for (const testCase of goldenVectors.abstract_signature) {
        if (testCase.name === "MessageV2 Standard") {
          const input = testCase.input;
          const signature = ethers.getBytes(input.signature);

          // Prepare the abstract signature using the helper
          const abstractSignatureBytes = serializeSIWEAbstractSignature(
            input.scheme || "",
            input.issued_at || "",
            signature,
          );

          // Authenticator requires digest and identity, we just use dummies
          const dummyDigest = new Uint8Array(32);
          const dummyIdentity = new Uint8Array(20); // Not a real serialized identity, but verified length doesn't matter for this specific check

          const auth = new SIWEAccountAuthenticator(
            dummyDigest,
            abstractSignatureBytes,
            dummyIdentity,
          );

          const serializer = new Serializer();
          auth.serialize(serializer);
          const fullBcs = serializer.toUint8Array();
          const fullHex = ethers.hexlify(fullBcs).substring(2); // Remove 0x

          // The Authenticator BCS contains:
          // ...
          // [AbstractSignature Bytes (length prefixed)]
          // ...
          // The golden vector 'bcs_hex' is the content of the AbstractSignature struct.
          // Since it's serialized as bytes, it should be present in the stream.

          expect(fullHex).toContain(testCase.bcs_hex);
        }
      }
    });

    it("should serialize SIWEAbstractSignature correctly using helper", () => {
      // Direct test of the helper against golden vector
      for (const testCase of goldenVectors.abstract_signature) {
        if (testCase.name === "MessageV2 Standard") {
          const input = testCase.input;
          const signature = ethers.getBytes(input.signature);

          const abstractSignatureBytes = serializeSIWEAbstractSignature(
            input.scheme || "",
            input.issued_at || "",
            signature,
          );

          const hex = ethers.hexlify(abstractSignatureBytes).substring(2);
          expect(hex).toBe(testCase.bcs_hex);
        }
      }
    });
  });
});
