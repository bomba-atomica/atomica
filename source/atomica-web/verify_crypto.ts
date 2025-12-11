
import { computeFaucetDigest, computeCreateAuctionDigest, computeBidDigest } from './src/lib/aptos';
import { ibeEncrypt } from './src/lib/ibe';
import { ethers } from 'ethers';
import { PointG1 } from '@noble/bls12-381';

// Mock Constants
const NONCE = 123;
const ETH_ADDRESS = "0x1234567890123456789012345678901234567890";
const MPK_HEX = PointG1.BASE.toHex(true);

async function runTests() {
    console.log("Running Crypto Verification...");

    // 1. Faucet Digest
    try {
        const faucetDigest = computeFaucetDigest(NONCE);
        console.log("Faucet Digest (Hex):", ethers.hexlify(faucetDigest));
        if (faucetDigest.length !== 32) throw new Error("Faucet digest wrong length");
        console.log("PASS: Faucet Digest");
    } catch (e) {
        console.error("FAIL: Faucet Digest", e);
    }

    // 2. Create Auction Digest
    try {
        const createDigest = computeCreateAuctionDigest(
            NONCE,
            100n,
            500n,
            600n,
            ethers.getBytes("0x" + MPK_HEX)
        );
        console.log("Create Auction Digest (Hex):", ethers.hexlify(createDigest));
        if (createDigest.length !== 32) throw new Error("Create Auction digest wrong length");
        console.log("PASS: Create Auction Digest");
    } catch (e) {
        console.error("FAIL: Create Auction Digest", e);
    }

    // 3. IBE Encryption (Sanity Check)
    try {
        const idBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const msgBytes = new Uint8Array([0xAA, 0xBB]);
        const { u, v } = await ibeEncrypt(
            ethers.getBytes("0x" + MPK_HEX),
            idBytes,
            msgBytes
        );
        console.log("IBE U (Hex):", ethers.hexlify(u));
        console.log("IBE V (Hex):", ethers.hexlify(v));

        if (v.length !== msgBytes.length) throw new Error("V length mismatch");
        console.log("PASS: IBE Encrypt");
    } catch (e) {
        console.error("FAIL: IBE Encrypt", e);
    }
}

runTests();
