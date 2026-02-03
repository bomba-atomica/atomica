import { sha3_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes } from '@noble/hashes/utils';
import { PointG1, PointG2, pairing, utils as blsUtils } from '@noble/bls12-381';

export const IBE_IDENTITY_DST = "APTOS_IBE_IDENTITY_DST";
export const IBE_KEY_DERIVATION_DST = new TextEncoder().encode("APTOS_IBE_KEY_DERIVATION_DST");
export const H_TO_CURVE_AUG = new TextEncoder().encode("H(id)");

export interface Ciphertext {
    u: PointG2;
    v: Uint8Array;
}

export class TimelockCrypto {
    
    /**
     * Computes the IBE identity for a timelock.
     * identity = SHA3-256(DST || LE_U64(timelock_id) || LE_U64(deadline_us))
     */
    computeIdentity(timelockId: bigint, deadlineUs: bigint): Uint8Array {
        const hasher = sha3_256.create();
        hasher.update(new TextEncoder().encode(IBE_IDENTITY_DST));
        hasher.update(this.u64LE(timelockId));
        hasher.update(this.u64LE(deadlineUs));
        return hasher.digest();
    }

    /**
     * Hashes identity to G1 curve point using "Augmented" hash-to-curve.
     * Input = "H(id)" || identity
     */
    async hashToG1(identity: Uint8Array): Promise<PointG1> {
        const msg = concatBytes(H_TO_CURVE_AUG, identity);
        return PointG1.hashToCurve(msg, { DST: IBE_IDENTITY_DST });
    }

    /**
     * Encrypts a message for an identity.
     */
    async encrypt(mpk: PointG2, identity: Uint8Array, message: Uint8Array): Promise<Ciphertext> {
        const qId = await this.hashToG1(identity);
        const r = blsUtils.randomPrivateKey(); // Returns 32 bytes random scalar
        
        // U = r * G2_Generator (We need G2 generator)
        // Note: noble-bls12-381 G2.BASE is generator
        const rBig = BigInt("0x" + bytesToHex(r)); // Convert bytes to bigint
        const u = PointG2.BASE.multiply(rBig);
        
        // Pairing: e(Q_id, MPK)^r = e(r * Q_id, MPK)
        // Optimization: multiply in G1 is cheaper
        const rQId = qId.multiply(rBig);
        const gid = pairing(rQId, mpk); // Pairing(G1, G2)
        
        const key = this.deriveKey(gid, message.length);
        const v = this.xor(message, key);
        
        return { u, v };
    }

    /**
     * Decrypts a ciphertext using a decryption key (G1).
     */
    async decrypt(dk: PointG1, ciphertext: Ciphertext): Promise<Uint8Array> {
        // Pairing: e(dk, u)
        const gid = pairing(dk, ciphertext.u);
        const key = this.deriveKey(gid, ciphertext.v.length);
        return this.xor(ciphertext.v, key);
    }

    /**
     * Derives a symmetric key stream from a pairing result (Gt).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private deriveKey(gt: any, length: number): Uint8Array {
        const gtBytes = this.serializeGt(gt);
        const keyStream = new Uint8Array(length);
        const blocksNeeded = Math.ceil(length / 32);

        for (let i = 0; i < blocksNeeded; i++) {
            const hasher = sha3_256.create();
            hasher.update(IBE_KEY_DERIVATION_DST);
            hasher.update(gtBytes);
            
            // Counter (u32 LE)
            const counterBuf = new Uint8Array(4);
            new DataView(counterBuf.buffer).setUint32(0, i, true);
            hasher.update(counterBuf);
            
            const block = hasher.digest();
            
            // Copy block to keyStream
            const start = i * 32;
            const end = Math.min(start + 32, length);
            keyStream.set(block.slice(0, end - start), start);
        }
        
        return keyStream;
    }

    /**
     * Serializes Gt (Fp12) to 576 bytes (Little Endian).
     * Structure: 12 coefficients of 48 bytes each.
     * Order: Recursive traversal (c0 -> c1).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private serializeGt(gt: any): Uint8Array {
        const coeffs: bigint[] = [];
        const fp12 = [gt.c0, gt.c1];
        
        for (const fp6 of fp12) {
            const fp6_arr = [fp6.c0, fp6.c1, fp6.c2];
            for (const fp2 of fp6_arr) {
                const fp2_arr = [fp2.c0, fp2.c1];
                for (const fp of fp2_arr) {
                    coeffs.push(fp.value || fp);
                }
            }
        }

        const buf = new Uint8Array(12 * 48);
        for (let i = 0; i < 12; i++) {
            buf.set(this.toLE(coeffs[i], 48), i * 48);
        }
        return buf;
    }

    private u64LE(val: bigint): Uint8Array {
        return this.toLE(val, 8);
    }

    private toLE(val: bigint, bytes: number): Uint8Array {
        const b = new Uint8Array(bytes);
        for (let i = 0; i < bytes; i++) {
            b[i] = Number(val & 0xffn);
            val >>= 8n;
        }
        return b;
    }

    private xor(a: Uint8Array, b: Uint8Array): Uint8Array {
        const res = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) {
            res[i] = a[i] ^ b[i];
        }
        return res;
    }
}
