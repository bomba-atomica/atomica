import { PointG1, PointG2, Fp12, pairing, utils } from "@noble/bls12-381";
import { ethers } from "ethers";

// Aliases for components
export { ibeEncrypt as encrypt };
export { ibeDecrypt as decrypt };

/**
 * Generate IBE system parameters (master public key and master secret key).
 *
 * - msk: random scalar in Fr
 * - mpk: msk * G1 (compressed G1 point, 48 bytes)
 */
export async function generateSystemParameters(): Promise<{
    mpk: Uint8Array;
    msk: Uint8Array;
}> {
    const msk = utils.randomPrivateKey();
    const mskBig = BigInt(ethers.hexlify(msk));
    const mpkPoint = PointG1.BASE.multiply(mskBig);
    return {
        mpk: mpkPoint.toRawBytes(true),
        msk: msk,
    };
}

/**
 * Extract a private key for a given identity using the master secret key.
 *
 * sk_id = msk * H2(id), where H2 maps the identity to a G2 point.
 *
 * Returns the compressed G2 point (96 bytes).
 */
export async function extractPrivateKey(msk: Uint8Array, idBytes: Uint8Array): Promise<Uint8Array> {
    const mskBig = BigInt(ethers.hexlify(msk));
    const idPoint = await PointG2.hashToCurve(idBytes);
    const skPoint = idPoint.multiply(mskBig);
    return skPoint.toRawBytes(true); // Compressed G2 (96 bytes)
}

/**
 * Derive a symmetric key from an Fp12 pairing result using SHA-256.
 *
 * The Fp12 element is serialized to bytes, then hashed with SHA-256 to produce
 * a 32-byte key. The key stream is repeated as needed to match the message length.
 */
async function deriveKeyStream(gid: Fp12, length: number): Promise<Uint8Array> {
    const gidBytes = gid.toBytes();
    // Hash with SHA-256 to get a 32-byte base key
    const baseKey = await utils.sha256(gidBytes);

    if (length <= 32) {
        return baseKey.slice(0, length);
    }

    // For longer messages, use counter-mode key derivation:
    // key_i = SHA-256(baseKey || i) for block i
    const keyStream = new Uint8Array(length);
    let offset = 0;
    let counter = 0;
    while (offset < length) {
        const counterBytes = new Uint8Array(4);
        counterBytes[0] = (counter >> 24) & 0xff;
        counterBytes[1] = (counter >> 16) & 0xff;
        counterBytes[2] = (counter >> 8) & 0xff;
        counterBytes[3] = counter & 0xff;

        const block = new Uint8Array(baseKey.length + 4);
        block.set(baseKey, 0);
        block.set(counterBytes, baseKey.length);

        const derived = await utils.sha256(block);
        const toCopy = Math.min(32, length - offset);
        keyStream.set(derived.slice(0, toCopy), offset);
        offset += toCopy;
        counter++;
    }
    return keyStream;
}

/**
 * Boneh-Franklin Hashed IBE Encrypt.
 *
 * Given a master public key (compressed G1), an identity (arbitrary bytes),
 * and a plaintext message, produces a ciphertext { u, v } where:
 *
 *   - u = r * G1            (ephemeral public component, compressed G1 point)
 *   - v = message XOR H(gid) where gid = e(r * MPK, H2(id))
 *
 * The pairing result gid is hashed with SHA-256 to derive the symmetric key.
 */
export async function ibeEncrypt(
    mpkBytes: Uint8Array,
    idBytes: Uint8Array,
    messageBytes: Uint8Array,
): Promise<{ u: Uint8Array; v: Uint8Array }> {
    // 1. Decode MPK (G1)
    const mpkPoint = PointG1.fromHex(mpkBytes);

    // 2. Map ID to G2 via hash-to-curve
    const idPoint = await PointG2.hashToCurve(idBytes);

    // 3. Generate random scalar r
    const r = utils.randomPrivateKey();
    const rBig = BigInt(ethers.hexlify(r));

    // 4. U = r * G1 (base point)
    const uPoint = PointG1.BASE.multiply(rBig);

    // 5. Compute pairing: gid = e(r * MPK, H2(id))
    const rMpk = mpkPoint.multiply(rBig);
    const gid = pairing(rMpk, idPoint);

    // 6. Derive symmetric key from gid via SHA-256
    const keyStream = await deriveKeyStream(gid, messageBytes.length);

    // 7. V = message XOR keyStream
    const uBytes = uPoint.toRawBytes(true);
    const vBytes = new Uint8Array(messageBytes.length);
    for (let i = 0; i < messageBytes.length; i++) {
        vBytes[i] = messageBytes[i] ^ keyStream[i];
    }

    return { u: uBytes, v: vBytes };
}

/**
 * Boneh-Franklin Hashed IBE Decrypt.
 *
 * Given a private key for the identity (sk_id = msk * H2(id), compressed G2),
 * and a ciphertext { u, v }, recovers the plaintext:
 *
 *   gid = e(U, sk_id)
 *   key = H(gid)
 *   message = v XOR key
 *
 * This works because:
 *   e(U, sk_id) = e(r*G1, msk*H2(id)) = e(G1, H2(id))^(r*msk)
 * which equals the encryption pairing:
 *   e(r*MPK, H2(id)) = e(r*msk*G1, H2(id)) = e(G1, H2(id))^(r*msk)
 */
export async function ibeDecrypt(
    privateKeyBytes: Uint8Array,
    u: Uint8Array,
    v: Uint8Array,
): Promise<Uint8Array> {
    // 1. Decode U (compressed G1 point)
    const uPoint = PointG1.fromHex(u);

    // 2. Decode private key (compressed G2 point)
    const skPoint = PointG2.fromHex(privateKeyBytes);

    // 3. Compute pairing: gid = e(U, sk_id)
    const gid = pairing(uPoint, skPoint);

    // 4. Derive symmetric key from gid via SHA-256
    const keyStream = await deriveKeyStream(gid, v.length);

    // 5. Plaintext = v XOR keyStream
    const plaintext = new Uint8Array(v.length);
    for (let i = 0; i < v.length; i++) {
        plaintext[i] = v[i] ^ keyStream[i];
    }

    return plaintext;
}
