/**
 * Verifies the released validator's genesis configuration uses the owner's
 * two-thirds stake threshold for both secrecy and reconstruction.
 *
 * The two FixedPoint64 values are stored as little-endian u128 fields inside
 * copyable_any::Any.data. This reads the live on-chain resource rather than
 * duplicating the genesis source constant in the product test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AptosClient } from "aptos";
import { getTestnet, setupLocalnet, teardownLocalnet } from "../src/localnet";
import type { DockerTestnet } from "../src/index";

const EXPECTED_THRESHOLD = 12_297_829_382_473_034_410n;
const CONFIG_V1_TYPES = new Set([
    "0x1::chunky_dkg_config::ConfigV1",
    "0x1::chunky_dkg_config::ConfigShadowV1",
]);

function asBytes(data: unknown): Uint8Array {
    if (typeof data === "string") {
        const hex = data.replace(/^0x/, "");
        if (!/^(?:[0-9a-f]{2})+$/i.test(hex))
            throw new Error("Any.data is not an even-length hex string");
        return Uint8Array.from(hex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
    }
    if (
        Array.isArray(data) &&
        data.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
        return Uint8Array.from(data);
    }
    throw new Error(`Unexpected Any.data representation: ${JSON.stringify(data)}`);
}

function readU128LE(bytes: Uint8Array, offset: number): bigint {
    if (bytes.length < offset + 16) throw new Error("ChunkyDKGConfig Any.data is truncated");
    let value = 0n;
    for (let index = 15; index >= 0; index -= 1) {
        value = (value << 8n) | BigInt(bytes[offset + index]);
    }
    return value;
}

describe.sequential("Chunky DKG secrecy threshold", () => {
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

    it("genesis uses the two-thirds stake threshold for secrecy and reconstruction", async () => {
        const resource = await client.getAccountResource(
            "0x1",
            "0x1::chunky_dkg_config::ChunkyDKGConfig",
        );
        const config = resource.data as {
            variant: { type_name?: unknown; data?: unknown };
        };
        const variant = config.variant;
        expect(typeof variant.type_name).toBe("string");
        expect(CONFIG_V1_TYPES.has(variant.type_name as string)).toBe(true);

        const bytes = asBytes(variant.data);
        const secrecyThreshold = readU128LE(bytes, 0);
        const reconstructionThreshold = readU128LE(bytes, 16);
        expect(secrecyThreshold).toBeGreaterThanOrEqual(EXPECTED_THRESHOLD);
        expect(reconstructionThreshold).toBe(secrecyThreshold);
    }, 60000);
});
