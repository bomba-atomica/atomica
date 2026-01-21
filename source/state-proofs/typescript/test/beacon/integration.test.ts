import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { startTestnet, stopTestnet, waitForBlocks } from "../helpers/testnet";
import {
    BEACON_CONFIGS,
    fetchLightClientUpdates,
    fetchLightClientOptimisticUpdate,
    fetchLightClientFinalityUpdate,
} from "../../src/beacon/fetch";

describe("Light Client Integration", () => {
    // Local beacon API endpoint
    const BEACON_API_URL = "http://localhost:5052";

    // Setup testnet if possible
    beforeAll(async () => {
        try {
            await startTestnet();
        } catch (_e) {
            console.log("Could not start testnet, tests may skip if node is not running");
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

        test("should fetch and process updates from local beacon node", async () => {
            // Check if node is reachable
            try {
                await fetch(`${BEACON_API_URL}/eth/v1/node/health`);
            } catch (_e) {
                console.log(
                    `Skipping Beacon API test: Beacon node not reachable at ${BEACON_API_URL}`,
                );
                return;
            }

            // Wait for some blocks to be produced so light client data is available
            try {
                console.log("Waiting for block production (2 blocks)...");
                await waitForBlocks(2);
            } catch (_e) {
                console.log("Warning: Waiting for blocks timed out or failed");
            }

            try {
                // 1. Fetch Optimistic Update
                console.log(`Fetching optimistic update from ${BEACON_API_URL}...`);
                const optimisticUpdate = await fetchLightClientOptimisticUpdate(BEACON_API_URL);
                expect(optimisticUpdate).toBeDefined();
                expect(optimisticUpdate.signatureSlot).toBeGreaterThan(0);

                // 2. Fetch Finality Update (might fail on fresh testnet, so we wrap it)
                try {
                    const finalityUpdate = await fetchLightClientFinalityUpdate(BEACON_API_URL);
                    expect(finalityUpdate).toBeDefined();
                } catch (_e) {
                    console.log(
                        "Finality update not available yet (expected for fresh local testnet)",
                    );
                }

                // 3. Test Fetch Updates
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
            } catch (error) {
                // Handle 404 specifically for fresh testnets
                if (error instanceof Error && error.message.includes("404")) {
                    console.log(
                        "Light client data not available yet (404). This is normal for a freshly started local testnet.",
                    );
                    return;
                }

                // If we reach here, something actually broke in the fetch logic despite the node being up
                console.error(
                    "Beacon API test failed:",
                    error instanceof Error ? error.message : error,
                );
                throw error; // Fail the test
            }
        }, 60000); // Increased timeout for fetch operations
    });
});
