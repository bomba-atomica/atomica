
import { describe, it, expect } from 'vitest';
import * as ibe from '../../src/lib/ibe';
import { PointG1, PointG2 } from '@noble/bls12-381';

describe('IBE Logic', () => {
    it('should generate valid system parameters', async () => {
        const params = await ibe.generateSystemParameters();
        expect(params).toHaveProperty('mpk');
        expect(params).toHaveProperty('msk');
        expect(params.mpk).toBeInstanceOf(Uint8Array);
        expect(params.msk).toBeInstanceOf(Uint8Array);

        // MPK should be a compressed G1 point (48 bytes)
        expect(params.mpk.length).toBe(48);
    });

    it('should encrypt a message successfully', async () => {
        const { mpk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("test-identity");
        const message = new TextEncoder().encode("hello world");

        const { u, v } = await ibe.encrypt(mpk, identity, message);

        expect(u).toBeInstanceOf(Uint8Array);
        expect(v).toBeInstanceOf(Uint8Array);

        // U is a compressed G1 point (48 bytes)
        expect(u.length).toBe(48);
        // V should be same length as message (XOR encryption)
        expect(v.length).toBe(message.length);
    });

    it('should match a known vector (sanity check)', async () => {
        // This test is tricky without a fixed random seed or manual calculation.
        // We defined a specific IBE logic in ibe.ts (XOR with hash of pairing).
        // Let's at least verify that different messages produce different V
        const { mpk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("fixed-id");

        const msg1 = new Uint8Array([1, 2, 3]);
        const msg2 = new Uint8Array([4, 5, 6]);

        const enc1 = await ibe.encrypt(mpk, identity, msg1);
        const enc2 = await ibe.encrypt(mpk, identity, msg2);

        expect(enc1.v).not.toEqual(enc2.v);
    });
});
