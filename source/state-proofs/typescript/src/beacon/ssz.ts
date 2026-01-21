/**
 * SSZ Encoding/Decoding for Ethereum Beacon Chain Types
 *
 * Provides SSZ (Simple Serialize) encoding and decoding for light client
 * types, enabling proper serialization for network transmission and
 * merkle proof verification.
 *
 * References:
 * - https://github.com/ethereum/consensus-specs/blob/master/specs/phase0/simple-serialize.md
 * - https://github.com/ChainSafe/ssz
 */

import {
    ContainerType,
    ByteVectorType,
    UintNumberType,
    UintBigintType,
    VectorCompositeType,
} from "@chainsafe/ssz";
import { merkleize as sszMerkleize, mixInLength as sszMixInLength } from "@chainsafe/ssz/lib/util/merkleize";
import { digest as sszDigest } from "@chainsafe/as-sha256";
import type {
    LightClientHeader,
    LightClientUpdate,
    LightClientBootstrap,
    LightClientState,
    BeaconBlockHeader,
    SyncCommittee,
    SyncAggregate,
    ExecutionPayloadHeader,
} from "./types";
import { hexToBytes, bytesToHex } from "./types";

const UINT64 = new UintNumberType(8);
const UINT256 = new UintBigintType(32);
const BYTE_VECTOR_20 = new ByteVectorType(20);
const BYTE_VECTOR_32 = new ByteVectorType(32);
const BYTE_VECTOR_48 = new ByteVectorType(48);
const BYTE_VECTOR_96 = new ByteVectorType(96);
const BYTE_VECTOR_256 = new ByteVectorType(256);

const BeaconBlockHeaderType = new ContainerType({
    slot: UINT64,
    proposerIndex: UINT64,
    parentRoot: BYTE_VECTOR_32,
    stateRoot: BYTE_VECTOR_32,
    bodyRoot: BYTE_VECTOR_32,
});

const ExecutionPayloadHeaderType = new ContainerType({
    parentHash: BYTE_VECTOR_32,
    feeRecipient: BYTE_VECTOR_20,
    stateRoot: BYTE_VECTOR_32,
    receiptsRoot: BYTE_VECTOR_32,
    logsBloom: BYTE_VECTOR_256,
    prevRandao: BYTE_VECTOR_32,
    blockNumber: UINT64,
    gasLimit: UINT64,
    gasUsed: UINT64,
    timestamp: UINT64,
    extraDataLength: UINT64,
    baseFeePerGas: UINT256,
    blockHash: BYTE_VECTOR_32,
    transactionsRoot: BYTE_VECTOR_32,
    withdrawalsRoot: BYTE_VECTOR_32,
});

const LightClientHeaderType = new ContainerType({
    beacon: BeaconBlockHeaderType,
    execution: ExecutionPayloadHeaderType,
    executionBranch: new VectorCompositeType(BYTE_VECTOR_32, 4),
});

const SyncAggregateType = new ContainerType({
    syncCommitteeBits: new ByteVectorType(64),
    syncCommitteeSignature: BYTE_VECTOR_96,
});

const SyncCommitteeType = new ContainerType({
    pubkeys: new VectorCompositeType(BYTE_VECTOR_48, 512),
    aggregatePubkey: BYTE_VECTOR_48,
});

const LightClientUpdateType = new ContainerType({
    attestedHeader: LightClientHeaderType,
    nextSyncCommittee: SyncCommitteeType,
    nextSyncCommitteeBranch: new VectorCompositeType(BYTE_VECTOR_32, 4),
    finalizedHeader: LightClientHeaderType,
    finalityBranch: new VectorCompositeType(BYTE_VECTOR_32, 6),
    syncAggregate: SyncAggregateType,
    signatureSlot: UINT64,
});

const LightClientBootstrapType = new ContainerType({
    header: LightClientHeaderType,
    currentSyncCommittee: SyncCommitteeType,
    currentSyncCommitteeBranch: new VectorCompositeType(BYTE_VECTOR_32, 4),
});

const LightClientStateType = new ContainerType({
    header: LightClientHeaderType,
    currentSyncCommittee: SyncCommitteeType,
    nextSyncCommittee: SyncCommitteeType,
    finalizedHeader: LightClientHeaderType,
    period: UINT64,
    previousSlot: UINT64,
});

export interface SSZEncoder<T> {
    serialize(value: T): Uint8Array;
    deserialize(data: Uint8Array): T;
    hashTreeRoot(value: T): Uint8Array;
}

export interface MerkleProof {
    proof: Uint8Array[];
    leaf: Uint8Array;
    index: number;
    root: Uint8Array;
}

export interface SSZModule {
    BeaconBlockHeader: SSZEncoder<BeaconBlockHeader>;
    LightClientHeader: SSZEncoder<LightClientHeader>;
    ExecutionPayloadHeader: SSZEncoder<ExecutionPayloadHeader>;
    SyncCommittee: SSZEncoder<SyncCommittee>;
    SyncAggregate: SSZEncoder<SyncAggregate>;
    LightClientUpdate: SSZEncoder<LightClientUpdate>;
    LightClientBootstrap: SSZEncoder<LightClientBootstrap>;
    LightClientState: SSZEncoder<LightClientState>;
    merkleize(leaves: Uint8Array[], length?: number): Uint8Array;
    mixInLength(value: Uint8Array, length: number): Uint8Array;
    hash(x: Uint8Array): Uint8Array;
    verifyMerkleProof(
        root: Uint8Array,
        proof: Uint8Array[],
        index: number,
        leaf: Uint8Array,
    ): boolean;
    getGeneralizedIndex(containerType: string, fieldName: string): number;
}

function convertHeaderToSSZ(header: LightClientHeader): Record<string, unknown> {
    return {
        beacon: {
            slot: header.beacon.slot,
            proposerIndex: header.beacon.proposerIndex,
            parentRoot: hexToBytes(header.beacon.parentRoot),
            stateRoot: hexToBytes(header.beacon.stateRoot),
            bodyRoot: hexToBytes(header.beacon.bodyRoot),
        },
        execution: {
            parentHash: hexToBytes(header.execution.parentHash),
            feeRecipient: hexToBytes(header.execution.feeRecipient),
            stateRoot: hexToBytes(header.execution.stateRoot),
            receiptsRoot: hexToBytes(header.execution.receiptsRoot),
            logsBloom: hexToBytes(header.execution.logsBloom),
            prevRandao: hexToBytes(header.execution.prevRandao),
            blockNumber: header.execution.blockNumber,
            gasLimit: header.execution.gasLimit,
            gasUsed: header.execution.gasUsed,
            timestamp: header.execution.timestamp,
            extraDataLength: 0,
            baseFeePerGas: header.execution.baseFeePerGas,
            blockHash: hexToBytes(header.execution.blockHash),
            transactionsRoot: hexToBytes(header.execution.transactionsRoot),
            withdrawalsRoot: hexToBytes(header.execution.withdrawalsRoot),
        },
        executionBranch: header.executionBranch.map(hexToBytes),
    };
}

function convertHeaderFromSSZ(ssz: Record<string, unknown>): LightClientHeader {
    const beacon = ssz.beacon as Record<string, unknown>;
    const execution = ssz.execution as Record<string, unknown>;
    return {
        beacon: {
            slot: beacon.slot as number,
            proposerIndex: beacon.proposerIndex as number,
            parentRoot: bytesToHex(beacon.parentRoot as Uint8Array),
            stateRoot: bytesToHex(beacon.stateRoot as Uint8Array),
            bodyRoot: bytesToHex(beacon.bodyRoot as Uint8Array),
        },
        execution: {
            parentHash: bytesToHex(execution.parentHash as Uint8Array),
            feeRecipient: bytesToHex(execution.feeRecipient as Uint8Array),
            stateRoot: bytesToHex(execution.stateRoot as Uint8Array),
            receiptsRoot: bytesToHex(execution.receiptsRoot as Uint8Array),
            logsBloom: bytesToHex(execution.logsBloom as Uint8Array),
            prevRandao: bytesToHex(execution.prevRandao as Uint8Array),
            blockNumber: execution.blockNumber as number,
            gasLimit: execution.gasLimit as number,
            gasUsed: execution.gasUsed as number,
            timestamp: execution.timestamp as number,
            extraData: "0x",
            baseFeePerGas: execution.baseFeePerGas as bigint,
            blockHash: bytesToHex(execution.blockHash as Uint8Array),
            transactionsRoot: bytesToHex(execution.transactionsRoot as Uint8Array),
            withdrawalsRoot: bytesToHex(execution.withdrawalsRoot as Uint8Array),
        },
        executionBranch: (ssz.executionBranch as Uint8Array[]).map(bytesToHex),
    };
}

function convertSyncCommitteeToSSZ(sc: SyncCommittee): Record<string, unknown> {
    return {
        pubkeys: sc.pubkeys.map(hexToBytes),
        aggregatePubkey: hexToBytes(sc.aggregatePubkey),
    };
}

function convertSyncCommitteeFromSSZ(ssz: Record<string, unknown>): SyncCommittee {
    return {
        pubkeys: (ssz.pubkeys as Uint8Array[]).map(bytesToHex),
        aggregatePubkey: bytesToHex(ssz.aggregatePubkey as Uint8Array),
    };
}

function convertUpdateToSSZ(update: LightClientUpdate): Record<string, unknown> {
    return {
        attestedHeader: convertHeaderToSSZ(update.attestedHeader),
        nextSyncCommittee: convertSyncCommitteeToSSZ(update.nextSyncCommittee),
        nextSyncCommitteeBranch: update.nextSyncCommitteeBranch.map(hexToBytes),
        finalizedHeader: update.finalizedHeader ? convertHeaderToSSZ(update.finalizedHeader) : LightClientHeaderType.defaultValue(),
        finalityBranch: update.finalityBranch.map(hexToBytes),
        syncAggregate: {
            syncCommitteeBits: update.syncAggregate.syncCommitteeBits,
            syncCommitteeSignature: hexToBytes(update.syncAggregate.syncCommitteeSignature),
        },
        signatureSlot: update.signatureSlot,
    };
}

function convertUpdateFromSSZ(ssz: Record<string, unknown>): LightClientUpdate {
    const finalizedHeader = ssz.finalizedHeader as Record<string, unknown>;
    return {
        attestedHeader: convertHeaderFromSSZ(ssz.attestedHeader as Record<string, unknown>),
        nextSyncCommittee: convertSyncCommitteeFromSSZ(ssz.nextSyncCommittee as Record<string, unknown>),
        nextSyncCommitteeBranch: (ssz.nextSyncCommitteeBranch as Uint8Array[]).map(bytesToHex),
        finalizedHeader: finalizedHeader && finalizedHeader.beacon ? convertHeaderFromSSZ(finalizedHeader) : null,
        finalityBranch: (ssz.finalityBranch as Uint8Array[]).map(bytesToHex),
        syncAggregate: {
            syncCommitteeBits: (ssz.syncAggregate as Record<string, Uint8Array>).syncCommitteeBits,
            syncCommitteeSignature: bytesToHex((ssz.syncAggregate as Record<string, Uint8Array>).syncCommitteeSignature),
        },
        signatureSlot: ssz.signatureSlot as number,
    };
}

function convertBootstrapToSSZ(bootstrap: LightClientBootstrap): Record<string, unknown> {
    return {
        header: convertHeaderToSSZ(bootstrap.header),
        currentSyncCommittee: convertSyncCommitteeToSSZ(bootstrap.currentSyncCommittee),
        currentSyncCommitteeBranch: bootstrap.currentSyncCommitteeBranch.map(hexToBytes),
    };
}

function convertBootstrapFromSSZ(ssz: Record<string, unknown>): LightClientBootstrap {
    return {
        header: convertHeaderFromSSZ(ssz.header as Record<string, unknown>),
        currentSyncCommittee: convertSyncCommitteeFromSSZ(ssz.currentSyncCommittee as Record<string, unknown>),
        currentSyncCommitteeBranch: (ssz.currentSyncCommitteeBranch as Uint8Array[]).map(bytesToHex),
    };
}

function convertStateToSSZ(state: LightClientState): Record<string, unknown> {
    return {
        header: convertHeaderToSSZ(state.header),
        currentSyncCommittee: convertSyncCommitteeToSSZ(state.currentSyncCommittee),
        nextSyncCommittee: convertSyncCommitteeToSSZ(state.nextSyncCommittee),
        finalizedHeader: state.finalizedHeader ? convertHeaderToSSZ(state.finalizedHeader) : LightClientHeaderType.defaultValue(),
        period: state.period,
        previousSlot: state.previousSlot,
    };
}

function convertStateFromSSZ(ssz: Record<string, unknown>): LightClientState {
    const finalizedHeader = ssz.finalizedHeader as Record<string, unknown>;
    return {
        header: convertHeaderFromSSZ(ssz.header as Record<string, unknown>),
        currentSyncCommittee: convertSyncCommitteeFromSSZ(ssz.currentSyncCommittee as Record<string, unknown>),
        nextSyncCommittee: convertSyncCommitteeFromSSZ(ssz.nextSyncCommittee as Record<string, unknown>),
        finalizedHeader: finalizedHeader && finalizedHeader.beacon ? convertHeaderFromSSZ(finalizedHeader) : null,
        period: ssz.period as number,
        previousSlot: ssz.previousSlot as number,
    };
}

export function createSSZModule(): SSZModule {
    return {
        BeaconBlockHeader: {
            serialize: (value: BeaconBlockHeader) => {
                const sszValue = {
                    slot: value.slot,
                    proposerIndex: value.proposerIndex,
                    parentRoot: hexToBytes(value.parentRoot),
                    stateRoot: hexToBytes(value.stateRoot),
                    bodyRoot: hexToBytes(value.bodyRoot),
                };
                return BeaconBlockHeaderType.serialize(sszValue as any);
            },
            deserialize: (data: Uint8Array) => {
                const value = BeaconBlockHeaderType.deserialize(data);
                return {
                    slot: value.slot as number,
                    proposerIndex: value.proposerIndex as number,
                    parentRoot: bytesToHex(value.parentRoot as Uint8Array),
                    stateRoot: bytesToHex(value.stateRoot as Uint8Array),
                    bodyRoot: bytesToHex(value.bodyRoot as Uint8Array),
                };
            },
            hashTreeRoot: (value: BeaconBlockHeader) => {
                const sszValue = {
                    slot: value.slot,
                    proposerIndex: value.proposerIndex,
                    parentRoot: hexToBytes(value.parentRoot),
                    stateRoot: hexToBytes(value.stateRoot),
                    bodyRoot: hexToBytes(value.bodyRoot),
                };
                return BeaconBlockHeaderType.hashTreeRoot(sszValue as any);
            },
        },
        LightClientHeader: {
            serialize: (value: LightClientHeader) => {
                const sszValue = convertHeaderToSSZ(value);
                return LightClientHeaderType.serialize(sszValue as any);
            },
            deserialize: (data: Uint8Array) => {
                const value = LightClientHeaderType.deserialize(data);
                return convertHeaderFromSSZ(value as any);
            },
            hashTreeRoot: (value: LightClientHeader) => {
                const sszValue = convertHeaderToSSZ(value);
                return LightClientHeaderType.hashTreeRoot(sszValue as any);
            },
        },
        ExecutionPayloadHeader: {
            serialize: (value: ExecutionPayloadHeader) => {
                const sszValue = {
                    parentHash: hexToBytes(value.parentHash),
                    feeRecipient: hexToBytes(value.feeRecipient),
                    stateRoot: hexToBytes(value.stateRoot),
                    receiptsRoot: hexToBytes(value.receiptsRoot),
                    logsBloom: hexToBytes(value.logsBloom),
                    prevRandao: hexToBytes(value.prevRandao),
                    blockNumber: value.blockNumber,
                    gasLimit: value.gasLimit,
                    gasUsed: value.gasUsed,
                    timestamp: value.timestamp,
                    extraDataLength: 0,
                    baseFeePerGas: value.baseFeePerGas,
                    blockHash: hexToBytes(value.blockHash),
                    transactionsRoot: hexToBytes(value.transactionsRoot),
                    withdrawalsRoot: hexToBytes(value.withdrawalsRoot),
                };
                return ExecutionPayloadHeaderType.serialize(sszValue as any);
            },
            deserialize: (data: Uint8Array) => {
                const value = ExecutionPayloadHeaderType.deserialize(data);
                return {
                    parentHash: bytesToHex(value.parentHash as Uint8Array),
                    feeRecipient: bytesToHex(value.feeRecipient as Uint8Array),
                    stateRoot: bytesToHex(value.stateRoot as Uint8Array),
                    receiptsRoot: bytesToHex(value.receiptsRoot as Uint8Array),
                    logsBloom: bytesToHex(value.logsBloom as Uint8Array),
                    prevRandao: bytesToHex(value.prevRandao as Uint8Array),
                    blockNumber: value.blockNumber as number,
                    gasLimit: value.gasLimit as number,
                    gasUsed: value.gasUsed as number,
                    timestamp: value.timestamp as number,
                    extraData: "0x",
                    baseFeePerGas: value.baseFeePerGas as bigint,
                    blockHash: bytesToHex(value.blockHash as Uint8Array),
                    transactionsRoot: bytesToHex(value.transactionsRoot as Uint8Array),
                    withdrawalsRoot: bytesToHex(value.withdrawalsRoot as Uint8Array),
                };
            },
            hashTreeRoot: (value: ExecutionPayloadHeader) => {
                const sszValue = {
                    parentHash: hexToBytes(value.parentHash),
                    feeRecipient: hexToBytes(value.feeRecipient),
                    stateRoot: hexToBytes(value.stateRoot),
                    receiptsRoot: hexToBytes(value.receiptsRoot),
                    logsBloom: hexToBytes(value.logsBloom),
                    prevRandao: hexToBytes(value.prevRandao),
                    blockNumber: value.blockNumber,
                    gasLimit: value.gasLimit,
                    gasUsed: value.gasUsed,
                    timestamp: value.timestamp,
                    extraDataLength: 0,
                    baseFeePerGas: value.baseFeePerGas,
                    blockHash: hexToBytes(value.blockHash),
                    transactionsRoot: hexToBytes(value.transactionsRoot),
                    withdrawalsRoot: hexToBytes(value.withdrawalsRoot),
                };
                return ExecutionPayloadHeaderType.hashTreeRoot(sszValue as any);
            },
        },
        SyncCommittee: {
            serialize: (value: SyncCommittee) => {
                const sszValue = convertSyncCommitteeToSSZ(value);
                return SyncCommitteeType.serialize(sszValue as any);
            },
            deserialize: (data: Uint8Array) => {
                const value = SyncCommitteeType.deserialize(data);
                return convertSyncCommitteeFromSSZ(value as any);
            },
            hashTreeRoot: (value: SyncCommittee) => {
                const sszValue = convertSyncCommitteeToSSZ(value);
                return SyncCommitteeType.hashTreeRoot(sszValue as any);
            },
        },
        SyncAggregate: {
            serialize: (value: SyncAggregate) => {
                const sszValue = {
                    syncCommitteeBits: value.syncCommitteeBits,
                    syncCommitteeSignature: hexToBytes(value.syncCommitteeSignature),
                };
                return SyncAggregateType.serialize(sszValue as any);
            },
            deserialize: (data: Uint8Array) => {
                const value = SyncAggregateType.deserialize(data);
                return {
                    syncCommitteeBits: value.syncCommitteeBits as Uint8Array,
                    syncCommitteeSignature: bytesToHex(value.syncCommitteeSignature as Uint8Array),
                };
            },
            hashTreeRoot: (value: SyncAggregate) => {
                const sszValue = {
                    syncCommitteeBits: value.syncCommitteeBits,
                    syncCommitteeSignature: hexToBytes(value.syncCommitteeSignature),
                };
                return SyncAggregateType.hashTreeRoot(sszValue as any);
            },
        },
        LightClientUpdate: {
            serialize: (value: LightClientUpdate) => {
                const sszValue = convertUpdateToSSZ(value);
                return LightClientUpdateType.serialize(sszValue as any);
            },
            deserialize: (data: Uint8Array) => {
                const value = LightClientUpdateType.deserialize(data);
                return convertUpdateFromSSZ(value as any);
            },
            hashTreeRoot: (value: LightClientUpdate) => {
                const sszValue = convertUpdateToSSZ(value);
                return LightClientUpdateType.hashTreeRoot(sszValue as any);
            },
        },
        LightClientBootstrap: {
            serialize: (value: LightClientBootstrap) => {
                const sszValue = convertBootstrapToSSZ(value);
                return LightClientBootstrapType.serialize(sszValue as any);
            },
            deserialize: (data: Uint8Array) => {
                const value = LightClientBootstrapType.deserialize(data);
                return convertBootstrapFromSSZ(value as any);
            },
            hashTreeRoot: (value: LightClientBootstrap) => {
                const sszValue = convertBootstrapToSSZ(value);
                return LightClientBootstrapType.hashTreeRoot(sszValue as any);
            },
        },
        LightClientState: {
            serialize: (value: LightClientState) => {
                const sszValue = convertStateToSSZ(value);
                return LightClientStateType.serialize(sszValue as any);
            },
            deserialize: (data: Uint8Array) => {
                const value = LightClientStateType.deserialize(data);
                return convertStateFromSSZ(value as any);
            },
            hashTreeRoot: (value: LightClientState) => {
                const sszValue = convertStateToSSZ(value);
                return LightClientStateType.hashTreeRoot(sszValue as any);
            },
        },
        merkleize: (leaves: Uint8Array[], _length?: number) => {
            return sszMerkleize([...leaves], 0) as Uint8Array;
        },
        mixInLength: (value: Uint8Array, length: number) => {
            return sszMixInLength(value, length);
        },
        hash: (x: Uint8Array) => {
            return sszDigest(x);
        },
        verifyMerkleProof: (root: Uint8Array, proof: Uint8Array[], index: number, leaf: Uint8Array) => {
            let current = leaf;
            for (let i = 0; i < proof.length; i++) {
                if ((index >> i) & 1) {
                    current = sszDigest(new Uint8Array([...proof[i], ...current]));
                } else {
                    current = sszDigest(new Uint8Array([...current, ...proof[i]]));
                }
            }
            return Array.from(current).every((v: number, i: number) => v === root[i]);
        },
        getGeneralizedIndex: (containerType: string, fieldName: string) => {
            const fieldIndices: Record<string, Record<string, number>> = {
                LightClientUpdate: {
                    attestedHeader: 0,
                    nextSyncCommittee: 1,
                    nextSyncCommitteeBranch: 2,
                    finalizedHeader: 3,
                    finalityBranch: 4,
                    syncAggregate: 5,
                    signatureSlot: 6,
                },
                LightClientBootstrap: {
                    header: 0,
                    currentSyncCommittee: 1,
                    currentSyncCommitteeBranch: 2,
                },
                LightClientState: {
                    header: 0,
                    currentSyncCommittee: 1,
                    nextSyncCommittee: 2,
                    finalizedHeader: 3,
                    period: 4,
                    previousSlot: 5,
                },
                LightClientHeader: {
                    beacon: 0,
                    execution: 1,
                    executionBranch: 2,
                },
            };
            const indices = fieldIndices[containerType];
            if (!indices) {
                throw new Error(`Unknown container type: ${containerType}`);
            }
            return indices[fieldName] ?? 0;
        },
    };
}

export function serializeSSZ<T>(value: T, typeName: string): Uint8Array {
    const module = createSSZModule();
    switch (typeName) {
        case "LightClientUpdate":
            return module.LightClientUpdate.serialize(value as LightClientUpdate);
        case "LightClientBootstrap":
            return module.LightClientBootstrap.serialize(value as LightClientBootstrap);
        case "LightClientState":
            return module.LightClientState.serialize(value as LightClientState);
        case "LightClientHeader":
            return module.LightClientHeader.serialize(value as LightClientHeader);
        case "SyncCommittee":
            return module.SyncCommittee.serialize(value as SyncCommittee);
        default:
            throw new Error(`Unknown type: ${typeName}`);
    }
}

export function deserializeSSZ<T>(data: Uint8Array, typeName: string): T {
    const module = createSSZModule();
    switch (typeName) {
        case "LightClientUpdate":
            return module.LightClientUpdate.deserialize(data) as T;
        case "LightClientBootstrap":
            return module.LightClientBootstrap.deserialize(data) as T;
        case "LightClientState":
            return module.LightClientState.deserialize(data) as T;
        case "LightClientHeader":
            return module.LightClientHeader.deserialize(data) as T;
        case "SyncCommittee":
            return module.SyncCommittee.deserialize(data) as T;
        default:
            throw new Error(`Unknown type: ${typeName}`);
    }
}

export function hashTreeRoot<T>(value: T, typeName: string): Uint8Array {
    const module = createSSZModule();
    switch (typeName) {
        case "LightClientUpdate":
            return module.LightClientUpdate.hashTreeRoot(value as LightClientUpdate);
        case "LightClientBootstrap":
            return module.LightClientBootstrap.hashTreeRoot(value as LightClientBootstrap);
        case "LightClientState":
            return module.LightClientState.hashTreeRoot(value as LightClientState);
        case "LightClientHeader":
            return module.LightClientHeader.hashTreeRoot(value as LightClientHeader);
        case "SyncCommittee":
            return module.SyncCommittee.hashTreeRoot(value as SyncCommittee);
        default:
            throw new Error(`Unknown type: ${typeName}`);
    }
}

export function verifyMerkleProof(
    root: Uint8Array,
    proof: Uint8Array[],
    index: number,
    leaf: Uint8Array,
): boolean {
    return createSSZModule().verifyMerkleProof(root, proof, index, leaf);
}

export function merkleize(values: Uint8Array[], chunkSize?: number): Uint8Array {
    return createSSZModule().merkleize(values, chunkSize);
}

export function mixInLength(value: Uint8Array, length: number): Uint8Array {
    return createSSZModule().mixInLength(value, length);
}

export function getGeneralizedIndex(containerType: string, fieldName: string): number {
    return createSSZModule().getGeneralizedIndex(containerType, fieldName);
}

export function serializeLightClientUpdate(update: LightClientUpdate): Uint8Array {
    return createSSZModule().LightClientUpdate.serialize(update);
}

export function deserializeLightClientUpdate(data: Uint8Array): LightClientUpdate {
    return createSSZModule().LightClientUpdate.deserialize(data);
}

export function serializeLightClientBootstrap(bootstrap: LightClientBootstrap): Uint8Array {
    return createSSZModule().LightClientBootstrap.serialize(bootstrap);
}

export function deserializeLightClientBootstrap(data: Uint8Array): LightClientBootstrap {
    return createSSZModule().LightClientBootstrap.deserialize(data);
}

export function serializeLightClientState(state: LightClientState): Uint8Array {
    return createSSZModule().LightClientState.serialize(state);
}

export function deserializeLightClientState(data: Uint8Array): LightClientState {
    return createSSZModule().LightClientState.deserialize(data);
}

export function computeSigningDomain(forkVersion: Uint8Array, domainType: Uint8Array): Uint8Array {
    const domain = new Uint8Array(32);
    domain.set(domainType, 0);
    domain.set(forkVersion, 4);
    return domain;
}

export function computeSyncPeriod(slot: number): number {
    return Math.floor(slot / (32 * 256));
}
