import { describe, it, expect } from "vitest";
import * as ibe from "../src/ibe";

describe("IBE Logic", () => {
    it("should generate valid system parameters", async () => {
        const params = await ibe.generateSystemParameters();
        expect(params).toHaveProperty("mpk");
        expect(params).toHaveProperty("msk");
        expect(params.mpk).toBeInstanceOf(Uint8Array);
        expect(params.msk).toBeInstanceOf(Uint8Array);

        // MPK should be a compressed G1 point (48 bytes)
        expect(params.mpk.length).toBe(48);
    });

    it("should encrypt a message successfully", async () => {
        const { mpk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("test-identity");
        const message = new TextEncoder().encode("hello world");

        const { u, v } = await ibe.encrypt(mpk, identity, message);

        expect(u).toBeInstanceOf(Uint8Array);
        expect(v).toBeInstanceOf(Uint8Array);

        // U is a compressed G1 point (48 bytes)
        expect(u.length).toBe(48);
        // V should be same length as message
        expect(v.length).toBe(message.length);
    });

    it("should extract a private key for an identity", async () => {
        const { msk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("test-identity");

        const sk = await ibe.extractPrivateKey(msk, identity);

        expect(sk).toBeInstanceOf(Uint8Array);
        // Compressed G2 point is 96 bytes
        expect(sk.length).toBe(96);
    });

    it("should round-trip encrypt then decrypt", async () => {
        const { mpk, msk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("auction-end-12345");
        const message = new TextEncoder().encode("hello world");

        // Encrypt
        const { u, v } = await ibe.encrypt(mpk, identity, message);

        // Extract private key for the identity
        const sk = await ibe.extractPrivateKey(msk, identity);

        // Decrypt
        const plaintext = await ibe.decrypt(sk, u, v);

        expect(plaintext).toEqual(message);
    });

    it("should fail to decrypt with wrong identity key", async () => {
        const { mpk, msk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("correct-identity");
        const wrongIdentity = new TextEncoder().encode("wrong-identity");
        const message = new TextEncoder().encode("secret bid: 100");

        // Encrypt for the correct identity
        const { u, v } = await ibe.encrypt(mpk, identity, message);

        // Extract private key for the WRONG identity
        const wrongSk = await ibe.extractPrivateKey(msk, wrongIdentity);

        // Decrypt with wrong key should produce garbage
        const plaintext = await ibe.decrypt(wrongSk, u, v);
        expect(plaintext).not.toEqual(message);
    });

    it("should produce different ciphertexts for same message (non-deterministic)", async () => {
        const { mpk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("fixed-id");
        const message = new TextEncoder().encode("same message");

        const enc1 = await ibe.encrypt(mpk, identity, message);
        const enc2 = await ibe.encrypt(mpk, identity, message);

        // Different random r means different U values
        expect(enc1.u).not.toEqual(enc2.u);
        // And consequently different V values
        expect(enc1.v).not.toEqual(enc2.v);
    });

    it("should produce different ciphertexts for different identities", async () => {
        const { mpk } = await ibe.generateSystemParameters();
        const id1 = new TextEncoder().encode("identity-1");
        const id2 = new TextEncoder().encode("identity-2");
        const message = new TextEncoder().encode("same message");

        const enc1 = await ibe.encrypt(mpk, id1, message);
        const enc2 = await ibe.encrypt(mpk, id2, message);

        // Different identities produce different V (even if U could coincide by
        // astronomical chance, the pairing differs so V differs)
        expect(enc1.v).not.toEqual(enc2.v);
    });

    it("should round-trip an empty message", async () => {
        const { mpk, msk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("empty-test");
        const message = new Uint8Array(0);

        const { u, v } = await ibe.encrypt(mpk, identity, message);
        const sk = await ibe.extractPrivateKey(msk, identity);
        const plaintext = await ibe.decrypt(sk, u, v);

        expect(plaintext).toEqual(message);
        expect(v.length).toBe(0);
    });

    it("should round-trip a large message (1KB+)", async () => {
        const { mpk, msk } = await ibe.generateSystemParameters();
        const identity = new TextEncoder().encode("large-message-test");

        // Generate a 1KB message
        const message = new Uint8Array(1024);
        for (let i = 0; i < message.length; i++) {
            message[i] = i % 256;
        }

        const { u, v } = await ibe.encrypt(mpk, identity, message);
        expect(v.length).toBe(1024);

        const sk = await ibe.extractPrivateKey(msk, identity);
        const plaintext = await ibe.decrypt(sk, u, v);

        expect(plaintext).toEqual(message);
    });
});
