import { describe, it, expect } from 'vitest';
import { TimelockCrypto } from '../../src/lib/timelock';
import goldenVectors from './ibe_golden_vectors.json';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { PointG1, PointG2, pairing } from '@noble/bls12-381';

describe('TimelockCrypto Golden Vectors', () => {
  const crypto = new TimelockCrypto();

  describe('Identity Computation', () => {
    goldenVectors.identity_vectors.forEach((vector) => {
      it(vector.description, () => {
        let tid = BigInt(vector.timelock_id);
        let deadline = BigInt(vector.deadline_us);

        // Fix JSON parsing precision loss for max u64
        if (vector.description === "Maximum u64 values") {
             tid = 18446744073709551615n;
             deadline = 18446744073709551615n;
        }

        const identity = crypto.computeIdentity(tid, deadline);
        expect(bytesToHex(identity)).toBe(vector.identity_hash_hex);
      });
    });
  });

  describe('Hash To Curve (G1)', () => {
    goldenVectors.identity_vectors.forEach((vector) => {
      it(`Hashes identity to G1: ${vector.description}`, async () => {
        const point = await crypto.hashToG1(hexToBytes(vector.identity_hash_hex));
        const hex = bytesToHex(point.toRawBytes(true));
        expect(hex).toBe(vector.h_identity_g1_hex);
      });
    });
  });

  describe('IBE Roundtrip', () => {
    goldenVectors.ibe_roundtrip_vectors.forEach((vector) => {
      it(vector.description, async () => {
        // 1. Verify Decryption with Golden Ciphertext
        const dk = PointG1.fromHex(vector.reconstructed_dk_g1_hex);
        const u = PointG2.fromHex(vector.ciphertext_u_g2_hex);
        const v = hexToBytes(vector.ciphertext_v_hex);
        const expectedPlaintext = hexToBytes(vector.plaintext_hex);

        const decrypted = await crypto.decrypt(dk, { u, v });
        expect(bytesToHex(decrypted)).toBe(vector.plaintext_hex);

        // 2. Verify Encryption produces valid ciphertext for same Identity
        // (Note: Encryption is randomized, so we can't match ciphertext bytes,
        // but we can decrypt our own ciphertext with the golden key)
        const mpk = PointG2.fromHex(vector.mpk_g2_hex);
        const identity = hexToBytes(vector.identity_hash_hex);
        
        const myCiphertext = await crypto.encrypt(mpk, identity, expectedPlaintext);
        
        // Decrypt my ciphertext with golden DK
        const myDecrypted = await crypto.decrypt(dk, myCiphertext);
        expect(bytesToHex(myDecrypted)).toBe(vector.plaintext_hex);
      });
    });
  });
});
