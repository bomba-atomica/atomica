import { describe, expect, test } from "vitest";
import { batchTestLockBinding } from "../src/browser-commands";

const schedule = { daySecs: 900n, closeOffsetsSecs: [900n] };
const pair = "0x0102";

describe("batch lock binding", () => {
    test("accounts for one second per Anvil lock and selects the next window before the batch crosses a close", () => {
        expect(batchTestLockBinding(schedule, 600n, 200, pair).windowId).toBe(0n);
        expect(batchTestLockBinding(schedule, 700n, 200, pair).windowId).toBe(1n);
        expect(batchTestLockBinding(schedule, 850n, 200, pair).windowId).toBe(1n);
    });

    test("rejects a batch that cannot fit in either window accepted by LockBox", () => {
        expect(() => batchTestLockBinding(schedule, 850n, 900, pair)).toThrow(
            "lock batch exceeds the current and next Ethereum windows",
        );
    });
});
