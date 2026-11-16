import { describe, expect, it, vi } from "vitest";
import {
  assertDemoDeploymentWindowSchedulesMatch,
  createDemoAptosClient,
} from "../scripts/deploy-window-schedule.js";
import type { WindowSchedule } from "@atomica/sdk/ethereum/lock-binding";

const TEST_SCHEDULE: WindowSchedule = {
  daySecs: 900n,
  closeOffsetsSecs: [900n],
};

describe("demo deployment window schedule check", () => {
  it("creates an Aptos client for its custom endpoint and compares schedules", async () => {
    expect(() =>
      createDemoAptosClient("http://localhost:8080/v1"),
    ).not.toThrow();

    const view = vi.fn().mockResolvedValue(["900", ["900"]]);
    const createAptosClient = vi.fn(() => ({ view }));
    const lockBox = {
      windowSchedule: vi.fn().mockResolvedValue(["900", ["900"]]),
    };

    await expect(
      assertDemoDeploymentWindowSchedulesMatch({
        aptosUrl: "http://localhost:8080/v1",
        moduleAddress: "0xcafe",
        expected: TEST_SCHEDULE,
        lockBox,
        createAptosClient,
      }),
    ).resolves.toBeUndefined();
    expect(createAptosClient).toHaveBeenCalledWith("http://localhost:8080/v1");
    expect(view).toHaveBeenCalledWith({
      payload: {
        function: "0xcafe::eth_proof::get_window_schedule",
        functionArguments: [],
      },
    });
    expect(lockBox.windowSchedule).toHaveBeenCalledTimes(1);
  });

  it("rejects a deployment when the Aptos schedule differs from LockBox", async () => {
    const createAptosClient = vi.fn(() => ({
      view: vi.fn().mockResolvedValue(["901", ["900"]]),
    }));
    const lockBox = {
      windowSchedule: vi.fn().mockResolvedValue(["900", ["900"]]),
    };
    await expect(
      assertDemoDeploymentWindowSchedulesMatch({
        aptosUrl: "http://localhost:8080/v1",
        moduleAddress: "0xcafe",
        expected: TEST_SCHEDULE,
        lockBox,
        createAptosClient,
      }),
    ).rejects.toThrow("Aptos and LockBox window schedules differ");
  });
});
