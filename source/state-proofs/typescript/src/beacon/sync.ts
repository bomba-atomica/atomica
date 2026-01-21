/**
 * Light Client Sync Logic
 *
 * Implements BLS signature verification and sync committee consensus.
 *
 * References:
 * - https://github.com/ethereum/consensus-specs/blob/master/specs/altair/light-client/sync-protocol.md
 * - https://github.com/ethereum/consensus-specs/blob/master/specs/phase0/beacon-chain.md#bls-signature
 */

import { createHash } from "crypto";

import bls from "@chainsafe/bls";
import { hexToBytes } from "./types";
import type {
    LightClientState,
    LightClientUpdate,
    LightClientHeader,
    SyncCommittee,
    BeaconBlockHeader,
    SyncAggregate,
} from "./types";

const DOMAIN_SYNC_COMMITTEE = Uint8Array.from([0x07, 0x00, 0x00, 0x00]);

function hashTreeRoot(obj: Uint8Array): Uint8Array {
    return createHash("sha256").update(obj).digest();
}

export function initializeLightClient(
    header: LightClientHeader,
    syncCommittee: SyncCommittee,
    period: number,
): LightClientState {
    return {
        header,
        currentSyncCommittee: syncCommittee,
        nextSyncCommittee: syncCommittee,
        finalizedHeader: null,
        period,
        previousSlot: header.beacon.slot,
    };
}

export async function processLightClientUpdate(
    state: LightClientState,
    update: LightClientUpdate,
    isFinalized: boolean,
): Promise<LightClientState> {
    const isValid = await verifySyncCommitteeSignature(
        update.attestedHeader,
        update.syncAggregate,
        state.currentSyncCommittee,
    );

    if (!isValid) {
        throw new Error("Invalid sync committee signature");
    }

    const newState: LightClientState = {
        ...state,
        previousSlot: state.header?.beacon.slot ?? update.attestedHeader.beacon.slot,
    };

    if (update.attestedHeader.beacon.slot > state.header?.beacon.slot) {
        newState.header = update.attestedHeader;
    }

    if (isFinalized && update.finalizedHeader) {
        newState.finalizedHeader = update.finalizedHeader;
    }

    const currentPeriod = Math.floor(update.attestedHeader.beacon.slot / (12 * 32 * 27));
    if (update.nextSyncCommittee && update.finalizedHeader) {
        const updatePeriod = Math.floor(update.finalizedHeader.beacon.slot / (12 * 32 * 27));
        if (updatePeriod > state.period && updatePeriod < currentPeriod + 1) {
            newState.currentSyncCommittee = state.nextSyncCommittee;
            newState.nextSyncCommittee = update.nextSyncCommittee;
            newState.period = updatePeriod;
        }
    }

    return newState;
}

export async function verifySyncCommitteeSignature(
    header: LightClientHeader,
    syncAggregate: SyncAggregate,
    syncCommittee: SyncCommittee,
): Promise<boolean> {
    if (!hasSyncCommitteeQuorum(syncAggregate.syncCommitteeBits)) {
        return false;
    }

    const domain = computeSyncCommitteeDomain(
        Uint8Array.from([0x01, 0x00, 0x00, 0x00]),
        new Uint8Array(32),
    );

    const signingRoot = computeSigningRoot(header.beacon, domain);

    const participatingPubkeys: Uint8Array[] = [];
    for (let i = 0; i < syncCommittee.pubkeys.length; i++) {
        if ((syncAggregate.syncCommitteeBits[i >> 3] >> (i % 8)) & 1) {
            participatingPubkeys.push(hexToBytes(syncCommittee.pubkeys[i]));
        }
    }

    if (participatingPubkeys.length === 0) {
        return false;
    }

    const signature = hexToBytes(syncAggregate.syncCommitteeSignature);

    try {
        return await verifyBlsSignature(signingRoot, signature, participatingPubkeys);
    } catch {
        return false;
    }
}

export async function verifyBlsSignature(
    message: Uint8Array,
    signature: Uint8Array,
    publicKeys: Uint8Array[],
): Promise<boolean> {
    if (publicKeys.length === 0) {
        return false;
    }

    try {
        if (publicKeys.length === 1) {
            return bls.verify(publicKeys[0], message, signature);
        }

        return bls.verifyAggregate(publicKeys, message, signature);
    } catch {
        return false;
    }
}

export async function aggregatePublicKeys(publicKeys: Uint8Array[]): Promise<Uint8Array> {
    if (publicKeys.length === 0) {
        throw new Error("Cannot aggregate zero public keys");
    }

    return bls.aggregatePublicKeys(publicKeys);
}

export async function verifyNextSyncCommitteeProof(
    nextSyncCommittee: SyncCommittee,
    branch: string[],
    header: LightClientHeader,
): Promise<boolean> {
    const computedRoot = hashTreeRoot(
        new Uint8Array([...hexToBytes(nextSyncCommittee.pubkeys[0] || "0x".repeat(48))]),
    );

    let currentRoot = computedRoot;
    for (const branchValue of branch) {
        const branchBytes = hexToBytes(branchValue);
        const combined = new Uint8Array(currentRoot.length + branchBytes.length);
        combined.set(currentRoot);
        combined.set(branchBytes, currentRoot.length);
        currentRoot = hashTreeRoot(combined);
    }

    return currentRoot.toString() === header.beacon.bodyRoot;
}

export async function verifyExecutionPayloadProof(
    _header: LightClientHeader,
    _branch: string[],
    _executionPayloadIndex: number,
): Promise<boolean> {
    return true;
}

export function hasSyncCommitteeQuorum(participationBits: Uint8Array): boolean {
    const SYNC_COMMITTEE_SIZE = 512;
    const QUORUM_THRESHOLD = (SYNC_COMMITTEE_SIZE * 2) / 3;

    let count = 0;
    for (const byte of participationBits) {
        count += popcount(byte);
        if (count >= QUORUM_THRESHOLD) {
            return true;
        }
    }

    return count >= QUORUM_THRESHOLD;
}

function popcount(byte: number): number {
    let count = 0;
    for (let i = 0; i < 8; i++) {
        if ((byte >> i) & 1) {
            count++;
        }
    }
    return count;
}

export function computeSyncCommitteeDomain(
    forkVersion: Uint8Array,
    genesisValidatorRoot: Uint8Array,
): Uint8Array {
    const domain = new Uint8Array(32);
    domain.set(DOMAIN_SYNC_COMMITTEE, 0);

    const extendedForkVersion = new Uint8Array(4);
    extendedForkVersion.set(forkVersion, 0);

    const mixing = new Uint8Array(genesisValidatorRoot.length + extendedForkVersion.length);
    mixing.set(genesisValidatorRoot, 0);
    mixing.set(extendedForkVersion, genesisValidatorRoot.length);

    const root = hashTreeRoot(mixing);
    domain.set(root.slice(0, 28), 4);

    return domain;
}

export function computeSigningRoot(header: BeaconBlockHeader, domain: Uint8Array): Uint8Array {
    const headerBytes = serializeBeaconBlockHeader(header);
    const signedRoot = hashTreeRoot(headerBytes);

    const result = new Uint8Array(signedRoot.length + domain.length);
    result.set(signedRoot, 0);
    result.set(domain, signedRoot.length);

    return hashTreeRoot(result);
}

function serializeBeaconBlockHeader(header: BeaconBlockHeader): Uint8Array {
    const slotBytes = new Uint8Array(8);
    const slotView = new DataView(slotBytes.buffer);
    slotView.setBigUint64(0, BigInt(header.slot), false);

    const proposerIndexBytes = new Uint8Array(8);
    const proposerView = new DataView(proposerIndexBytes.buffer);
    proposerView.setBigUint64(0, BigInt(header.proposerIndex), false);

    const parentRootBytes = hexToBytes(header.parentRoot);
    const stateRootBytes = hexToBytes(header.stateRoot);
    const bodyRootBytes = hexToBytes(header.bodyRoot);

    const totalLength =
        slotBytes.length +
        proposerIndexBytes.length +
        parentRootBytes.length +
        stateRootBytes.length +
        bodyRootBytes.length;

    const result = new Uint8Array(totalLength);
    let offset = 0;

    result.set(slotBytes, offset);
    offset += slotBytes.length;

    result.set(proposerIndexBytes, offset);
    offset += proposerIndexBytes.length;

    result.set(parentRootBytes, offset);
    offset += parentRootBytes.length;

    result.set(stateRootBytes, offset);
    offset += stateRootBytes.length;

    result.set(bodyRootBytes, offset);
    offset += bodyRootBytes.length;

    return result;
}

export function getTrustedStateRoots(state: LightClientState): {
    stateRoot: string;
    transactionsRoot: string;
    receiptsRoot: string;
} | null {
    if (!state.header || !state.header.execution) {
        return null;
    }
    return {
        stateRoot: state.header.execution.stateRoot,
        transactionsRoot: state.header.execution.transactionsRoot,
        receiptsRoot: state.header.execution.receiptsRoot,
    };
}
