import { describe, expect, test } from "bun:test";
import type {
    LightClientUpdate,
    LightClientBootstrap,
    BeaconBlockHeader,
    SyncCommittee,
} from "../../dist/beacon/types";
import {
    createSSZModule,
    serializeSSZ,
    deserializeSSZ,
    hashTreeRoot,
    merkleize,
    mixInLength,
    getGeneralizedIndex,
    serializeLightClientUpdate,
    deserializeLightClientUpdate,
    serializeLightClientBootstrap,
    deserializeLightClientBootstrap,
    computeSigningDomain,
    computeSyncPeriod,
} from "../../dist/beacon/ssz";

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
    executionBranch: Array(4)
        .fill(null)
        .map((_, i) => "0x" + (i + 1).toString(16).padStart(64, "0")),
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
    nextSyncCommitteeBranch: Array(4)
        .fill(null)
        .map((_, i) => "0x" + (i + 1).toString(16).padStart(64, "0")),
    finalizedHeader: createMockHeader(slot - 32),
    finalityBranch: Array(6)
        .fill(null)
        .map((_, i) => "0x" + (i + 10).toString(16).padStart(64, "0")),
    syncAggregate: {
        syncCommitteeBits: new Uint8Array(64).fill(0xff),
        syncCommitteeSignature: "0x" + "cc".repeat(96),
    },
    signatureSlot: slot + 1,
});

describe("SSZ Module", () => {
    describe("createSSZModule", () => {
        test("should return a valid SSZ module with all encoders", () => {
            const module = createSSZModule();

            expect(module).toBeDefined();
            expect(module.BeaconBlockHeader).toBeDefined();
            expect(module.LightClientHeader).toBeDefined();
            expect(module.ExecutionPayloadHeader).toBeDefined();
            expect(module.SyncCommittee).toBeDefined();
            expect(module.SyncAggregate).toBeDefined();
            expect(module.LightClientUpdate).toBeDefined();
            expect(module.LightClientBootstrap).toBeDefined();
            expect(module.LightClientState).toBeDefined();
            expect(module.merkleize).toBeDefined();
            expect(module.mixInLength).toBeDefined();
            expect(module.hash).toBeDefined();
            expect(module.verifyMerkleProof).toBeDefined();
            expect(module.getGeneralizedIndex).toBeDefined();
        });

        test("should have functional serialize method", () => {
            const module = createSSZModule();
            const header: BeaconBlockHeader = {
                slot: 100,
                proposerIndex: 42,
                parentRoot: "0x" + "11".repeat(32),
                stateRoot: "0x" + "22".repeat(32),
                bodyRoot: "0x" + "33".repeat(32),
            };

            const serialized = module.BeaconBlockHeader.serialize(header);
            expect(serialized).toBeDefined();
            expect(serialized).toBeInstanceOf(Uint8Array);
            expect(serialized.length).toBeGreaterThan(0);
        });

        test("should have functional deserialize method", () => {
            const module = createSSZModule();
            const header: BeaconBlockHeader = {
                slot: 100,
                proposerIndex: 42,
                parentRoot: "0x" + "11".repeat(32),
                stateRoot: "0x" + "22".repeat(32),
                bodyRoot: "0x" + "33".repeat(32),
            };

            const serialized = module.BeaconBlockHeader.serialize(header);
            const deserialized = module.BeaconBlockHeader.deserialize(serialized);

            expect(deserialized).toBeDefined();
            expect(deserialized.slot).toBe(header.slot);
            expect(deserialized.proposerIndex).toBe(header.proposerIndex);
        });

        test("should have functional hashTreeRoot method", () => {
            const module = createSSZModule();
            const header: BeaconBlockHeader = {
                slot: 100,
                proposerIndex: 42,
                parentRoot: "0x" + "11".repeat(32),
                stateRoot: "0x" + "22".repeat(32),
                bodyRoot: "0x" + "33".repeat(32),
            };

            const hash = module.BeaconBlockHeader.hashTreeRoot(header);
            expect(hash).toBeDefined();
            expect(hash).toBeInstanceOf(Uint8Array);
            expect(hash.length).toBe(32);
        });
    });

    describe("serializeSSZ", () => {
        test("should serialize LightClientUpdate", () => {
            const update = createMockUpdate(100);
            const serialized = serializeSSZ(update, "LightClientUpdate");
            expect(serialized).toBeDefined();
            expect(serialized).toBeInstanceOf(Uint8Array);
        });

        test("should serialize SyncCommittee", () => {
            const sc = createMockSyncCommittee(0);
            const serialized = serializeSSZ(sc, "SyncCommittee");
            expect(serialized).toBeDefined();
            expect(serialized).toBeInstanceOf(Uint8Array);
        });
    });

    describe("deserializeSSZ", () => {
        test("should deserialize LightClientUpdate", () => {
            const update = createMockUpdate(100);
            const serialized = serializeSSZ(update, "LightClientUpdate");
            const deserialized = deserializeSSZ<LightClientUpdate>(serialized, "LightClientUpdate");
            expect(deserialized).toBeDefined();
            expect(deserialized.attestedHeader.beacon.slot).toBe(update.attestedHeader.beacon.slot);
        });
    });

    describe("hashTreeRoot", () => {
        test("should produce consistent hash for LightClientHeader", () => {
            const header = createMockHeader(100);
            const hash1 = hashTreeRoot(header, "LightClientHeader");
            const hash2 = hashTreeRoot(header, "LightClientHeader");
            expect(hash1).toEqual(hash2);
        });

        test("should produce 32-byte hash", () => {
            const header = createMockHeader(100);
            const hash = hashTreeRoot(header, "LightClientHeader");
            expect(hash.length).toBe(32);
        });
    });

    describe("merkleize", () => {
        test("should merkleize leaves into a root", () => {
            const values = Array(4)
                .fill(null)
                .map((_, i) => new Uint8Array(32).fill(i + 1));
            const root = merkleize(values);
            expect(root).toBeDefined();
            expect(root).toBeInstanceOf(Uint8Array);
            expect(root.length).toBe(32);
        });

        test("should handle empty array", () => {
            const root = merkleize([]);
            expect(root).toBeDefined();
            expect(root.length).toBe(32);
        });
    });

    describe("mixInLength", () => {
        test("should mix length into value", () => {
            const value = new Uint8Array(32).fill(0xab);
            const result = mixInLength(value, 100);
            expect(result).toBeDefined();
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(32);
        });
    });

    describe("getGeneralizedIndex", () => {
        test("should return index for LightClientUpdate fields", () => {
            const index = getGeneralizedIndex("LightClientUpdate", "finalizedHeader");
            expect(typeof index).toBe("number");
            expect(index).toBeGreaterThanOrEqual(0);
        });

        test("should return index for LightClientHeader fields", () => {
            const index = getGeneralizedIndex("LightClientHeader", "execution");
            expect(typeof index).toBe("number");
            expect(index).toBeGreaterThanOrEqual(0);
        });

        test("should throw for unknown container type", () => {
            expect(() => getGeneralizedIndex("UnknownType", "field")).toThrow(
                "Unknown container type",
            );
        });
    });

    describe("computeSigningDomain", () => {
        test("should compute signing domain", () => {
            const forkVersion = Uint8Array.from([0x01, 0x00, 0x00, 0x00]);
            const domainType = Uint8Array.from([0x03, 0x00, 0x00, 0x00]);
            const domain = computeSigningDomain(forkVersion, domainType);
            expect(domain).toBeDefined();
            expect(domain).toBeInstanceOf(Uint8Array);
            expect(domain.length).toBe(32);
            expect(domain[0]).toBe(0x03);
            expect(domain[4]).toBe(0x01);
        });
    });

    describe("computeSyncPeriod", () => {
        test("should compute sync period", () => {
            const period = computeSyncPeriod(100);
            expect(typeof period).toBe("number");
            expect(period).toBe(0);
        });

        test("should compute correct period for high slot", () => {
            const period = computeSyncPeriod(1000000);
            expect(period).toBe(Math.floor(1000000 / (32 * 256)));
        });
    });
});

describe("SSZ Round-trip Tests (Integration)", () => {
    describe("LightClientUpdate serialization", () => {
        test("should serialize and deserialize correctly", () => {
            const update = createMockUpdate(100);
            const serialized = serializeLightClientUpdate(update);
            const deserialized = deserializeLightClientUpdate(serialized);
            expect(deserialized).toBeDefined();
            expect(deserialized.attestedHeader.beacon.slot).toBe(update.attestedHeader.beacon.slot);
            expect(deserialized.signatureSlot).toBe(update.signatureSlot);
        });
    });

    describe("LightClientBootstrap serialization", () => {
        test("should serialize and deserialize correctly", () => {
            const bootstrap: LightClientBootstrap = {
                header: createMockHeader(0),
                currentSyncCommittee: createMockSyncCommittee(0),
                currentSyncCommitteeBranch: Array(4)
                    .fill(null)
                    .map((_, i) => "0x" + (i + 1).toString(16).padStart(64, "0")),
            };
            const serialized = serializeLightClientBootstrap(bootstrap);
            const deserialized = deserializeLightClientBootstrap(serialized);
            expect(deserialized).toBeDefined();
            expect(deserialized.header.beacon.slot).toBe(bootstrap.header.beacon.slot);
        });
    });

    describe("hashTreeRoot", () => {
        test("should produce consistent hash for same input", () => {
            const header = createMockHeader(100);
            const root1 = hashTreeRoot(header, "LightClientHeader");
            const root2 = hashTreeRoot(header, "LightClientHeader");
            expect(root1).toEqual(root2);
        });
    });
});
