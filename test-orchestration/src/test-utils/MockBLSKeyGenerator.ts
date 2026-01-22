import { ethers } from 'ethers';
import { ValidatorKeyPair, ValidatorSet } from './Types';

const CURVE_ORDER = BigInt('0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001');

export class MockBLSKeyGenerator {
  private privateKeys: Uint8Array[] = [];
  private publicKeys: Uint8Array[] = [];

  generateKeyPair(seed?: bigint): ValidatorKeyPair {
    const privateKey = this.derivePrivateKey(seed);
    const publicKey = this.derivePublicKey(privateKey);
    
    this.privateKeys.push(privateKey);
    this.publicKeys.push(publicKey);
    
    return { privateKey, publicKey };
  }

  generateValidatorSet(count: number, startSeed: bigint = 1n): ValidatorSet {
    const privateKeys: Uint8Array[] = [];
    const publicKeys: Uint8Array[] = [];
    
    for (let i = 0; i < count; i++) {
      const seed = startSeed + BigInt(i);
      const { privateKey, publicKey } = this.generateKeyPair(seed);
      privateKeys.push(privateKey);
      publicKeys.push(publicKey);
    }
    
    return { privateKeys, publicKeys };
  }

  sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
    const msgHash = ethers.keccak256(message);
    const hashBytes = ethers.getBytes(msgHash);
    return this.blsSignG1(privateKey, hashBytes);
  }

  aggregateSignatures(signatures: Uint8Array[]): Uint8Array {
    if (signatures.length === 0) {
      return new Uint8Array(48);
    }
    return signatures.reduce((agg, sig) => this.addG1Points(agg, sig), new Uint8Array(48));
  }

  getValidatorKeys(): ValidatorSet {
    return {
      privateKeys: [...this.privateKeys],
      publicKeys: [...this.publicKeys],
    };
  }

  getPublicKeyCount(): number {
    return this.publicKeys.length;
  }

  reset(): void {
    this.privateKeys = [];
    this.publicKeys = [];
  }

  private derivePrivateKey(seed?: bigint): Uint8Array {
    const seedValue = seed ?? BigInt(Date.now());
    const seedBytes = new Uint8Array(32);
    const seedStr = seedValue.toString(16).padStart(64, '0');
    
    for (let i = 0; i < 32; i++) {
      seedBytes[i] = parseInt(seedStr.slice(i * 2, i * 2 + 2), 16);
    }

    let privateKey = BigInt(0);
    const hash = ethers.keccak256(seedBytes);
    const hashBytes = ethers.getBytes(hash);
    
    for (const byte of hashBytes) {
      privateKey = (privateKey << 8n) + BigInt(byte);
    }

    privateKey = privateKey % CURVE_ORDER;
    if (privateKey === 0n) {
      privateKey = 1n;
    }

    const keyBytes = new Uint8Array(32);
    for (let i = 31; i >= 0; i--) {
      keyBytes[i] = Number(privateKey & 0xFFn);
      privateKey >>= 8n;
    }
    
    return keyBytes;
  }

  private derivePublicKey(privateKey: Uint8Array): Uint8Array {
    const xBytes = new Uint8Array(48);
    const yBytes = new Uint8Array(48);
    
    let x = BigInt(0);
    let y = BigInt(0);
    
    for (let i = 0; i < 32; i++) {
      x = (x << 8n) + BigInt(privateKey[i]);
    }

    const generatorX = 0x0000000000000000000000000000000000000000000000000000000000000001n;
    const generatorY = 0x0000000000000000000000000000000000000000000000000000000000000002n;

    const result = this.g1Mul(generatorX, generatorY, x);
    x = result.x;
    y = result.y;

    const xHex = x.toString(16).padStart(96, '0');
    const yHex = y.toString(16).padStart(96, '0');
    
    for (let i = 0; i < 48; i++) {
      xBytes[i] = parseInt(xHex.slice(i * 2, i * 2 + 2), 16);
      yBytes[i] = parseInt(yHex.slice(i * 2, i * 2 + 2), 16);
    }

    const compressed = this.compressG2Point(xBytes, yBytes);
    return compressed;
  }

  private g1Mul(
    x: bigint,
    y: bigint,
    scalar: bigint
  ): { x: bigint; y: bigint } {
    let resultX = 0n;
    let resultY = 0n;
    let baseX = x;
    let baseY = y;
    let exp = scalar;

    while (exp > 0n) {
      if (exp & 1n) {
        const sum = this.g1Add(resultX, resultY, baseX, baseY);
        resultX = sum.x;
        resultY = sum.y;
      }
      const dbl = this.g1Double(baseX, baseY);
      baseX = dbl.x;
      baseY = dbl.y;
      exp >>= 1n;
    }

    return { x: resultX, y: resultY };
  }

  private g1Add(
    x1: bigint,
    y1: bigint,
    x2: bigint,
    y2: bigint
  ): { x: bigint; y: bigint } {
    if (x1 === 0n && y1 === 0n) return { x: x2, y: y2 };
    if (x2 === 0n && y2 === 0n) return { x: x1, y: y1 };
    if (x1 === x2) {
      if (y1 === y2) {
        return this.g1Double(x1, y1);
      }
      return { x: 0n, y: 0n };
    }

    const MODULUS = CURVE_ORDER;
    const lambda = ((y2 - y1 + MODULUS) % MODULUS) * 
                   this.modInv((x2 - x1 + MODULUS) % MODULUS, MODULUS) % MODULUS;
    const x3 = (lambda * lambda - x1 - x2 + 2n * MODULUS) % MODULUS;
    const y3 = (lambda * (x1 - x3) - y1 + MODULUS) % MODULUS;

    return { x: x3, y: y3 };
  }

  private g1Double(x: bigint, y: bigint): { x: bigint; y: bigint } {
    const MODULUS = CURVE_ORDER;
    const THREE_X_SQUARED = (3n * this.modMul(x, x, MODULUS)) % MODULUS;
    const lambda = THREE_X_SQUARED * this.modInv(2n * y % MODULUS, MODULUS) % MODULUS;
    const x3 = (lambda * lambda - 2n * x + MODULUS) % MODULUS;
    const y3 = (lambda * (x - x3) - y + MODULUS) % MODULUS;

    return { x: x3, y: y3 };
  }

  private modMul(a: bigint, b: bigint, mod: bigint): bigint {
    return (a * b) % mod;
  }

  private modInv(a: bigint, mod: bigint): bigint {
    if (a === 0n) return 0n;
    let [old_r, r] = [a, mod];
    let [old_s, s] = [1n, 0n];

    while (r !== 0n) {
      const quotient = old_r / r;
      [old_r, r] = [r, old_r - quotient * r];
      [old_s, s] = [s, old_s - quotient * s];
    }

    return (old_s + mod) % mod;
  }

  private blsSignG1(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
    let x = BigInt(0);
    for (const byte of privateKey) {
      x = (x << 8n) + BigInt(byte);
    }

    const msgHash = ethers.keccak256(message);
    const hashBytes = ethers.getBytes(msgHash);
    let msgVal = BigInt(0);
    for (const byte of hashBytes) {
      msgVal = (msgVal << 8n) + BigInt(byte);
    }
    msgVal = msgVal % CURVE_ORDER;

    const generatorY = 0x0000000000000000000000000000000000000000000000000000000000000002n;
    const result = this.g1Mul(1n, generatorY, msgVal);

    const xHex = result.x.toString(16).padStart(96, '0');
    const yHex = result.y.toString(16).padStart(96, '0');
    
    const sigBytes = new Uint8Array(48);
    for (let i = 0; i < 48; i++) {
      sigBytes[i] = parseInt(xHex.slice(i * 2, i * 2 + 2), 16);
    }

    return sigBytes;
  }

  private addG1Points(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(48);
    for (let i = 0; i < 48; i++) {
      result[i] = (a[i] + b[i]) % 256;
    }
    return result;
  }

  private compressG2Point(x: Uint8Array, y: Uint8Array): Uint8Array {
    const compressed = new Uint8Array(48);
    const yLastBit = y[47] >> 7;
    
    for (let i = 0; i < 48; i++) {
      compressed[i] = x[i];
    }
    compressed[0] = (compressed[0] & 0x7F) | (yLastBit << 7);
    
    return compressed;
  }
}
