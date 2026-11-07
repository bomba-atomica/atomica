/**
 * Unit tests for the validator sync check, run without Docker.
 *
 * These fixtures prove the negative cases the live validator-sync test cannot
 * stage on a healthy testnet: a validator stopped at a fixed height, and a
 * validator on a fork at the same height. Both must fail.
 */
import { describe, expect, test } from "vitest";
import { checkValidatorSync, type SyncSource } from "../src/sync-check";

/** Validators that advance one block per height read, except those in `stalled`. */
function fixture(opts: { start: number[]; stalled?: number[]; forked?: number[] }): SyncSource {
    const heights = [...opts.start];
    return {
        numValidators: heights.length,
        async getHeight(i) {
            const h = heights[i];
            if (!opts.stalled?.includes(i)) heights[i]++;
            return h;
        },
        async getBlockHash(i, height) {
            return opts.forked?.includes(i) ? `0xfork${height}` : `0xcanon${height}`;
        },
    };
}

const fast = { timeoutMs: 300, pollMs: 5 };

describe("checkValidatorSync", () => {
    test("passes when every validator advances and hashes agree", async () => {
        const result = await checkValidatorSync(fixture({ start: [100, 98, 101, 99] }), fast);
        expect(result.maxHeight).toBe(101);
        expect(result.finalHeights.every((h) => h >= 104)).toBe(true);
        expect(result.blockHash).toBe("0xcanon101");
    });

    test("fails when a validator is stopped at a fixed height", async () => {
        await expect(
            checkValidatorSync(fixture({ start: [100, 100, 100, 100], stalled: [2] }), fast),
        ).rejects.toThrow(/validators 2 did not reach height 103/);
    });

    test("fails when a stopped validator is at the max height", async () => {
        // Equal heights at the first sample: the old check passed this case.
        await expect(
            checkValidatorSync(fixture({ start: [100, 100, 100, 100], stalled: [0] }), fast),
        ).rejects.toThrow(/validators 0 did not reach height 103/);
    });

    test("fails when the whole chain is halted", async () => {
        await expect(
            checkValidatorSync(
                fixture({ start: [100, 100, 100, 100], stalled: [0, 1, 2, 3] }),
                fast,
            ),
        ).rejects.toThrow(/did not reach height 103/);
    });

    test("fails when a validator is on a fork at the same height", async () => {
        await expect(
            checkValidatorSync(fixture({ start: [100, 100, 100, 100], forked: [3] }), fast),
        ).rejects.toThrow(/disagree on block hash at height 100/);
    });
});
