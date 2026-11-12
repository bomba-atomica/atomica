// SCOUT(#237) REMOVE: whole file (beacon light client test).
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { startTestnet, stopTestnet, waitForBlocks } from "../helpers/testnet";
import {
    BEACON_CONFIGS,
    fetchLightClientUpdates,
    fetchLightClientOptimisticUpdate,
    fetchLightClientFinalityUpdate,
} from "../../src/beacon/fetch";

const ON_ANVIL = (process.env.ETH_BACKEND ?? "").trim().toLowerCase() === "anvil";

describe("Light Client Integration", () => {
    // Local beacon API endpoint
    const BEACON_API_URL = "http://localhost:5052";

    beforeAll(async () => {
        try {
            await startTestnet();
        } catch (e) {
            // Only the docker-only test below needs the chain. On docker a failed
            // start must fail the suite, never turn into a silent pass.
            if (!ON_ANVIL) throw e;
            console.log("Could not start anvil testnet; the beacon test is skipped on anvil");
        }
    }, 120000); // Increased timeout for testnet startup (2 minutes)

    afterAll(async () => {
        await stopTestnet();
    }, 60000);

    describe("Full Sync Workflow", () => {
        test("should verify config constants", () => {
            // Verify config is correct
            expect(BEACON_CONFIGS.mainnet.epochsPerSyncCommitteePeriod).toBe(256);
            expect(BEACON_CONFIGS.mainnet.slotsPerEpoch).toBe(32);

            // Calculate expected values
            const slotsPerPeriod =
                BEACON_CONFIGS.mainnet.epochsPerSyncCommitteePeriod *
                BEACON_CONFIGS.mainnet.slotsPerEpoch;
            expect(slotsPerPeriod).toBe(8192);
        });

        // The beacon API exists only on the Docker PoS chain. On anvil this
        // test is reported as skipped, never as passed.
        test.skipIf(ON_ANVIL)(
            "should fetch and process updates from local beacon node [docker only]",
            async () => {
                // The node must answer. An unreachable node fails the test.
                const health = await fetch(`${BEACON_API_URL}/eth/v1/node/health`);
                expect(health.status).toBeLessThan(500);

                console.log("Waiting for block production (2 blocks)...");
                await waitForBlocks(2);

                // A fresh chain answers 404 until the light client server has a sync
                // aggregate. Retry 404s until the deadline, then fail.
                console.log(`Fetching optimistic update from ${BEACON_API_URL}...`);
                const deadline = Date.now() + 120_000;
                let optimisticUpdate;
                for (;;) {
                    try {
                        optimisticUpdate = await fetchLightClientOptimisticUpdate(BEACON_API_URL);
                        break;
                    } catch (error) {
                        const is404 = error instanceof Error && error.message.includes("404");
                        if (!is404 || Date.now() >= deadline) throw error;
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                }
                expect(optimisticUpdate).toBeDefined();
                expect(optimisticUpdate.signatureSlot).toBeGreaterThan(0);

                // Finality needs two justified epochs, which a fresh testnet may not
                // have yet. This is the one fetch allowed to be unavailable.
                try {
                    const finalityUpdate = await fetchLightClientFinalityUpdate(BEACON_API_URL);
                    expect(finalityUpdate).toBeDefined();
                } catch (_e) {
                    console.log(
                        "Finality update not available yet (expected for fresh local testnet)",
                    );
                }

                const currentPeriod = Math.floor(
                    optimisticUpdate.attestedHeader.beacon.slot / (32 * 256),
                );
                const targetPeriod = currentPeriod > 0 ? currentPeriod - 1 : currentPeriod;
                const updates = await fetchLightClientUpdates(BEACON_API_URL, targetPeriod, 1);
                expect(Array.isArray(updates)).toBe(true);
                if (updates.length > 0) {
                    const update = updates[0];
                    expect(update.attestedHeader).toBeDefined();
                    expect(update.syncAggregate).toBeDefined();
                }

                console.log("Local Beacon API tests passed (connectivity and format check)");
            },
            240000,
        ); // Covers block wait plus the light client retry window
    });
});
