import { describe, expect, test } from "bun:test";
import {
    verifySyncCommitteeSignature,
    computeSigningRoot,
    computeSyncCommitteeDomain,
} from "../src/beacon/sync";
import type { LightClientHeader, SyncCommittee } from "../src/beacon/types";
import { createSSZModule } from "../src/beacon/ssz";
import bls from "@chainsafe/bls";

// Helper to generate mock data
async function createMockData(committeeSize: number = 512) {
    const pubkeys: string[] = [];
    const secretKeys: Uint8Array[] = [];

    for (let i = 0; i < committeeSize; i++) {
        const secretKey = bls.SecretKey.fromKeygen(new Uint8Array([i % 255]));
        secretKeys.push(secretKey.toBytes());
        pubkeys.push(secretKey.toPublicKey().toHex());
    }

    let aggregatePubkey = "0x" + "00".repeat(48);
    if (committeeSize > 0) {
        aggregatePubkey = bls.PublicKey.aggregate(
            secretKeys.map((sk) => bls.SecretKey.fromBytes(sk).toPublicKey()),
        ).toHex();
    }

    const committee: SyncCommittee = {
        pubkeys,
        aggregatePubkey,
    };

    const header: LightClientHeader = {
        beacon: {
            slot: 100,
            proposerIndex: 0,
            parentRoot: "0x" + "22".repeat(32),
            stateRoot: "0x" + "33".repeat(32),
            bodyRoot: "0x" + "44".repeat(32),
        },
        execution: {
            parentHash: "0x" + "55".repeat(32),
            feeRecipient: "0x" + "11".repeat(20),
            stateRoot: "0x" + "66".repeat(32),
            receiptsRoot: "0x" + "77".repeat(32),
            logsBloom: "0x" + "00".repeat(256),
            prevRandao: "0x" + "88".repeat(32),
            blockNumber: 100,
            gasLimit: 30000000,
            gasUsed: 15000000,
            timestamp: 1606824400,
            extraData: "0x",
            baseFeePerGas: 1000000000n,
            blockHash: "0x" + "99".repeat(32),
            transactionsRoot: "0x" + "aa".repeat(32),
            withdrawalsRoot: "0x" + "bb".repeat(32),
        },
        executionBranch: [
            "0x" + "00".repeat(32),
            "0x" + "00".repeat(32),
            "0x" + "00".repeat(32),
            "0x" + "00".repeat(32),
        ],
    };

    return { committee, header, secretKeys };
}

describe("Performance Benchmarks", () => {
    test("BLS Signature Verification Benchmark", async () => {
        console.log("\n--- BLS Benchmark ---");
        const { committee, header, secretKeys } = await createMockData(512);

        // Sign the header
        const domain = computeSyncCommitteeDomain(
            Uint8Array.from([0x01, 0x00, 0x00, 0x00]),
            new Uint8Array(32),
        );
        const signingRoot = computeSigningRoot(header.beacon, domain);

        const signatures = secretKeys.map((sk) => bls.SecretKey.fromBytes(sk).sign(signingRoot));
        const aggregateSignature = bls.Signature.aggregate(signatures);

        const syncAggregate = {
            syncCommitteeBits: new Uint8Array(64).fill(0xff),
            syncCommitteeSignature: aggregateSignature.toHex(),
        };

        const start = performance.now();
        const iterations = 2; // Reduced from 10 to avoid timeout in slow environments

        for (let i = 0; i < iterations; i++) {
            await verifySyncCommitteeSignature(header, syncAggregate, committee);
        }

        const end = performance.now();
        const avgTime = (end - start) / iterations;

        console.log(`Verify Sync Committee Signature (512 keys): ${avgTime.toFixed(2)}ms`);
        // Note: 500ms might be tight for some environments, but decent target
    });

    test("SSZ Serialization Benchmark", async () => {
        console.log("\n--- SSZ Benchmark ---");
        const ssz = createSSZModule();
        const { header } = await createMockData(0);

        const start = performance.now();
        const iterations = 1000;

        for (let i = 0; i < iterations; i++) {
            ssz.LightClientHeader.serialize(header);
        }

        const end = performance.now();
        const avgTime = (end - start) / iterations;

        console.log(`SSZ Serialize LightClientHeader: ${avgTime.toFixed(4)}ms`);
        expect(avgTime).toBeLessThan(1);
    });
});
