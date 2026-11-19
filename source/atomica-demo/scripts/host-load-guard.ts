/**
 * Host guards of the local dual-chain devnet run (`bun run devnet:check`,
 * scripts/local-devnet-check.ts, issue 281).
 *
 * This host has crashed under load, and it runs many unrelated containers.
 * The guard refuses to start at a 1-minute load average of 32 or more, or
 * when containers of this devnet already exist. It matches only this
 * devnet's containers: the compose projects `atomica-testnet` and
 * `ethereum-testnet`, or their fixed container names. While the devnet runs
 * it samples the load every 30 s and aborts the run, with teardown, at 32 or
 * more.
 *
 * The load reader and the container lister are injected, so this module has
 * no Node imports and the unit tests (tests/host-load-guard.test.ts) run in
 * the browser test runner.
 */

/** 1-minute load average at which the run refuses to start or aborts. */
export const LOAD_LIMIT = 32;

/** Interval of the mid-run load check. */
export const LOAD_CHECK_INTERVAL_MS = 30_000;

/** Compose projects of the devnet (the `name:` of each compose file). */
export const DEVNET_COMPOSE_PROJECTS = ["atomica-testnet", "ethereum-testnet"];

/** Fixed container names of both compose files. */
export const DEVNET_CONTAINER_NAMES = [
  "atomica-validator-0",
  "atomica-validator-1",
  "atomica-validator-2",
  "atomica-validator-3",
  "eth-execution",
  "eth-beacon",
  "eth-validator-1",
  "eth-validator-2",
  "eth-validator-3",
  "eth-validator-4",
];

/** One container as `docker ps -a` lists it. */
export interface ContainerInfo {
  name: string;
  /** The `com.docker.compose.project` label, empty when absent. */
  composeProject: string;
}

export type LoadReader = () => number;
export type ContainerLister = () => Promise<ContainerInfo[]>;

/** Thrown when the guard refuses or aborts the run. */
export class HostGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostGuardError";
  }
}

/** Whether `container` belongs to this devnet. Other projects never match. */
export function isDevnetContainer(container: ContainerInfo): boolean {
  return (
    DEVNET_COMPOSE_PROJECTS.includes(container.composeProject) ||
    DEVNET_CONTAINER_NAMES.includes(container.name)
  );
}

/**
 * Refuse to start when the load is at or above `limit` or devnet containers
 * exist. Returns the load it read. It starts nothing, so a refusal needs no
 * teardown: tearing down would remove the other devnet.
 */
export async function assertHostReady(
  readLoad: LoadReader,
  listContainers: ContainerLister,
  limit = LOAD_LIMIT,
): Promise<number> {
  const load = readLoad();
  if (load >= limit) {
    throw new HostGuardError(
      `1-minute load average ${load} is at or above ${limit}: refusing to start the devnet`,
    );
  }
  const existing = (await listContainers()).filter(isDevnetContainer);
  if (existing.length > 0) {
    throw new HostGuardError(
      `devnet containers already exist (${existing
        .map((c) => c.name)
        .join(", ")}): refusing to start a second devnet`,
    );
  }
  return load;
}

/** Timer functions, injected so tests can drive time. */
export interface Timers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface LoadMonitor {
  /** Stop sampling. */
  stop(): void;
  /** Highest load sampled, including the start sample. */
  maxLoad(): number;
}

/**
 * Sample the load every `intervalMs`. At or above `limit` it stops sampling
 * and calls `onOverload` once with the reason.
 */
export function startLoadMonitor(options: {
  readLoad: LoadReader;
  onOverload: (reason: HostGuardError) => void;
  initialLoad?: number;
  limit?: number;
  intervalMs?: number;
  timers?: Timers;
}): LoadMonitor {
  const limit = options.limit ?? LOAD_LIMIT;
  const timers: Timers = options.timers ?? {
    setInterval: (cb, ms) => globalThis.setInterval(cb, ms),
    clearInterval: (h) =>
      globalThis.clearInterval(h as ReturnType<typeof setInterval>),
  };
  let max = options.initialLoad ?? 0;
  let handle: unknown = null;
  const stop = () => {
    if (handle !== null) timers.clearInterval(handle);
    handle = null;
  };
  handle = timers.setInterval(() => {
    const load = options.readLoad();
    max = Math.max(max, load);
    if (load >= limit) {
      stop();
      options.onOverload(
        new HostGuardError(
          `1-minute load average ${load} reached ${limit}: aborting the devnet run`,
        ),
      );
    }
  }, options.intervalMs ?? LOAD_CHECK_INTERVAL_MS);
  return { stop, maxLoad: () => max };
}

/** Outcome of {@link runGuarded}. */
export interface GuardedRunResult<T> {
  result: T;
  /** Highest 1-minute load sampled during the run. */
  maxLoad: number;
}

/**
 * Check the host, then run `run` while the load monitor watches. `teardown`
 * always runs once `run` has started: on success, on failure, and when the
 * monitor aborts the run. A start refusal throws before `run` and calls no
 * teardown.
 */
export async function runGuarded<T>(options: {
  readLoad: LoadReader;
  listContainers: ContainerLister;
  run: () => Promise<T>;
  teardown: () => Promise<void>;
  limit?: number;
  intervalMs?: number;
  timers?: Timers;
}): Promise<GuardedRunResult<T>> {
  const initialLoad = await assertHostReady(
    options.readLoad,
    options.listContainers,
    options.limit,
  );
  let rejectOverload: (reason: HostGuardError) => void = () => {};
  const overload = new Promise<never>((_, reject) => {
    rejectOverload = reject;
  });
  const monitor = startLoadMonitor({
    readLoad: options.readLoad,
    onOverload: (reason) => rejectOverload(reason),
    initialLoad,
    limit: options.limit,
    intervalMs: options.intervalMs,
    timers: options.timers,
  });
  try {
    const running = options.run();
    // After an abort the run may still fail during teardown: keep that
    // rejection from becoming an unhandled one.
    running.catch(() => {});
    const result = await Promise.race([running, overload]);
    return { result, maxLoad: monitor.maxLoad() };
  } finally {
    monitor.stop();
    await options.teardown();
  }
}
