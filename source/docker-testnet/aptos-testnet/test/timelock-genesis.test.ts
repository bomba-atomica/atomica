/**
 * Timelock genesis test.
 *
 * config/generate-genesis.sh sets the atomica-aptos layout flag
 * timelock_dkg_enabled, so the timelock DKG runs at the first reconfiguration.
 * This test starts 4 validators, waits for epoch 2 and checks that ibe_config
 * holds a ready timelock key: is_ready() is true and get_mpk() is a 96-byte G2
 * point. See docs/decisions/aptos-validator-timelock.md (Docker testnet epoch
 * policy).
 *
 * Genesis also names the auction package's timelock registrar (layout field
 * timelock_registrar), the only address that may register a timelock. The
 * deployed package runs the window schedule of ATOMICA_TEST_WINDOW_SCHEDULE,
 * which the CI job sets to 900:900.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AptosClient } from "aptos";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import { deployContracts, getTestnet, setupLocalnet, teardownLocalnet } from "../src/localnet";
import { timelockRegistrarAddress } from "../src/genesis";
import type { DockerTestnet } from "../src/index";
import {
    APTOS_DEPLOYER_ADDRESS,
    APTOS_TIMELOCK_REGISTRAR_ADDRESS,
} from "../../../shared/test-constants";

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

describe.sequential("Timelock genesis", () => {
    let testnet: DockerTestnet;
    let client: AptosClient;

    beforeAll(async () => {
        await setupLocalnet();
        testnet = getTestnet();
        client = new AptosClient(testnet.validatorApiUrl(0));
    }, 300000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    it("epoch 2 has a ready 96-byte timelock key: ibe_config::is_ready is true and get_mpk is 96 bytes", async () => {
        // The DKG needs a quorum of 4 validators (setupLocalnet's default).
        expect(testnet.getNumValidators()).toBeGreaterThanOrEqual(4);

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
        console.log(`Epoch ${epoch}: is_ready=true, mpk is ${MPK_LENGTH_BYTES} bytes`);
    }, 360000);

    it("genesis names the package's timelock registrar: 0x1::ibe_config::timelock_registrar equals the address derived from the deployer address", async () => {
        const [registrar] = await client.view({
            function: "0x1::ibe_config::timelock_registrar",
            type_arguments: [],
            arguments: [],
        });
        // Option<address> is returned as { vec: [] } or { vec: ["0x..."] }.
        const { vec } = registrar as { vec: string[] };
        expect(vec).toHaveLength(1);
        const expected = timelockRegistrarAddress(APTOS_DEPLOYER_ADDRESS);
        expect(expected).toBe(APTOS_TIMELOCK_REGISTRAR_ADDRESS);
        expect(AccountAddress.from(vec[0]).toStringLong()).toBe(expected);
    }, 60000);

    it("the deployed package reports the test window schedule 900:900 from eth_proof::get_window_schedule", async () => {
        // deployContracts stores ATOMICA_TEST_WINDOW_SCHEDULE right after publish.
        expect(process.env.ATOMICA_TEST_WINDOW_SCHEDULE).toBe("900:900");
        await deployContracts();
        const [daySecs, offsets] = await client.view({
            function: `${APTOS_DEPLOYER_ADDRESS}::eth_proof::get_window_schedule`,
            type_arguments: [],
            arguments: [],
        });
        expect(String(daySecs)).toBe("900");
        expect((offsets as string[]).map(String)).toEqual(["900"]);
    }, 600000);
});
