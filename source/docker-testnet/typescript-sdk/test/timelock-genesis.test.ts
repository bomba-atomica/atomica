/**
 * Timelock genesis test.
 *
 * generate-genesis.sh sets the atomica-aptos layout flag timelock_dkg_enabled,
 * so the timelock DKG runs at the first reconfiguration. This test starts 4
 * validators, waits for epoch 2 and checks that ibe_config holds a ready
 * timelock key: is_ready() is true and get_mpk() is a 96-byte G2 point.
 * See docs/decisions/aptos-validator-timelock.md (Docker testnet epoch policy).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AptosClient } from "aptos";
import type { DockerTestnet } from "../src/index";
import {
    initializeTestnet,
    performCleanup,
    registerCleanupHandlers,
    setGlobalTestnet,
} from "./helpers/testnet-lifecycle";

registerCleanupHandlers();

const NUM_VALIDATORS = 4;
const TARGET_EPOCH = 2;
/** Compressed BLS12-381 G2 point length (ibe_config::G2_COMPRESSED_LENGTH). */
const MPK_LENGTH_BYTES = 96;

async function waitFor<T>(
    what: string,
    timeoutSecs: number,
    probe: () => Promise<T | undefined>,
): Promise<T> {
    const deadline = Date.now() + timeoutSecs * 1000;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            const value = await probe();
            if (value !== undefined) return value;
        } catch (e) {
            lastError = e;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`Timed out after ${timeoutSecs}s waiting for ${what}: ${String(lastError)}`);
}

describe("Timelock genesis", () => {
    let testnet: DockerTestnet;
    let client: AptosClient;

    beforeAll(async () => {
        testnet = await initializeTestnet(NUM_VALIDATORS);
        client = new AptosClient(testnet.validatorApiUrl(0));
    }, 300000);

    afterAll(async () => {
        await performCleanup("Timelock genesis tests completed");
        setGlobalTestnet(undefined);
    });

    test("epoch 2 has a ready 96-byte timelock key", async () => {
        const epoch = await waitFor(`epoch ${TARGET_EPOCH}`, 300, async () => {
            const info = await testnet.getLedgerInfo(0);
            const current = parseInt(info.epoch, 10);
            return current >= TARGET_EPOCH ? current : undefined;
        });
        console.log(`Reached epoch ${epoch}`);

        const [ready] = await client.view({
            function: "0x1::ibe_config::is_ready",
            type_arguments: [],
            arguments: [],
        });
        expect(ready).toBe(true);

        const [mpk] = await client.view({
            function: "0x1::ibe_config::get_mpk",
            type_arguments: [],
            arguments: [],
        });
        expect(typeof mpk).toBe("string");
        const mpkHex = (mpk as string).replace(/^0x/, "");
        expect(mpkHex.length / 2).toBe(MPK_LENGTH_BYTES);

        const [configEpoch] = await client.view({
            function: "0x1::ibe_config::get_epoch_config",
            type_arguments: [],
            arguments: [],
        });
        expect(Number(configEpoch)).toBe(epoch);
        console.log(`✓ Epoch ${epoch}: is_ready=true, mpk is ${MPK_LENGTH_BYTES} bytes`);
    }, 360000);
});
