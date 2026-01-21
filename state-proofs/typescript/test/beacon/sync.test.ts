import { describe, expect, test } from "bun:test";
import type {
    LightClientState,
    LightClientUpdate,
    SyncCommittee,
    LightClientHeader,
    BeaconBlockHeader,
} from "../../dist/beacon/types";
import {
    initializeLightClient,
    processLightClientUpdate,
    verifySyncCommitteeSignature,
    verifyBlsSignature,
    aggregatePublicKeys,
    hasSyncCommitteeQuorum,
    getTrustedStateRoots,
    computeSyncCommitteeDomain,
    computeSigningRoot,
} from "../../dist/beacon/sync";
import bls from "@chainsafe/bls";

const mockAddress = "0x" + "11".repeat(20);

const createMockHeader = (slot: number): LightClientHeader => ({
    beacon: {
        slot,
        proposerIndex: 0,
        parentRoot: "0x" + "22".repeat(32),
        stateRoot: "0x" + "33".repeat(32),
        bodyRoot: "0x" + "44".repeat(32),
    },
    execution: {
        parentHash: "0x" + "55".repeat(32),
        feeRecipient: mockAddress,
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

async function createMockSyncCommittee(): Promise<SyncCommittee> {
    const pubkeys: string[] = [];
    for (let i = 0; i < 512; i++) {
        const secretKey = bls.SecretKey.fromKeygen(new Uint8Array([i]));
        const publicKey = secretKey.toPublicKey();
        pubkeys.push(publicKey.toHex());
    }

    const aggregatePubkey = bls.aggregatePublicKeys(
        pubkeys.map((hex) => bls.PublicKey.fromHex(hex).toBytes()),
    );

    return {
        pubkeys,
        aggregatePubkey: bls.PublicKey.fromBytes(aggregatePubkey).toHex(),
    };
}

describe("Light Client Sync", () => {
    describe("initializeLightClient", () => {
        test("should create initial state from header and sync committee", async () => {
            const header = createMockHeader(100);
            const committee = await createMockSyncCommittee();
            const state = initializeLightClient(header, committee, 0);

            expect(state.header).toEqual(header);
            expect(state.currentSyncCommittee).toEqual(committee);
            expect(state.nextSyncCommittee).toEqual(committee);
            expect(state.finalizedHeader).toBeNull();
            expect(state.period).toBe(0);
            expect(state.previousSlot).toBe(100);
        });
    });

    describe("processLightClientUpdate", () => {
        test("should reject invalid sync committee signature", async () => {
            const state: LightClientState = {
                header: createMockHeader(100),
                currentSyncCommittee: await createMockSyncCommittee(),
                nextSyncCommittee: await createMockSyncCommittee(),
                finalizedHeader: null,
                period: 0,
                previousSlot: 100,
            };

            const update: LightClientUpdate = {
                attestedHeader: createMockHeader(200),
                nextSyncCommittee: await createMockSyncCommittee(),
                nextSyncCommitteeBranch: [],
                finalizedHeader: null,
                finalityBranch: [],
                syncAggregate: {
                    syncCommitteeBits: new Uint8Array(64),
                    syncCommitteeSignature: "0x" + "cc".repeat(96),
                },
                signatureSlot: 201,
            };

            await expect(processLightClientUpdate(state, update, false)).rejects.toThrow(
                "Invalid sync committee signature",
            );
        });
    });

    describe("verifySyncCommitteeSignature", () => {
        test("should return false for empty participation", async () => {
            const header = createMockHeader(100);
            const committee = await createMockSyncCommittee();

            const result = await verifySyncCommitteeSignature(
                header,
                {
                    syncCommitteeBits: new Uint8Array(64),
                    syncCommitteeSignature: "0x" + "dd".repeat(96),
                },
                committee,
            );

            expect(result).toBe(false);
        });
    });

    describe("verifyBlsSignature", () => {
        test("should return false for empty public keys", async () => {
            const result = await verifyBlsSignature(
                new Uint8Array(32),
                new Uint8Array(96).fill(0x01),
                [],
            );
            expect(result).toBe(false);
        });
    });

    describe("aggregatePublicKeys", () => {
        test("should throw for empty public keys", async () => {
            await expect(aggregatePublicKeys([])).rejects.toThrow(
                "Cannot aggregate zero public keys",
            );
        });

        test("should aggregate multiple valid public keys", async () => {
            const publicKeys: Uint8Array[] = [];
            for (let i = 0; i < 10; i++) {
                const secretKey = bls.SecretKey.fromKeygen(new Uint8Array([i]));
                publicKeys.push(secretKey.toPublicKey().toBytes());
            }

            const aggregated = await aggregatePublicKeys(publicKeys);
            expect(aggregated.length).toBe(48);
        });
    });

    describe("hasSyncCommitteeQuorum", () => {
        test("should return false for empty participation", () => {
            const bits = new Uint8Array(64);
            expect(hasSyncCommitteeQuorum(bits)).toBe(false);
        });

        test("should return true for full participation", () => {
            const bits = new Uint8Array(64).fill(0xff);
            expect(hasSyncCommitteeQuorum(bits)).toBe(true);
        });

        test("should return false for insufficient participation", () => {
            const bits = new Uint8Array(64);
            bits[0] = 0x55;
            expect(hasSyncCommitteeQuorum(bits)).toBe(false);
        });

        test("should return true for 2/3 quorum", () => {
            const bits = new Uint8Array(64);
            for (let i = 0; i < 342; i++) {
                bits[i >> 3] |= 1 << (i % 8);
            }
            expect(hasSyncCommitteeQuorum(bits)).toBe(true);
        });

        test("should return false for just under 2/3 quorum", () => {
            const bits = new Uint8Array(64);
            for (let i = 0; i < 341; i++) {
                bits[i >> 3] |= 1 << (i % 8);
            }
            expect(hasSyncCommitteeQuorum(bits)).toBe(false);
        });
    });

    describe("getTrustedStateRoots", () => {
        test("should return null for state without header", async () => {
            const state: LightClientState = {
                header: null as unknown as LightClientHeader,
                currentSyncCommittee: await createMockSyncCommittee(),
                nextSyncCommittee: await createMockSyncCommittee(),
                finalizedHeader: null,
                period: 0,
                previousSlot: 0,
            };
            expect(getTrustedStateRoots(state)).toBeNull();
        });

        test("should return state roots for valid header", async () => {
            const state: LightClientState = {
                header: createMockHeader(100),
                currentSyncCommittee: await createMockSyncCommittee(),
                nextSyncCommittee: await createMockSyncCommittee(),
                finalizedHeader: null,
                period: 0,
                previousSlot: 0,
            };

            const roots = getTrustedStateRoots(state);
            expect(roots).not.toBeNull();
            if (roots) {
                expect(roots.stateRoot).toBeDefined();
                expect(roots.transactionsRoot).toBeDefined();
                expect(roots.receiptsRoot).toBeDefined();
            }
        });
    });

    describe("computeSyncCommitteeDomain", () => {
        test("should compute domain", () => {
            const forkVersion = Uint8Array.from([0x01, 0x00, 0x00, 0x00]);
            const genesisValidatorRoot = new Uint8Array(32);
            const domain = computeSyncCommitteeDomain(forkVersion, genesisValidatorRoot);
            expect(domain.length).toBe(32);
        });
    });

    describe("computeSigningRoot", () => {
        test("should compute signing root", () => {
            const header: BeaconBlockHeader = {
                slot: 100,
                proposerIndex: 0,
                parentRoot: "0x" + "22".repeat(32),
                stateRoot: "0x" + "33".repeat(32),
                bodyRoot: "0x" + "44".repeat(32),
            };
            const domain = new Uint8Array(32);
            const root = computeSigningRoot(header, domain);
            expect(root.length).toBe(32);
        });
    });
});
