/**
 * Validator sync check.
 *
 * A validator set is in sync when every validator keeps making progress and
 * all of them agree on the committed chain. Equal heights alone prove neither:
 * a halted chain and a fork at the same height both have equal heights.
 *
 * The check takes the highest height any validator reports, then requires
 * every validator to reach that height plus `margin` before the deadline, and
 * requires every validator to report the same block hash at that height.
 *
 * The data sources are injected so the logic is unit tested against stalled
 * and forked fixtures without Docker (see test/sync-check.test.ts).
 */

export interface SyncSource {
    numValidators: number;
    /** Current committed block height of validator `i`. */
    getHeight(i: number): Promise<number>;
    /** Block hash validator `i` reports at `height`. */
    getBlockHash(i: number, height: number): Promise<string>;
}

export interface SyncCheckOptions {
    /** Blocks every validator must commit past the starting max height. */
    margin?: number;
    timeoutMs?: number;
    pollMs?: number;
}

export interface SyncCheckResult {
    maxHeight: number;
    finalHeights: number[];
    blockHash: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Throws when a validator fails to reach maxHeight + margin within the
 * timeout, or when validators disagree on the block hash at maxHeight.
 */
export async function checkValidatorSync(
    source: SyncSource,
    { margin = 3, timeoutMs = 60_000, pollMs = 500 }: SyncCheckOptions = {},
): Promise<SyncCheckResult> {
    const n = source.numValidators;
    const indices = Array.from({ length: n }, (_, i) => i);

    const startHeights = await Promise.all(indices.map((i) => source.getHeight(i)));
    const maxHeight = Math.max(...startHeights);
    const target = maxHeight + margin;

    const deadline = Date.now() + timeoutMs;
    let heights = startHeights;
    for (;;) {
        if (heights.every((h) => h >= target)) break;
        if (Date.now() >= deadline) {
            const laggards = indices.filter((i) => heights[i] < target);
            throw new Error(
                `validators ${laggards.join(", ")} did not reach height ${target} ` +
                    `(start max ${maxHeight} + ${margin}) within ${timeoutMs}ms; ` +
                    `heights: ${heights.join(", ")}`,
            );
        }
        await sleep(pollMs);
        heights = await Promise.all(indices.map((i) => source.getHeight(i)));
    }

    const hashes = await Promise.all(indices.map((i) => source.getBlockHash(i, maxHeight)));
    if (new Set(hashes).size !== 1) {
        throw new Error(
            `validators disagree on block hash at height ${maxHeight}: ${hashes.join(", ")}`,
        );
    }

    return { maxHeight, finalHeights: heights, blockHash: hashes[0] };
}
