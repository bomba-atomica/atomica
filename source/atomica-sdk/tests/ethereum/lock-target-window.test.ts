import { describe, expect, it } from "vitest";
import {
  LOCK_TARGET_CLOSE_MARGIN_SECS,
  PRODUCTION_WINDOW_SCHEDULE,
  currentWindowId,
  lockTargetWindowId,
  windowCloseSecs,
  type WindowSchedule,
} from "../../src/ethereum/lock-binding.js";

const TEST_SCHEDULE: WindowSchedule = {
  daySecs: 900n,
  closeOffsetsSecs: [900n],
};

describe.each([
  ["production", PRODUCTION_WINDOW_SCHEDULE],
  ["900:900", TEST_SCHEDULE],
])("lockTargetWindowId on %s schedule", (_name, schedule) => {
  it("switches to the next window only after the close margin starts", () => {
    const current = currentWindowId(0n, schedule);
    const close = windowCloseSecs(current, schedule);
    expect(
      lockTargetWindowId(close - LOCK_TARGET_CLOSE_MARGIN_SECS, schedule),
    ).toBe(current);
    for (
      let remaining = LOCK_TARGET_CLOSE_MARGIN_SECS - 1n;
      remaining > 0n;
      remaining--
    ) {
      expect(lockTargetWindowId(close - remaining, schedule)).toBe(
        current + 1n,
      );
    }
    expect(lockTargetWindowId(close, schedule)).toBe(
      currentWindowId(close, schedule),
    );
  });

  it("always chooses a window LockBox accepts across two days", () => {
    const end = schedule.daySecs * 2n;
    for (let now = 0n; now <= end; now++) {
      const current = currentWindowId(now, schedule);
      const target = lockTargetWindowId(now, schedule);
      expect(target >= current && target <= current + 1n).toBe(true);
    }
  });
});
