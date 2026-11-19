import { describe, expect, it, vi } from "vitest";
import {
  HostGuardError,
  LOAD_CHECK_INTERVAL_MS,
  LOAD_LIMIT,
  assertHostReady,
  isDevnetContainer,
  runGuarded,
  type ContainerInfo,
  type Timers,
} from "../scripts/host-load-guard";

/** Containers of unrelated projects that share this host. */
const OTHER_CONTAINERS: ContainerInfo[] = [
  { name: "rm_smoke_pgtest_6631c1b5d9", composeProject: "" },
  { name: "determined_mccarthy", composeProject: "" },
  { name: "forge-registry-68926-0-ci", composeProject: "forge-registry" },
  { name: "validator-0", composeProject: "other-aptos" },
];

const noContainers = async () => [] as ContainerInfo[];

/** Timers the test fires by hand. */
function manualTimers() {
  const callbacks = new Map<number, () => void>();
  let next = 0;
  const timers: Timers = {
    setInterval: (cb, ms) => {
      expect(ms).toBe(LOAD_CHECK_INTERVAL_MS);
      callbacks.set(++next, cb);
      return next;
    },
    clearInterval: (h) => {
      callbacks.delete(h as number);
    },
  };
  const tick = () => [...callbacks.values()].forEach((cb) => cb());
  return { timers, tick, active: () => callbacks.size };
}

describe("host load guard", () => {
  it("refuses to start at a load of 32 or more", async () => {
    for (const load of [LOAD_LIMIT, 40]) {
      const run = vi.fn(async () => "ran");
      const teardown = vi.fn(async () => {});
      await expect(
        runGuarded({
          readLoad: () => load,
          listContainers: noContainers,
          run,
          teardown,
        }),
      ).rejects.toThrow(HostGuardError);
      expect(run).not.toHaveBeenCalled();
      expect(teardown).not.toHaveBeenCalled();
    }
  });

  it("starts below 32 with only unrelated containers on the host", async () => {
    expect(
      await assertHostReady(
        () => 31.9,
        async () => OTHER_CONTAINERS,
      ),
    ).toBe(31.9);
    expect(OTHER_CONTAINERS.some(isDevnetContainer)).toBe(false);
  });

  it.each([
    [{ name: "atomica-validator-2", composeProject: "atomica-testnet" }],
    [{ name: "eth-beacon", composeProject: "" }],
    [
      {
        name: "ethereum-testnet-setup-run-1a2b",
        composeProject: "ethereum-testnet",
      },
    ],
  ])("refuses when devnet container %o exists", async (devnet) => {
    const run = vi.fn(async () => "ran");
    const teardown = vi.fn(async () => {});
    await expect(
      runGuarded({
        readLoad: () => 1,
        listContainers: async () => [...OTHER_CONTAINERS, devnet],
        run,
        teardown,
      }),
    ).rejects.toThrow(/devnet containers already exist/);
    expect(run).not.toHaveBeenCalled();
    // Tearing down here would remove the other devnet.
    expect(teardown).not.toHaveBeenCalled();
  });

  it("aborts with teardown when the load reaches 32 mid-run", async () => {
    const { timers, tick, active } = manualTimers();
    const loads = [5, 20, LOAD_LIMIT];
    const readLoad = vi.fn(() => loads.shift() ?? 0);
    const teardown = vi.fn(async () => {});
    const guarded = runGuarded({
      readLoad,
      listContainers: noContainers,
      // The devnet run never finishes on its own.
      run: () => new Promise<string>(() => {}),
      teardown,
      timers,
    });
    // Let the start check pass, then fire two 30 s checks.
    await vi.waitFor(() => expect(active()).toBe(1));
    tick();
    expect(teardown).not.toHaveBeenCalled();
    tick();
    await expect(guarded).rejects.toThrow(/reached 32: aborting/);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(active()).toBe(0);
    expect(readLoad).toHaveBeenCalledTimes(3);
  });

  it("tears down after a run that succeeds or fails", async () => {
    const teardown = vi.fn(async () => {});
    const ok = await runGuarded({
      readLoad: () => 3,
      listContainers: noContainers,
      run: async () => "ok",
      teardown,
    });
    expect(ok).toEqual({ result: "ok", maxLoad: 3 });
    await expect(
      runGuarded({
        readLoad: () => 3,
        listContainers: noContainers,
        run: async () => {
          throw new Error("assertion failed");
        },
        teardown,
      }),
    ).rejects.toThrow("assertion failed");
    expect(teardown).toHaveBeenCalledTimes(2);
  });
});
