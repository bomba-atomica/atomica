/**
 * Light Client CLI Integration
 *
 * Provides utilities for integrating light client verification into CLI commands.
 */

import type {
    LightClientState,
    LightClientUpdate,
    LightClientHeader,
    SyncCommittee,
    LightClientStore,
} from "./types";

import {
    fetchLightClientBootstrap,
    fetchLightClientUpdates,
    fetchLightClientFinalityUpdate,
    BEACON_CONFIGS,
    computeSyncCommitteePeriod,
} from "./fetch";
import { initializeLightClient, processLightClientUpdate, getTrustedStateRoots } from "./sync";
import { isUpdateNewer, saveState, loadState, clearState } from "./state";

export interface LightClientConfig {
    /** Beacon API URL */
    beaconApiUrl: string;
    /** Beacon chain network (mainnet, sepolia, holesky) */
    chain: string;
    /** Checkpoint block root to bootstrap from (optional, uses genesis if not provided) */
    checkpointRoot?: string;
    /** Path to persist light client state */
    statePath?: string;
    /** Verbose output */
    verbose?: boolean;
}

export interface TrustedStateRoots {
    /** Execution state root (replaces RPC stateRoot) */
    stateRoot: string;
    /** Transactions root (replaces RPC transactionsRoot) */
    transactionsRoot: string;
    /** Receipts root (replaces RPC receiptsRoot) */
    receiptsRoot: string;
}

export interface LightClientVerificationResult {
    /** Whether verification succeeded */
    valid: boolean;
    /** Trusted state roots to use instead of RPC values */
    roots: TrustedStateRoots | null;
    /** Header that was verified */
    header: LightClientHeader | null;
    /** Any error message */
    error?: string;
}

/**
 * Initialize or load a light client state
 */
export async function initLightClient(config: LightClientConfig): Promise<LightClientState | null> {
    const chainConfig = BEACON_CONFIGS[config.chain as keyof typeof BEACON_CONFIGS];

    if (!chainConfig) {
        throw new Error(`Unknown chain: ${config.chain}. Supported: mainnet, sepolia, holesky`);
    }

    if (config.verbose) {
        console.log(`[LightClient] Initializing for ${config.chain}...`);
    }

    // Try to load persisted state first
    const loadedStore = await loadState();
    if (loadedStore) {
        if (config.verbose) {
            console.log(`[LightClient] Loaded persisted state`);
            console.log(
                `[LightClient] Current period: ${loadedStore.state.period}, Slot: ${loadedStore.state.header.beacon.slot}`,
            );
        }
        return loadedStore.state;
    }

    // Initialize from genesis bootstrap
    if (config.verbose) {
        console.log(`[LightClient] Fetching bootstrap from ${config.beaconApiUrl}...`);
    }

    const bootstrap = await fetchLightClientBootstrap(
        config.beaconApiUrl,
        config.checkpointRoot ||
            "0x0000000000000000000000000000000000000000000000000000000000000000",
    );

    if (!bootstrap || !bootstrap.header) {
        throw new Error("Failed to fetch light client bootstrap");
    }

    const period = computeSyncCommitteePeriod(bootstrap.header.beacon.slot, chainConfig);

    if (config.verbose) {
        console.log(`[LightClient] Bootstrap received`);
        console.log(`[LightClient] Slot: ${bootstrap.header.beacon.slot}, Period: ${period}`);
    }

    const state = initializeLightClient(bootstrap.header, bootstrap.currentSyncCommittee, period);

    const store: LightClientStore = {
        state,
        lastUpdated: Date.now(),
    };

    // Persist initial state
    await saveState(store);
    if (config.verbose) {
        console.log(`[LightClient] Saved initial state`);
    }

    return state;
}

/**
 * Sync light client to latest available update
 */
export async function syncLightClient(
    state: LightClientState,
    config: LightClientConfig,
): Promise<LightClientState> {
    const chainConfig = BEACON_CONFIGS[config.chain as keyof typeof BEACON_CONFIGS];

    if (!chainConfig) {
        throw new Error(`Unknown chain: ${config.chain}`);
    }

    let currentState = state;
    let synced = false;

    // 1. Determine target period from finality update (without verifying yet)
    // We fetch this to know how far ahead the chain is
    let finalityUpdate: LightClientUpdate | null = null;
    let targetPeriod = currentState.period;

    if (config.verbose) {
        console.log(`[LightClient] Fetching finality update to determine head...`);
    }

    try {
        finalityUpdate = await fetchLightClientFinalityUpdate(config.beaconApiUrl);
        if (finalityUpdate) {
            targetPeriod = computeSyncCommitteePeriod(
                finalityUpdate.attestedHeader.beacon.slot,
                chainConfig,
            );
            if (config.verbose) {
                console.log(
                    `[LightClient] Network is at period ${targetPeriod} (slot ${finalityUpdate.attestedHeader.beacon.slot})`,
                );
            }
        }
    } catch (error) {
        if (config.verbose) {
            console.log(`[LightClient] Could not fetch finality update: ${error}`);
        }
    }

    // 2. Fetch period updates if we are behind
    // We iterate until we catch up to the target period
    // Note: We might need multiple rounds if the target period increases while we sync
    if (currentState.period < targetPeriod) {
        if (config.verbose) {
            console.log(
                `[LightClient] Syncing from period ${currentState.period} to ${targetPeriod}...`,
            );
        }

        try {
            // Fetch updates in batches
            const startPeriod = currentState.period;
            const count = targetPeriod - startPeriod;

            const updates = await fetchLightClientUpdates(config.beaconApiUrl, startPeriod, count);

            for (const update of updates) {
                if (isUpdateNewer(update, currentState)) {
                    // Check if this update allows us to advance periods
                    // Ideally we verify it sequentially
                    const isFinalized = !!update.finalizedHeader;
                    try {
                        currentState = await processLightClientUpdate(
                            currentState,
                            update,
                            isFinalized,
                        );
                        synced = true;

                        if (config.verbose) {
                            console.log(
                                `[LightClient] Advanced to period ${currentState.period} (slot ${currentState.header.beacon.slot})`,
                            );
                        }
                    } catch (e) {
                        console.warn(`[LightClient] Failed to process update for period:`, e);
                        // Stop processing if we break the chain
                        break;
                    }
                }
            }
        } catch (error) {
            if (config.verbose) {
                console.log(`[LightClient] Could not fetch period updates: ${error}`);
            }
        }
    }

    // 3. Process finality update (now that we hopefully have the right committee)
    if (finalityUpdate && isUpdateNewer(finalityUpdate, currentState)) {
        if (config.verbose) {
            console.log(`[LightClient] Processing finality update...`);
        }

        try {
            const isFinalized = !!finalityUpdate.finalizedHeader;
            currentState = await processLightClientUpdate(
                currentState,
                finalityUpdate,
                isFinalized,
            );
            synced = true;
            if (config.verbose) {
                console.log(`[LightClient] Synced to finalized head`);
            }
        } catch (error) {
            // This is expected if we failed to catch up the sync committee
            if (config.verbose) {
                console.log(
                    `[LightClient] Could not verify finality update (may be missing sync committee): ${error}`,
                );
            }
        }
    }

    // Persist updated state
    if (synced) {
        const store: LightClientStore = {
            state: currentState,
            lastUpdated: Date.now(),
        };
        await saveState(store);
        if (config.verbose) {
            console.log(`[LightClient] Updated persisted state`);
        }
    }

    return currentState;
}

/**
 * Verify and get trusted state roots from light client
 */
export async function verifyWithLightClient(
    rpcBlockHash: string,
    config: LightClientConfig,
): Promise<LightClientVerificationResult> {
    try {
        // Initialize or load light client
        let state = await initLightClient(config);

        if (!state) {
            return {
                valid: false,
                roots: null,
                header: null,
                error: "Failed to initialize light client",
            };
        }

        // Sync to latest
        state = await syncLightClient(state, config);

        // Verify the block hash matches our trusted header
        const trustedBlockHash = state.header?.execution?.blockHash;

        if (!trustedBlockHash) {
            return {
                valid: false,
                roots: null,
                header: null,
                error: "Light client header missing execution payload",
            };
        }

        const isMatch = trustedBlockHash.toLowerCase() === rpcBlockHash.toLowerCase();

        if (!isMatch) {
            if (config.verbose) {
                console.log(`[LightClient] Block hash mismatch:`);
                console.log(`  Trusted:  ${trustedBlockHash}`);
                console.log(`  RPC:      ${rpcBlockHash}`);
            }
            return {
                valid: false,
                roots: null,
                header: state.header,
                error: `Block hash mismatch: RPC ${rpcBlockHash.slice(0, 16)}... != Light Client ${trustedBlockHash.slice(0, 16)}...`,
            };
        }

        // Get trusted state roots
        const roots = getTrustedStateRoots(state);

        if (!roots) {
            return {
                valid: false,
                roots: null,
                header: state.header,
                error: "Light client state missing execution header",
            };
        }

        return {
            valid: true,
            roots,
            header: state.header,
        };
    } catch (error) {
        return {
            valid: false,
            roots: null,
            header: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Clear persisted light client state
 */
export async function clearLightClientState(): Promise<void> {
    await clearState();
}

export type { LightClientState, LightClientUpdate, LightClientHeader, SyncCommittee };
