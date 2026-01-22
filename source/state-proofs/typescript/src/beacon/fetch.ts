/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Beacon API Fetcher
 *
 * Fetches light client data from Ethereum beacon chain APIs.
 *
 * Supported endpoints:
 * - Light client bootstrap (initial sync)
 * - Light client updates (periodic sync)
 * - Finality updates (finalized blocks)
 * - Optimistic updates (head updates)
 */

import type {
    LightClientBootstrap,
    LightClientUpdate,
    BeaconBlockHeader,
    ExecutionPayloadHeader,
    LightClientHeader,
    SyncCommittee,
    SyncAggregate,
} from "./types";

/**
 * Beacon chain configuration
 */
export interface BeaconConfig {
    name: "mainnet" | "sepolia" | "holesky" | "local";
    genesisTime: number;
    secondsPerSlot: number;
    slotsPerEpoch: number;
    epochsPerSyncCommitteePeriod: number;
}

export const BEACON_CONFIGS: Record<string, BeaconConfig> = {
    mainnet: {
        name: "mainnet",
        genesisTime: 1606824022,
        secondsPerSlot: 12,
        slotsPerEpoch: 32,
        epochsPerSyncCommitteePeriod: 256,
    },
    sepolia: {
        name: "sepolia",
        genesisTime: 1655733600,
        secondsPerSlot: 12,
        slotsPerEpoch: 32,
        epochsPerSyncCommitteePeriod: 256,
    },
    holesky: {
        name: "holesky",
        genesisTime: 1695907200,
        secondsPerSlot: 12,
        slotsPerEpoch: 32,
        epochsPerSyncCommitteePeriod: 256,
    },
    local: {
        name: "local",
        genesisTime: 0, // Should be set dynamically for local testnet
        secondsPerSlot: 12,
        slotsPerEpoch: 32,
        epochsPerSyncCommitteePeriod: 256,
    },
};

interface BeaconAPIResponse<T> {
    data: T;
    execution_optimistic: boolean;
    finalized: boolean;
}

/**
 * Convert hex string to bytes
 */
function hexToUint8Array(hex: string): Uint8Array {
    if (hex.startsWith("0x")) {
        hex = hex.slice(2);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Parse beacon API response
 */
async function fetchBeaconApi<T>(apiUrl: string, endpoint: string): Promise<T> {
    const response = await fetch(`${apiUrl}${endpoint}`, {
        headers: { Accept: "application/json" },
    });

    if (!response.ok) {
        throw new Error(`Beacon API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data as T;
}

/**
 * Parse execution payload header from beacon API
 */
function parseExecutionPayload(exec: {
    parent_hash: string;
    fee_recipient: string;
    state_root: string;
    receipts_root: string;
    logs_bloom: string;
    prev_randao: string;
    block_number: string;
    gas_limit: string;
    gas_used: string;
    timestamp: string;
    extra_data: string;
    base_fee_per_gas: string;
    block_hash: string;
    transactions_root: string;
    withdrawals_root: string;
}): ExecutionPayloadHeader {
    return {
        parentHash: exec.parent_hash,
        feeRecipient: exec.fee_recipient,
        stateRoot: exec.state_root,
        receiptsRoot: exec.receipts_root,
        logsBloom: exec.logs_bloom,
        prevRandao: exec.prev_randao,
        blockNumber: parseInt(exec.block_number, 10),
        gasLimit: parseInt(exec.gas_limit, 10),
        gasUsed: parseInt(exec.gas_used, 10),
        timestamp: parseInt(exec.timestamp, 10),
        extraData: exec.extra_data,
        baseFeePerGas: BigInt(exec.base_fee_per_gas || 0),
        blockHash: exec.block_hash,
        transactionsRoot: exec.transactions_root,
        withdrawalsRoot: exec.withdrawals_root,
    };
}

/**
 * Fetch light client bootstrap for initial sync
 *
 * @param apiUrl - Beacon API URL
 * @param blockRoot - Trusted block root (usually genesis or checkpoint)
 * @returns LightClientBootstrap response
 */
export async function fetchLightClientBootstrap(
    apiUrl: string,
    blockRoot: string,
): Promise<LightClientBootstrap> {
    const response = await fetchBeaconApi<
        BeaconAPIResponse<{
            header: {
                beacon: {
                    slot: string;
                    proposer_index: string;
                    parent_root: string;
                    state_root: string;
                    body_root: string;
                };
                execution: any;
                execution_branch?: string[];
            };
            current_sync_committee: {
                pubkeys: string[];
                aggregate_pubkey: string;
            };
            current_sync_committee_branch: string[];
        }>
    >(apiUrl, `/eth/v1/beacon/light_client/bootstrap/${blockRoot.replace("0x", "")}`);

    const data = response.data;

    const header: LightClientHeader = {
        beacon: {
            slot: parseInt(data.header.beacon.slot, 10),
            proposerIndex: parseInt(data.header.beacon.proposer_index, 10),
            parentRoot: data.header.beacon.parent_root,
            stateRoot: data.header.beacon.state_root,
            bodyRoot: data.header.beacon.body_root,
        },
        execution: parseExecutionPayload(data.header.execution),
        executionBranch: (data as any).header_branch || data.header.execution_branch || [],
    };

    const syncCommittee: SyncCommittee = {
        pubkeys: data.current_sync_committee.pubkeys,
        aggregatePubkey: data.current_sync_committee.aggregate_pubkey,
    };

    return {
        header,
        currentSyncCommittee: syncCommittee,
        currentSyncCommitteeBranch: data.current_sync_committee_branch,
    };
}

/**
 * Fetch light client updates for a period range
 *
 * @param apiUrl - Beacon API URL
 * @param startPeriod - Starting sync committee period
 * @param count - Number of periods to fetch
 * @returns Array of LightClientUpdate responses
 */
export async function fetchLightClientUpdates(
    apiUrl: string,
    startPeriod: number,
    count: number,
): Promise<LightClientUpdate[]> {
    const updates: LightClientUpdate[] = [];

    for (let i = 0; i < count; i++) {
        const period = startPeriod + i;
        try {
            const update = await fetchLightClientUpdateByPeriod(apiUrl, period);
            if (update) {
                updates.push(update);
            }
        } catch (error) {
            console.warn(
                `Failed to fetch update for period ${period}:`,
                error instanceof Error ? error.message : error,
            );
        }
    }

    return updates;
}

/**
 * Fetch a single light client update by period
 */
async function fetchLightClientUpdateByPeriod(
    apiUrl: string,
    period: number,
): Promise<LightClientUpdate | null> {
    const response = await fetchBeaconApi<BeaconAPIResponse<{
        version: string;
        attested_header: {
            beacon: {
                slot: string;
                proposer_index: string;
                parent_root: string;
                state_root: string;
                body_root: string;
            };
            execution: any;
            execution_branch?: string[];
        };
        attested_header_branch?: string[];
        next_sync_committee?: {
            pubkeys: string[];
            aggregate_pubkey: string;
        };
        next_sync_committee_branch?: string[];
        finalized_header?: {
            beacon: {
                slot: string;
                proposer_index: string;
                parent_root: string;
                state_root: string;
                body_root: string;
            };
            execution: any;
            execution_branch?: string[];
        };
        finality_branch?: string[];
        sync_aggregate: {
            sync_committee_bits: string;
            sync_committee_signature: string;
        };
        signature_slot: string;
    }> | null>(apiUrl, `/eth/v1/beacon/light_client/updates/${period}?count=1`);

    if (!response || !response.data) {
        return null;
    }

    const data = response.data;

    const parseHeader = (msg: {
        slot: string;
        proposer_index: string;
        parent_root: string;
        state_root: string;
        body_root: string;
    }): BeaconBlockHeader => ({
        slot: parseInt(msg.slot, 10),
        proposerIndex: parseInt(msg.proposer_index, 10),
        parentRoot: msg.parent_root,
        stateRoot: msg.state_root,
        bodyRoot: msg.body_root,
    });

    const attestedHeader: LightClientHeader = {
        beacon: parseHeader(data.attested_header.beacon),
        execution: parseExecutionPayload(data.attested_header.execution),
        executionBranch:
            data.attested_header_branch || (data.attested_header as any).execution_branch || [],
    };

    const nextSyncCommittee: SyncCommittee | null = data.next_sync_committee
        ? {
              pubkeys: data.next_sync_committee.pubkeys,
              aggregatePubkey: data.next_sync_committee.aggregate_pubkey,
          }
        : null;

    const syncAggregate: SyncAggregate = {
        syncCommitteeBits: hexToUint8Array(data.sync_aggregate.sync_committee_bits),
        syncCommitteeSignature: data.sync_aggregate.sync_committee_signature,
    };

    return {
        attestedHeader,
        nextSyncCommittee,
        nextSyncCommitteeBranch: data.next_sync_committee_branch || [],
        finalizedHeader: data.finalized_header
            ? {
                  beacon: parseHeader(data.finalized_header.beacon),
                  execution: parseExecutionPayload(data.finalized_header.execution),
                  executionBranch:
                      (data as any).finalized_header_branch ||
                      (data.finalized_header as any).execution_branch ||
                      [],
              }
            : null,
        finalityBranch: data.finality_branch || [],
        syncAggregate,
        signatureSlot: parseInt(data.signature_slot, 10),
    };
}

/**
 * Fetch light client finality update
 *
 * @param apiUrl - Beacon API URL
 * @returns LightClientUpdate with finality information
 */
export async function fetchLightClientFinalityUpdate(apiUrl: string): Promise<LightClientUpdate> {
    const response = await fetchBeaconApi<
        BeaconAPIResponse<{
            attested_header: {
                beacon: {
                    slot: string;
                    proposer_index: string;
                    parent_root: string;
                    state_root: string;
                    body_root: string;
                };
                execution: any;
            };
            next_sync_committee?: {
                pubkeys: string[];
                aggregate_pubkey: string;
            };
            next_sync_committee_branch?: string[];
            finalized_header: {
                beacon: {
                    slot: string;
                    proposer_index: string;
                    parent_root: string;
                    state_root: string;
                    body_root: string;
                };
                execution: any;
            };
            finality_branch: string[];
            sync_aggregate: {
                sync_committee_bits: string;
                sync_committee_signature: string;
            };
            signature_slot: string;
        }>
    >(apiUrl, "/eth/v1/beacon/light_client/finality_update");

    const data = response.data;

    const parseHeader = (msg: {
        slot: string;
        proposer_index: string;
        parent_root: string;
        state_root: string;
        body_root: string;
    }): BeaconBlockHeader => ({
        slot: parseInt(msg.slot, 10),
        proposerIndex: parseInt(msg.proposer_index, 10),
        parentRoot: msg.parent_root,
        stateRoot: msg.state_root,
        bodyRoot: msg.body_root,
    });

    const attestedHeader: LightClientHeader = {
        beacon: parseHeader(data.attested_header.beacon),
        execution: parseExecutionPayload(data.attested_header.execution),
        executionBranch: (data.attested_header as any).execution_branch || [],
    };

    const nextSyncCommittee: SyncCommittee | null = data.next_sync_committee
        ? {
              pubkeys: data.next_sync_committee.pubkeys,
              aggregatePubkey: data.next_sync_committee.aggregate_pubkey,
          }
        : null;

    const syncAggregate: SyncAggregate = {
        syncCommitteeBits: hexToUint8Array(data.sync_aggregate.sync_committee_bits),
        syncCommitteeSignature: data.sync_aggregate.sync_committee_signature,
    };

    return {
        attestedHeader,
        nextSyncCommittee,
        nextSyncCommitteeBranch: data.next_sync_committee_branch || [],
        finalizedHeader: {
            beacon: parseHeader(data.finalized_header.beacon),
            execution: parseExecutionPayload(data.finalized_header.execution),
            executionBranch: (data.finalized_header as any).execution_branch || [],
        },
        finalityBranch: data.finality_branch,
        syncAggregate,
        signatureSlot: parseInt(data.signature_slot, 10),
    };
}

/**
 * Fetch light client optimistic update
 *
 * @param apiUrl - Beacon API URL
 * @returns LightClientUpdate for head block
 */
export async function fetchLightClientOptimisticUpdate(apiUrl: string): Promise<LightClientUpdate> {
    const response = await fetchBeaconApi<
        BeaconAPIResponse<{
            attested_header: {
                beacon: {
                    slot: string;
                    proposer_index: string;
                    parent_root: string;
                    state_root: string;
                    body_root: string;
                };
                execution: any;
            };
            next_sync_committee?: {
                pubkeys: string[];
                aggregate_pubkey: string;
            };
            next_sync_committee_branch?: string[];
            sync_aggregate: {
                sync_committee_bits: string;
                sync_committee_signature: string;
            };
            signature_slot: string;
        }>
    >(apiUrl, "/eth/v1/beacon/light_client/optimistic_update");

    const data = response.data;

    const parseHeader = (msg: {
        slot: string;
        proposer_index: string;
        parent_root: string;
        state_root: string;
        body_root: string;
    }): BeaconBlockHeader => ({
        slot: parseInt(msg.slot, 10),
        proposerIndex: parseInt(msg.proposer_index, 10),
        parentRoot: msg.parent_root,
        stateRoot: msg.state_root,
        bodyRoot: msg.body_root,
    });

    const attestedHeader: LightClientHeader = {
        beacon: parseHeader(data.attested_header.beacon),
        execution: parseExecutionPayload(data.attested_header.execution),
        executionBranch: (data.attested_header as any).execution_branch || [],
    };

    const nextSyncCommittee: SyncCommittee | null = data.next_sync_committee
        ? {
              pubkeys: data.next_sync_committee.pubkeys,
              aggregatePubkey: data.next_sync_committee.aggregate_pubkey,
          }
        : null;

    const syncAggregate: SyncAggregate = {
        syncCommitteeBits: hexToUint8Array(data.sync_aggregate.sync_committee_bits),
        syncCommitteeSignature: data.sync_aggregate.sync_committee_signature,
    };

    return {
        attestedHeader,
        nextSyncCommittee,
        nextSyncCommitteeBranch: data.next_sync_committee_branch || [],
        finalizedHeader: null,
        finalityBranch: [],
        syncAggregate,
        signatureSlot: parseInt(data.signature_slot, 10),
    };
}

/**
 * Fetch beacon block header by slot
 *
 * @param apiUrl - Beacon API URL
 * @param slot - Block slot number
 * @returns BeaconBlockHeader
 */
export async function fetchBeaconBlockHeader(
    apiUrl: string,
    slot: number,
): Promise<BeaconBlockHeader> {
    const response = await fetchBeaconApi<
        BeaconAPIResponse<{
            beacon: {
                slot: string;
                proposer_index: string;
                parent_root: string;
                state_root: string;
                body_root: string;
            };
            signature: string;
        }>
    >(apiUrl, `/eth/v1/beacon/blocks/${slot}/root`);

    const data = response.data;

    return {
        slot: parseInt(data.beacon.slot, 10),
        proposerIndex: parseInt(data.beacon.proposer_index, 10),
        parentRoot: data.beacon.parent_root,
        stateRoot: data.beacon.state_root,
        bodyRoot: data.beacon.body_root,
    };
}

/**
 * Calculate sync committee period from slot
 *
 * @param slot - Block slot number
 * @param config - Beacon chain configuration
 * @returns Sync committee period number
 */
export function computeSyncCommitteePeriod(slot: number, config: BeaconConfig): number {
    const epoch = Math.floor(slot / config.slotsPerEpoch);
    return Math.floor(epoch / config.epochsPerSyncCommitteePeriod);
}

/**
 * Get public beacon API URLs
 *
 * Note: These are public endpoints for production/demo use.
 * Tests should typically use a local beacon node (e.g. http://localhost:5052).
 */
export function getBeaconApiUrls(chain: string): string[] {
    switch (chain) {
        case "mainnet":
            return ["https://beaconcha.in/api/v1", "https://www.lightclientdata.org/api/v1"];
        case "sepolia":
            return ["https://checkpoint-sync.sepolia.beaconcha.in/api/v1"];
        case "holesky":
            return ["https://checkpoint-sync.holesky.beaconcha.in/api/v1"];
        default:
            throw new Error(`Unknown chain: ${chain}`);
    }
}
