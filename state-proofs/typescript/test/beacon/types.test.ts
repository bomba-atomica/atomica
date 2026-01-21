import { describe, expect, test } from "bun:test";
import type { LightClientUpdate, SyncCommittee, LightClientHeader } from "../../dist/beacon/types";
import { hexToBytes, bytesToHex } from "../../dist/beacon/types";
import { computeSyncCommitteePeriod, BEACON_CONFIGS } from "../../dist/beacon/fetch";

describe("Beacon Types", () => {
    describe("hexToBytes", () => {
        test("should convert hex string to Uint8Array", () => {
            const hex = "0x1234567890abcdef";
            const bytes = hexToBytes(hex);
            expect(bytes.length).toBe(8);
            expect(bytes[0]).toBe(0x12);
            expect(bytes[7]).toBe(0xef);
        });

        test("should handle hex without 0x prefix", () => {
            const hex = "deadbeef";
            const bytes = hexToBytes(hex);
            expect(bytes.length).toBe(4);
            expect(bytes[0]).toBe(0xde);
            expect(bytes[3]).toBe(0xef);
        });

        test("should handle empty hex", () => {
            const bytes = hexToBytes("0x");
            expect(bytes.length).toBe(0);
        });
    });

    describe("bytesToHex", () => {
        test("should convert Uint8Array to hex string", () => {
            const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef]);
            const hex = bytesToHex(bytes);
            expect(hex).toBe("0x1234567890abcdef");
        });
    });

    describe("computeSyncCommitteePeriod", () => {
        test("should compute correct period for genesis slot", () => {
            const period = computeSyncCommitteePeriod(0, BEACON_CONFIGS.mainnet);
            expect(period).toBe(0);
        });

        test("should compute correct period for slot at period boundary", () => {
            const slotsPerPeriod =
                BEACON_CONFIGS.mainnet.epochsPerSyncCommitteePeriod *
                BEACON_CONFIGS.mainnet.slotsPerEpoch;
            const period = computeSyncCommitteePeriod(slotsPerPeriod, BEACON_CONFIGS.mainnet);
            expect(period).toBe(1);
        });
    });
});

describe("Light Client State Types", () => {
    test("should create valid LightClientHeader", () => {
        const header: LightClientHeader = {
            beacon: {
                slot: 100,
                proposerIndex: 5,
                parentRoot: "0x" + "00".repeat(32),
                stateRoot: "0x" + "11".repeat(32),
                bodyRoot: "0x" + "22".repeat(32),
            },
            execution: {
                parentHash: "0x" + "33".repeat(32),
                feeRecipient: "0x" + "44".repeat(20),
                stateRoot: "0x" + "55".repeat(32),
                receiptsRoot: "0x" + "66".repeat(32),
                logsBloom: "0x" + "00".repeat(256),
                prevRandao: "0x" + "77".repeat(32),
                blockNumber: 100,
                gasLimit: 30000000,
                gasUsed: 15000000,
                timestamp: 1606824400,
                extraData: "0x",
                baseFeePerGas: 1000000000n,
                blockHash: "0x" + "88".repeat(32),
                transactionsRoot: "0x" + "99".repeat(32),
                withdrawalsRoot: "0x" + "aa".repeat(32),
            },
            executionBranch: [],
        };

        expect(header.beacon.slot).toBe(100);
        expect(header.execution.blockNumber).toBe(100);
    });

    test("should create valid SyncCommittee", () => {
        const pubkeys = Array(512)
            .fill(null)
            .map((_, i) => "0x" + (i + 1).toString(16).padStart(96, "0"));
        const committee: SyncCommittee = {
            pubkeys,
            aggregatePubkey: "0x" + "bb".repeat(48),
        };

        expect(committee.pubkeys.length).toBe(512);
    });
});
