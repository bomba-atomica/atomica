#!/usr/bin/env bun
/**
 * Local dual-chain devnet check (issue 281): `bun run devnet:check`.
 *
 * Brings up the Aptos docker validators and the Ethereum docker testnet with
 * `setupDualChainTestnet`, which deploys the Atomica Move package and the EVM
 * contracts. It then asserts three things:
 *   1. `auction::is_pair_allowed(LAUNCH_PAIR_BCS)` is true
 *   2. a LockBox lock emits `Locked` (the seller's FakeETH lock)
 *   3. `create_auction` for the lock's window succeeds
 * It prints a JSON report and exits 0 only when all three hold.
 *
 * Host safety (see scripts/host-load-guard.ts): it refuses to start at a
 * 1-minute load of 32 or more or when devnet containers exist, checks the load
 * every 30 s and aborts at 32. Every devnet container runs under the CPU and
 * memory caps of the compose files. It tears the devnet down on success,
 * failure, load abort, SIGINT and SIGTERM. It uses the pinned prebuilt
 * validator image and never builds an image.
 *
 * Run from source/atomica-demo; the package script loads source/.env.test.
 * It runs `prepare:deps` itself, after the host checks pass.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadavg } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEVNET_NETWORK,
  assertSubnetFree,
  devnetNetworkCreateArgs,
  isDevnetContainer,
  runGuarded,
  type ContainerInfo,
  type NetworkInfo,
} from "./host-load-guard";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DOCKER_TESTNET_DIR = resolve(SCRIPT_DIR, "../../docker-testnet");
const APTOS_COMPOSE_DIR = resolve(DOCKER_TESTNET_DIR, "config");
const ETH_COMPOSE_DIR = resolve(DOCKER_TESTNET_DIR, "ethereum-testnet/config");
const APTOS_TESTNET_SRC = resolve(DOCKER_TESTNET_DIR, "aptos-testnet/src");
/** Image of the Ethereum genesis `setup` service; it must already exist. */
const ETH_SETUP_IMAGE = "ethereum-testnet-setup";
/** Least time left in the window before locking (as auction-round-trip.test.ts). */
const MIN_WINDOW_LEFT_SECS = 420n;
/** Seller FakeETH lock: above the 0.01 FakeETH minimum seller lock. */
const LOCK_AMOUNT = 10n ** 18n;
/** APT for the seller's Ethereum-derivable account gas (5 APT). */
const ETH_ACCOUNT_GAS_OCTAS = 500_000_000;

// Pin both SDKs to this checkout's compose files, the Docker PoS Ethereum
// chain, and the CI test window clock (a close every 15 minutes).
process.env.ATOMICA_DOCKER_COMPOSE_DIR = APTOS_COMPOSE_DIR;
process.env.ETHEREUM_DOCKER_COMPOSE_DIR = ETH_COMPOSE_DIR;
process.env.ETH_BACKEND = "docker";
process.env.ATOMICA_TEST_WINDOW_SCHEDULE ??= "900:900";

interface Report {
  ok: boolean;
  pairAllowed: boolean | null;
  locked: {
    lockBox: string;
    txHash: string;
    lockId: string;
    depositor: string;
    nonce: string;
    amount: string;
    windowId: string;
  } | null;
  createAuction: { txHash: string; windowId: string } | null;
  caps: {
    containers: { name: string; cpus: number; memoryGb: number }[];
    totalCpus: number;
    totalMemoryGb: number;
  } | null;
  maxLoad1m: number;
  teardown: "not-started" | "done" | "failed";
  error: string | null;
}

const report: Report = {
  ok: false,
  pairAllowed: null,
  locked: null,
  createAuction: null,
  caps: null,
  maxLoad1m: 0,
  teardown: "not-started",
  error: null,
};

/** Whether the devnet may exist, so an exit must tear it down. */
let devnetStarted = false;

function readLoad(): number {
  const load = loadavg()[0];
  report.maxLoad1m = Math.max(report.maxLoad1m, load);
  return load;
}

function docker(args: string[], cwd?: string): string {
  return execFileSync("docker", args, {
    cwd,
    encoding: "utf8",
    timeout: 180_000,
  });
}

async function listContainers(): Promise<ContainerInfo[]> {
  return docker([
    "ps",
    "-a",
    "--format",
    '{{.Names}}\t{{.Label "com.docker.compose.project"}}',
  ])
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [name, composeProject = ""] = line.split("\t");
      return { name, composeProject };
    });
}

/** Every docker network with its IPv4 and IPv6 subnets. */
async function listNetworks(): Promise<NetworkInfo[]> {
  const ids = docker(["network", "ls", "-q"]).split("\n").filter(Boolean);
  if (ids.length === 0) return [];
  return docker([
    "network",
    "inspect",
    "--format",
    "{{.Name}}\t{{range .IPAM.Config}}{{.Subnet}} {{end}}",
    ...ids,
  ])
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [name, subnets = ""] = line.split("\t");
      return { name, subnets: subnets.split(" ").filter(Boolean) };
    });
}

function networkExists(): boolean {
  try {
    docker(["network", "inspect", DEVNET_NETWORK]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reserve the devnet subnet now (see devnetNetworkCreateArgs). The container
 * guard passed, so a leftover atomica-testnet has no devnet attached: replace
 * it, which also drops any compose labels a past run left on it.
 */
function reserveNetwork(): void {
  if (networkExists()) docker(["network", "rm", DEVNET_NETWORK]);
  docker(devnetNetworkCreateArgs());
}

/**
 * Remove both compose projects with their volumes and networks, then the
 * reserved network. Synchronous, so a signal handler finishes it before the
 * process exits.
 */
function teardownDevnet(): void {
  if (!devnetStarted) return;
  let failed = false;
  for (const dir of [APTOS_COMPOSE_DIR, ETH_COMPOSE_DIR]) {
    try {
      execFileSync("docker", ["compose", "down", "-v", "--remove-orphans"], {
        cwd: dir,
        stdio: ["ignore", "inherit", "inherit"],
        timeout: 180_000,
      });
    } catch (error) {
      failed = true;
      console.error(`[devnet:check] teardown failed in ${dir}:`, error);
    }
  }
  // The reserved network has no project label, so compose down skips it.
  if (networkExists()) {
    try {
      docker(["network", "rm", DEVNET_NETWORK]);
    } catch (error) {
      failed = true;
      console.error(
        `[devnet:check] could not remove ${DEVNET_NETWORK}:`,
        error,
      );
    }
  }
  devnetStarted = false;
  report.teardown = failed ? "failed" : "done";
}

/** CPU and memory caps of every running devnet container (docker inspect). */
async function readCaps(): Promise<Report["caps"]> {
  const names = (await listContainers())
    .filter(isDevnetContainer)
    .map((c) => c.name);
  if (names.length === 0) return null;
  const containers = docker([
    "inspect",
    "--format",
    "{{.Name}}\t{{.HostConfig.NanoCpus}}\t{{.HostConfig.Memory}}",
    ...names,
  ])
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [name, nanoCpus, memory] = line.split("\t");
      return {
        name: name.replace(/^\//, ""),
        cpus: Number(nanoCpus) / 1e9,
        memoryGb: Number(memory) / 2 ** 30,
      };
    });
  return {
    containers,
    totalCpus: containers.reduce((sum, c) => sum + c.cpus, 0),
    totalMemoryGb: containers.reduce((sum, c) => sum + c.memoryGb, 0),
  };
}

/** Fail before starting anything when a prerequisite would build or is missing. */
async function preflight(): Promise<void> {
  await assertSubnetFree(listNetworks);
  try {
    docker(["image", "inspect", ETH_SETUP_IMAGE]);
  } catch {
    throw new Error(
      `docker image ${ETH_SETUP_IMAGE} is missing: compose would build it. Pull or load it first; this check never builds images.`,
    );
  }
  const evmOut = resolve(SCRIPT_DIR, "../../evm-contracts/out");
  if (!existsSync(evmOut)) {
    throw new Error(`${evmOut} is missing: run forge build first`);
  }
  const { findAptosBinary } = await import(
    `${APTOS_TESTNET_SRC}/findAptosBinary.ts`
  );
  findAptosBinary();
}

async function pollUntil<T>(
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
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Timed out after ${timeoutSecs}s waiting for ${what}: ${String(lastError)}`,
  );
}

/**
 * Import `specifier` as aptos-testnet resolves it, so this script and the
 * devnet SDK share one copy of ethers, the Aptos ts-sdk and @atomica/sdk.
 */
function fromAptosTestnet(specifier: string) {
  return import(Bun.resolveSync(specifier, APTOS_TESTNET_SRC));
}

/** Bring the devnet up and run the three assertions. */
async function runDevnetCheck(): Promise<void> {
  devnetStarted = true;
  reserveNetwork();
  // Build the local packages only after every host check passed.
  execFileSync("bun", ["run", "prepare:deps"], {
    cwd: resolve(SCRIPT_DIR, ".."),
    stdio: ["ignore", "inherit", "inherit"],
  });
  const { ethers } = await fromAptosTestnet("ethers");
  const {
    Account,
    AccountAddress,
    Aptos,
    AptosConfig,
    Ed25519PrivateKey,
    Network,
  } = await fromAptosTestnet("@aptos-labs/ts-sdk");
  const { simulateMaxGasAmount } = await fromAptosTestnet("@atomica/sdk");
  const sdkAptos = await fromAptosTestnet("@atomica/sdk/aptos");
  const { currentWindowId, windowCloseSecs } = await fromAptosTestnet(
    "@atomica/sdk/ethereum/lock-binding",
  );
  const { LAUNCH_PAIR_BCS } = await fromAptosTestnet(
    "@atomica/sdk/settlement/bridge",
  );
  // The devnet SDK modules read the compose dirs set above at import time.
  const { setupDualChainTestnet } = await import(
    `${APTOS_TESTNET_SRC}/dual-chain-testnet.ts`
  );
  const { lockAndProve } = await import(
    `${APTOS_TESTNET_SRC}/browser-commands.ts`
  );
  const { ethAccountAddress, submitAsEthAccount } = await import(
    `${APTOS_TESTNET_SRC}/eth-derivable-account.ts`
  );
  const { fundAccount } = await import(`${APTOS_TESTNET_SRC}/localnet.ts`);

  const info = await setupDualChainTestnet();
  report.caps = await readCaps();

  // The SDK payload builders check assets against the deployed tokens.
  (
    globalThis as { __ATOMICA_CHAIN_CONFIG__?: unknown }
  ).__ATOMICA_CHAIN_CONFIG__ = {
    ethereum: {
      rpcUrl: info.eth.rpcUrl,
      fakeETH: info.eth.contracts.fakeETH,
      fakeUSD: info.eth.contracts.fakeUSD,
      lockBox: info.eth.contracts.lockBox,
    },
    aptos: { contractAddress: info.aptos.moduleAddress },
  };
  const aptos = new Aptos(
    new AptosConfig({ network: Network.LOCAL, fullnode: info.aptos.nodeUrl }),
  );
  sdkAptos.setAptosInstance(aptos);
  if (
    AccountAddress.from(sdkAptos.CONTRACT_ADDR).toString() !==
    AccountAddress.from(info.aptos.moduleAddress).toString()
  ) {
    throw new Error(
      `SDK CONTRACT_ADDR ${sdkAptos.CONTRACT_ADDR} is not the deployed package ${info.aptos.moduleAddress}`,
    );
  }

  // 1. The launch pair is on the allowlist.
  report.pairAllowed = await sdkAptos.isPairAllowed(LAUNCH_PAIR_BCS);
  if (!report.pairAllowed)
    throw new Error("is_pair_allowed(LAUNCH_PAIR_BCS) is false");

  // create_auction registers the window timelock, so the epoch's timelock
  // key must exist. Wait for it before locking, so the lock's window is
  // still open when create_auction runs.
  await pollUntil("ibe_config::is_ready", 600, async () => {
    const [ready] = await aptos.view({
      payload: { function: "0x1::ibe_config::is_ready", functionArguments: [] },
    });
    return ready === true ? true : undefined;
  });
  const chainNowSecs = async () =>
    BigInt((await aptos.getLedgerInfo()).ledger_timestamp) / 1_000_000n;
  const schedule = await sdkAptos.getWindowSchedule();
  const startSecs = await chainNowSecs();
  const closeSecs = windowCloseSecs(
    currentWindowId(startSecs, schedule),
    schedule,
  );
  if (closeSecs - startSecs < MIN_WINDOW_LEFT_SECS) {
    await pollUntil(
      "the next window",
      Number(MIN_WINDOW_LEFT_SECS) + 120,
      async () => ((await chainNowSecs()) >= closeSecs ? true : undefined),
    );
  }

  // 2. The seller locks FakeETH in LockBox, proven at a certified block.
  const seller = info.eth.deployerPrivateKey;
  const [{ lockId, proof }] = await lockAndProve(
    info.eth.rpcUrl,
    info.aptos.nodeUrl,
    seller,
    info.eth.contracts.fakeETH,
    info.eth.contracts.lockBox,
    LOCK_AMOUNT,
    10n * LOCK_AMOUNT,
    1,
    ethers.hexlify(LAUNCH_PAIR_BCS),
  );
  const provider = new ethers.JsonRpcProvider(info.eth.rpcUrl, undefined, {
    cacheTimeout: -1,
  });
  const lockBox = new ethers.Contract(
    info.eth.contracts.lockBox,
    [
      "event Locked(bytes32 indexed lockId, address indexed depositor, address indexed token, uint256 nonce, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline)",
    ],
    provider,
  );
  const [locked] = await lockBox.queryFilter(lockBox.filters.Locked(lockId), 0);
  if (
    !locked ||
    locked.address.toLowerCase() !== info.eth.contracts.lockBox.toLowerCase()
  ) {
    throw new Error(`no Locked event from LockBox for lock ${lockId}`);
  }
  report.locked = {
    lockBox: locked.address,
    txHash: locked.transactionHash,
    lockId,
    depositor: String(locked.args.depositor),
    nonce: String(locked.args.nonce),
    amount: String(locked.args.amount),
    windowId: String(locked.args.windowId),
  };

  // Register the lock on Aptos. Any account may carry the proof.
  const operator = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(info.aptos.deployerPrivateKey),
  });
  const registerPayload = sdkAptos.getRegisterLockPayload(
    {
      ...proof,
      lockNonce: BigInt(proof.lockNonce),
      amount: BigInt(proof.amount),
      windowId: BigInt(proof.windowId),
      deadline: BigInt(proof.deadline),
      storageValue: BigInt(proof.storageValue),
    },
    "FakeETH",
  );
  const maxGasAmount = await simulateMaxGasAmount(
    aptos,
    operator.accountAddress,
    registerPayload,
  );
  const registerTxn = await aptos.transaction.build.simple({
    sender: operator.accountAddress,
    data: registerPayload,
    options: maxGasAmount !== undefined ? { maxGasAmount } : undefined,
  });
  const registered = await aptos.signAndSubmitTransaction({
    signer: operator,
    transaction: registerTxn,
  });
  await aptos.waitForTransaction({
    transactionHash: registered.hash,
    options: { checkSuccess: true },
  });

  // 3. The seller's Ethereum-derivable account creates the lock's window.
  const windowId = BigInt(proof.windowId);
  const domain = info.aptos.siweDomain;
  await fundAccount(
    await ethAccountAddress(seller, domain),
    ETH_ACCOUNT_GAS_OCTAS,
  );
  const txHash = await submitAsEthAccount(
    aptos,
    seller,
    domain,
    sdkAptos.getCreateAuctionPayload(
      windowId,
      LAUNCH_PAIR_BCS,
      ethers.getBytes(lockId),
    ),
  );
  report.createAuction = { txHash, windowId: windowId.toString() };
}

function finish(code: number): never {
  console.log(`\n[devnet:check] report\n${JSON.stringify(report, null, 2)}`);
  process.exit(code);
}

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const) {
  // Registered before the SDKs add theirs, so this runs first and exits
  // only after both compose projects are down.
  process.on(signal, () => {
    console.error(`\n[devnet:check] ${signal}: tearing down the devnet`);
    report.error = `interrupted by ${signal}`;
    teardownDevnet();
    finish(code);
  });
}

async function main(): Promise<void> {
  try {
    await preflight();
    await runGuarded({
      readLoad,
      listContainers,
      run: runDevnetCheck,
      teardown: async () => teardownDevnet(),
    });
    report.ok =
      report.pairAllowed === true &&
      report.locked !== null &&
      report.createAuction !== null &&
      report.teardown === "done";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    // runGuarded already tore down; this covers a throw outside it.
    teardownDevnet();
  }
  finish(report.ok ? 0 : 1);
}

void main();
