import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import type {
    LightClientState,
    LightClientUpdate,
    SyncCommittee,
    LightClientStore,
} from "../../dist/beacon/types";
import {
    createInitialState,
    updateState,
    isUpdateNewer,
    transitionPeriod,
    serializeState,
    deserializeState,
    saveState,
    loadState,
    clearState,
    _getStatePath,
} from "../../dist/beacon/state";
import { promises as fs } from "fs";
import * as _path from "path";

const createMockHeader = (slot: number) => ({
    beacon: {
        slot,
        proposerIndex: 0,
        parentRoot: "0x" + "22".repeat(32),
        stateRoot: "0x" + "33".repeat(32),
        bodyRoot: "0x" + "44".repeat(32),
    },
    execution: {
        parentHash: "0x" + "55".repeat(32),
        feeRecipient: "0x" + "11".repeat(20),
        stateRoot: "0x" + (slot + 100).toString(16).padStart(64, "0"),
        receiptsRoot: "0x" + "66".repeat(32),
        logsBloom: "0x" + "00".repeat(256),
        prevRandao: "0x" + "77".repeat(32),
        blockNumber: slot,
        gasLimit: 30000000,
        gasUsed: 15000000,
        timestamp: 1606824400 + slot * 12,
        extraData: "0x",
        baseFeePerGas: 1000000000n,
        blockHash: "0x" + "88".repeat(32),
        transactionsRoot: "0x" + "99".repeat(32),
        withdrawalsRoot: "0x" + "aa".repeat(32),
    },
    executionBranch: [],
});

const createMockSyncCommittee = (period: number): SyncCommittee => ({
    pubkeys: Array(512)
        .fill(null)
        .map((_, i) => "0x" + (i + period * 1000).toString(16).padStart(96, "0")),
    aggregatePubkey: "0x" + "bb".repeat(48),
});

const createMockUpdate = (slot: number): LightClientUpdate => ({
    attestedHeader: createMockHeader(slot),
    nextSyncCommittee: createMockSyncCommittee(Math.floor(slot / (256 * 32)) + 1),
    nextSyncCommitteeBranch: [],
    finalizedHeader: null,
    finalityBranch: [],
    syncAggregate: {
        syncCommitteeBits: new Uint8Array(64).fill(0xff),
        syncCommitteeSignature: "0x" + "cc".repeat(96),
    },
    signatureSlot: slot + 1,
});

const testStatePath = "/tmp/atomica-test-light-client-state.json";

describe("Light Client State", () => {
    beforeAll(async () => {
        try {
            await fs.unlink(testStatePath);
        } catch {
            // Ignore if file does not exist
        }
    });

    afterAll(async () => {
        try {
            await fs.unlink(testStatePath);
        } catch {
            // Ignore if file does not exist
        }
    });

    describe("createInitialState", () => {
        test("should throw not implemented error", () => {
            expect(() => createInitialState()).toThrow("Not implemented");
        });
    });

    describe("updateState", () => {
        test("should throw not implemented error", () => {
            const state: LightClientState = {
                header: createMockHeader(100),
                currentSyncCommittee: createMockSyncCommittee(0),
                nextSyncCommittee: createMockSyncCommittee(1),
                finalizedHeader: null,
                period: 0,
                previousSlot: 100,
            };

            expect(() => updateState(state, createMockUpdate(200))).toThrow("Not implemented");
        });
    });

    describe("isUpdateNewer", () => {
        test("should throw not implemented error", () => {
            expect(() =>
                isUpdateNewer(createMockUpdate(200), {
                    header: createMockHeader(100),
                    currentSyncCommittee: createMockSyncCommittee(0),
                    nextSyncCommittee: createMockSyncCommittee(1),
                    finalizedHeader: null,
                    period: 0,
                    previousSlot: 100,
                }),
            ).toThrow("Not implemented");
        });
    });

    describe("transitionPeriod", () => {
        test("should throw not implemented error", () => {
            expect(() =>
                transitionPeriod(
                    {
                        header: createMockHeader(100),
                        currentSyncCommittee: createMockSyncCommittee(0),
                        nextSyncCommittee: createMockSyncCommittee(1),
                        finalizedHeader: null,
                        period: 0,
                        previousSlot: 100,
                    },
                    createMockSyncCommittee(2),
                ),
            ).toThrow("Not implemented");
        });
    });

    describe("serializeState", () => {
        test("should throw not implemented error", () => {
            expect(() =>
                serializeState({
                    header: createMockHeader(100),
                    currentSyncCommittee: createMockSyncCommittee(0),
                    nextSyncCommittee: createMockSyncCommittee(1),
                    finalizedHeader: null,
                    period: 0,
                    previousSlot: 100,
                }),
            ).toThrow("Not implemented");
        });
    });

    describe("deserializeState", () => {
        test("should throw not implemented error", () => {
            expect(() => deserializeState("{}")).toThrow("Not implemented");
        });
    });

    describe("saveState", () => {
        test("should save state to file", async () => {
            const store: LightClientStore = {
                state: {
                    header: createMockHeader(100),
                    currentSyncCommittee: createMockSyncCommittee(0),
                    nextSyncCommittee: createMockSyncCommittee(1),
                    finalizedHeader: null,
                    period: 0,
                    previousSlot: 100,
                },
                lastUpdated: Date.now(),
            };
            await saveState(store, testStatePath);
            const exists = await fs
                .access(testStatePath)
                .then(() => true)
                .catch(() => false);
            expect(exists).toBe(true);
        });
    });

    describe("loadState", () => {
        test("should load state from file", async () => {
            const loaded = await loadState(testStatePath);
            expect(loaded).not.toBeNull();
            if (loaded) {
                expect(loaded.state.header.beacon.slot).toBe(100);
                expect(loaded.state.period).toBe(0);
                expect(loaded.lastUpdated).toBeDefined();
            }
        });

        test("should return null for non-existent file", async () => {
            const loaded = await loadState("/tmp/non-existent-file-12345.json");
            expect(loaded).toBeNull();
        });
    });

    describe("clearState", () => {
        test("should clear state file", async () => {
            await clearState(testStatePath);
            const exists = await fs
                .access(testStatePath)
                .then(() => true)
                .catch(() => false);
            expect(exists).toBe(false);
        });

        test("should not throw for non-existent file", async () => {
            await clearState("/tmp/non-existent-file-12345.json");
        });
    });
});
