/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, mock, spyOn, afterEach } from "bun:test";
import { syncLightClient, type LightClientConfig } from "../../src/beacon/cli";
import type { LightClientState, LightClientUpdate } from "../../src/beacon/types";
import * as fetcher from "../../src/beacon/fetch";
import * as sync from "../../src/beacon/sync";

const SLOTS_PER_PERIOD = 32 * 256;

// Mock data helpers
const createMockState = (period: number, slot: number): LightClientState => ({
    header: { beacon: { slot } } as any,
    currentSyncCommittee: { pubkeys: ["0x01"], aggregatePubkey: "0x01" } as any,
    nextSyncCommittee: { pubkeys: ["0x02"], aggregatePubkey: "0x02" } as any,
    finalizedHeader: null,
    period,
    previousSlot: slot,
});

const createMockUpdate = (period: number): LightClientUpdate => {
    // Create an update that is signed in the middle of period + 1
    // This allows it to finalize a header in period + 1
    const signatureSlot = (period + 1) * SLOTS_PER_PERIOD + 100;
    const finalizedSlot = (period + 1) * SLOTS_PER_PERIOD + 50;

    return {
        attestedHeader: { beacon: { slot: signatureSlot - 1 } } as any,
        nextSyncCommittee: {
            pubkeys: [`0x${period + 2}`],
            aggregatePubkey: `0x${period + 2}`,
        } as any,
        nextSyncCommitteeBranch: [],
        finalizedHeader: { beacon: { slot: finalizedSlot } } as any,
        finalityBranch: [],
        syncAggregate: {
            syncCommitteeBits: new Uint8Array(64).fill(0xff),
            syncCommitteeSignature: "0x",
        } as any,
        signatureSlot,
    };
};

describe("Light Client Sync Logic", () => {
    afterEach(() => mock.restore());

    test("should sync across multiple periods", async () => {
        // Setup: Client is at Period 0. Chain is at Period 2.

        const config: LightClientConfig = {
            beaconApiUrl: "http://mock",
            chain: "mainnet",
            verbose: true,
        };

        const initialState = createMockState(0, 100);

        // Target: Period 2 update (signed in Period 3, finalizing Period 2?)
        // Or just the Finality Update is for Period 2.
        const finalityUpdate = createMockUpdate(2);

        // Mock crypto verification to always pass
        spyOn(sync, "verifySyncCommitteeSignature").mockResolvedValue(true);

        // Mock fetches
        spyOn(fetcher, "fetchLightClientFinalityUpdate").mockResolvedValue(finalityUpdate);

        const updatesSpy = spyOn(fetcher, "fetchLightClientUpdates").mockImplementation(
            async (_url, startPeriod, count) => {
                const updates = [];
                for (let i = 0; i < count; i++) {
                    updates.push(createMockUpdate(startPeriod + i));
                }
                return updates;
            },
        );

        // Run Sync
        const syncedState = await syncLightClient(initialState, config);

        expect(syncedState.period).toBe(3); // Update 2 sets period to 3?
        // createMockUpdate(2) -> signature in Period 3. finalized in Period 3.
        // If finalityUpdate is used, it sets state to Period 3.

        expect(updatesSpy).toHaveBeenCalled();

        // We expect it to fetch updates for Period 0 and Period 1
        // Period 0 update -> moves to Period 1
        // Period 1 update -> moves to Period 2
        // Finality update (Period 2) -> moves to Period 3

        // Check ranges
        // fetch(0, 2) ?
        // Or fetch(0, 3) ?
        // initialState period 0. targetPeriod (from finalityUpdate) = 3 (signature is in Period 3)
        // So it fetches 0, 1, 2.
    });
});
