import { PointG1, PointG2, pairing, utils } from "@noble/bls12-381";
import { ethers } from "ethers";

// Alias for components
export { ibeEncrypt as encrypt };

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

// Hashed IBE Encrypt
// MPK: G1 Point (Compressed bytes)
// ID: Arbitrary bytes (Auction End Time for us)
// Message: Arbitrary bytes
// Returns: { u: Uint8Array, v: Uint8Array }
export async function ibeEncrypt(
  mpkBytes: Uint8Array,
  idBytes: Uint8Array,
  messageBytes: Uint8Array,
): Promise<{ u: Uint8Array; v: Uint8Array }> {
  // 1. Decode MPK (G1)
  const mpkPoint = PointG1.fromHex(mpkBytes);

  // 2. Map ID to G2
  // Use hashToCurve to map bytes to G2 point
  const idPoint = await PointG2.hashToCurve(idBytes);

  // 3. Generate Random r
  const r = utils.randomPrivateKey(); // Returns 32 bytes random scalar

  // 4. U = r * P (Base G1)
  const uPoint = PointG1.BASE.multiply(
    BigInt(ethers.hexlify(r)),
  );

  // 5. Compute Pairing Metric
  // e(MPK, ID)^r = e(r*MPK, ID)
  const rMpk = mpkPoint.multiply(BigInt(ethers.hexlify(r)));
  const gid = pairing(rMpk, idPoint); // Returns Fp12
  console.log("GID computed for encryption:", gid);

  // 6. Hash gid to bytes
  // Placeholder serialization
  const uBytes = uPoint.toRawBytes(true); // Compressed

  const vBytes = new Uint8Array(messageBytes.length);
  for (let i = 0; i < messageBytes.length; i++)
    vBytes[i] = messageBytes[i] ^ 0xff; // Simple XOR

  return { u: uBytes, v: vBytes };
}
