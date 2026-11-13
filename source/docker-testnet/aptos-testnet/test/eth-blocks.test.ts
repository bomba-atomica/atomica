/**
 * Unit tests for the anvil clock sync, run without Docker or a chain.
 *
 * A stubbed provider answers `web3_clientVersion` and the latest block, and
 * records every other RPC it is sent.
 */
import { describe, expect, test } from "vitest";
import type { ethers } from "ethers";
import { syncAnvilClockToHost } from "../src/eth-blocks";

function stubProvider(clientVersion: string, latestTimestamp: number) {
    const sent: Array<{ method: string; params: unknown[] }> = [];
    const provider = {
        async send(method: string, params: unknown[]) {
            if (method === "web3_clientVersion") return clientVersion;
            sent.push({ method, params });
            return null;
        },
        async getBlock(tag: string) {
            expect(tag).toBe("latest");
            return { timestamp: latestTimestamp };
        },
    };
    return { provider: provider as unknown as ethers.JsonRpcProvider, sent };
}

const HOST_NOW = 1_800_000_000;

describe("syncAnvilClockToHost", () => {
    test("syncAnvilClockToHost sets the next block timestamp to the host second when anvil is behind, and sends nothing when anvil is ahead or the chain is not anvil", async () => {
        const behind = stubProvider("anvil/v1.0.0", HOST_NOW - 30);
        await syncAnvilClockToHost(behind.provider, HOST_NOW);
        expect(behind.sent).toEqual([{ method: "evm_setNextBlockTimestamp", params: [HOST_NOW] }]);

        const ahead = stubProvider("anvil/v1.0.0", HOST_NOW + 300);
        await syncAnvilClockToHost(ahead.provider, HOST_NOW);
        expect(ahead.sent).toEqual([]);

        const notAnvil = stubProvider("Geth/v1.14.0", HOST_NOW - 30);
        await syncAnvilClockToHost(notAnvil.provider, HOST_NOW);
        expect(notAnvil.sent).toEqual([]);
    });
});
