/**
 * Unit tests for settlement/bridge.ts (Aptos auction reads) and the
 * permissionless settlement path that replaced the relayer:
 *
 *   - scanAuctionOutcomeEvents / queryAuctionSettledEvents: Aptos event parsing
 *   - parseBidResults, bcsEncodePair (quoteForFill is in tests/price.test.ts)
 *   - outcome-carrier.ts: the golden recordOutcome and advanceEpoch call data,
 *     epoch advance before recordOutcome, the StaleEpoch refetch, and the
 *     version_pruned fallback across nodes
 *   - no settlement authority: every release call the SDK builds is
 *     LockBox.releaseByOutcome, and no relayer write is exported
 *
 * All Aptos and Ethereum I/O is mocked; no network calls are made.
 *
 * @see source/atomica-sdk/src/settlement/bridge.ts
 * @see source/atomica-sdk/src/settlement/outcome-carrier.ts
 * @see docs/architecture/v0-architecture.md §3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ethers } from "ethers";
import * as bridge from "../src/settlement/bridge.js";
import {
  queryAuctionSettledEvents,
  scanAuctionSettledEvents,
  scanAuctionOutcomeEvents,
  AptosPrunedReadError,
  bcsEncodePair,
  LAUNCH_PAIR,
  LAUNCH_PAIR_BCS,
  parseBidResults,
  type BridgeConfig,
  type Pair,
} from "../src/settlement/bridge.js";

// ─── Test fixtures ─────────────────────────────────────────────────────────

const TEST_PAIR: Pair = {
  baseChain: "ethereum",
  baseToken: "FakeETH",
  quoteChain: "aptos",
  quoteToken: "FakeUSD",
};

const TEST_CONFIG: BridgeConfig = {
  aptosRpcUrl: "http://localhost:8080/v1",
  contractAddress: "0x" + "ab".repeat(32),
};

/** Builds a raw Aptos event object matching the AuctionSettled schema. */
function makeRawAptosEvent(
  windowId: number,
  pair: Pair,
  clearingPrice = 1000,
  totalFilled = 5000,
  winnerCount = 2,
): Record<string, unknown> {
  return {
    type: `${TEST_CONFIG.contractAddress}::auction::AuctionSettled`,
    data: {
      window_id: String(windowId),
      pair: {
        base_chain: pair.baseChain,
        base_token: pair.baseToken,
        quote_chain: pair.quoteChain,
        quote_token: pair.quoteToken,
      },
      clearing_price: String(clearingPrice),
      total_filled: String(totalFilled),
      winner_count: String(winnerCount),
      lock_ids: ["0xdeadbeef", "0xcafebabe"],
    },
  };
}

/** Wraps raw events into a committed-transaction record. */
function makeTx(version: number, events: unknown[] = []): unknown {
  return { type: "user_transaction", version: String(version), events };
}

/** Other module event emitted by the same package. */
const OTHER_EVENT = {
  type: `${TEST_CONFIG.contractAddress}::auction::BidPlaced`,
  data: {},
};

/** Helper: mock fetch to serve consecutive pages of transactions. */
function mockPages(...pages: unknown[][]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const page of pages) {
    fn.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(page),
    });
  }
  fn.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockStatus(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: vi.fn().mockResolvedValue({ error_code: "version_pruned" }),
    }),
  );
}

// ─── queryAuctionSettledEvents / scanAuctionSettledEvents ─────────────────

describe("queryAuctionSettledEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no transactions exist", async () => {
    mockPages([]);
    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);
    expect(result).toEqual([]);
  });

  it("finds an AuctionSettled module event inside a transaction", async () => {
    const rawEvent = makeRawAptosEvent(42, TEST_PAIR, 1500, 7500, 3);
    mockPages([makeTx(10, [OTHER_EVENT, rawEvent])]);

    const result = await queryAuctionSettledEvents(42n, TEST_PAIR, TEST_CONFIG);

    expect(result).toHaveLength(1);
    const event = result[0];
    expect(event.windowId).toBe(42n);
    expect(event.clearingPrice).toBe(1500n);
    expect(event.totalFilled).toBe(7500n);
    expect(event.winnerCount).toBe(3n);
    expect(event.pair).toEqual(TEST_PAIR);
  });

  it("parses lock_ids as Uint8Array", async () => {
    mockPages([makeTx(1, [makeRawAptosEvent(1, TEST_PAIR)])]);
    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);
    expect(result[0].lockIds).toHaveLength(2);
    expect(result[0].lockIds[0]).toEqual(
      new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    );
  });

  it("filters out events from other windows", async () => {
    mockPages([
      makeTx(1, [makeRawAptosEvent(1, TEST_PAIR)]),
      makeTx(2, [makeRawAptosEvent(2, TEST_PAIR)]),
    ]);
    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].windowId).toBe(1n);
  });

  it("filters out events for different trading pairs", async () => {
    const otherPair: Pair = { ...TEST_PAIR, baseToken: "WBTC" };
    mockPages([
      makeTx(1, [
        makeRawAptosEvent(1, otherPair),
        makeRawAptosEvent(1, TEST_PAIR),
      ]),
    ]);
    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].pair.baseToken).toBe("FakeETH");
  });

  it("returns empty array when fetch returns 404", async () => {
    mockStatus(404);
    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);
    expect(result).toEqual([]);
  });

  it("throws a non-retryable AptosPrunedReadError on 410", async () => {
    mockStatus(410);
    await expect(
      queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG),
    ).rejects.toBeInstanceOf(AptosPrunedReadError);
  });

  it("throws a plain error on other failures", async () => {
    mockStatus(500);
    await expect(
      queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG),
    ).rejects.toThrow(/500/);
  });

  it.each([
    "http://localhost:8080/v1",
    "http://localhost:8080/v1/",
    "http://localhost:8080",
  ])("builds a single /v1 path for rpc url %s", async (rpc) => {
    const fn = mockPages([]);
    await queryAuctionSettledEvents(1n, TEST_PAIR, {
      ...TEST_CONFIG,
      aptosRpcUrl: rpc,
    });
    const url = fn.mock.calls[0][0] as string;
    expect(url.startsWith("http://localhost:8080/v1/transactions?")).toBe(true);
    expect(url).not.toContain("/v1/v1");
  });
});

describe("scanAuctionSettledEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores same-named events from a different package address", async () => {
    mockPages([
      makeTx(1, [
        {
          ...makeRawAptosEvent(1, TEST_PAIR),
          type: "0x1::auction::AuctionSettled",
        },
      ]),
    ]);
    const scan = await scanAuctionSettledEvents(TEST_CONFIG);
    expect(scan.events).toEqual([]);
    expect(scan.nextVersion).toBe(2n);
  });

  it("matches the type when the node strips leading zeros of the address", async () => {
    const cfg = { ...TEST_CONFIG, contractAddress: "0x00ab" };
    mockPages([
      makeTx(5, [
        {
          ...makeRawAptosEvent(1, TEST_PAIR),
          type: "0xab::auction::AuctionSettled",
        },
      ]),
    ]);
    const scan = await scanAuctionSettledEvents(cfg);
    expect(scan.events).toHaveLength(1);
    expect(scan.events[0].version).toBe(5n);
  });

  it("pages until a short page and reports the next version", async () => {
    const fn = mockPages(
      [makeTx(0), makeTx(1, [makeRawAptosEvent(1, TEST_PAIR)])],
      [makeTx(2), makeTx(3, [makeRawAptosEvent(2, TEST_PAIR)])],
      [makeTx(4)], // short page: head reached
    );
    const scan = await scanAuctionSettledEvents(TEST_CONFIG, { pageSize: 2 });

    expect(scan.events.map((e) => e.event.windowId)).toEqual([1n, 2n]);
    expect(scan.events.map((e) => e.version)).toEqual([1n, 3n]);
    expect(scan.nextVersion).toBe(5n);
    const urls = fn.mock.calls.map((c) => c[0] as string);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("start=0&limit=2");
    expect(urls[1]).toContain("start=2&limit=2");
    expect(urls[2]).toContain("start=4&limit=2");
  });

  it("stops at maxPages and the checkpoint resumes there", async () => {
    mockPages([makeTx(0), makeTx(1)], [makeTx(2), makeTx(3)]);
    const scan = await scanAuctionSettledEvents(TEST_CONFIG, {
      pageSize: 2,
      maxPages: 2,
    });
    expect(scan.nextVersion).toBe(4n);
    expect(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(2);
  });

  it("resumes from the fromVersion checkpoint", async () => {
    const fn = mockPages([makeTx(100, [makeRawAptosEvent(7, TEST_PAIR)])]);
    const scan = await scanAuctionSettledEvents(TEST_CONFIG, {
      fromVersion: 100n,
    });
    expect(fn.mock.calls[0][0]).toContain("start=100&");
    expect(scan.events[0].version).toBe(100n);
    expect(scan.nextVersion).toBe(101n);
  });

  it("keeps the checkpoint unchanged when the ledger has nothing new", async () => {
    mockPages([]);
    const scan = await scanAuctionSettledEvents(TEST_CONFIG, {
      fromVersion: 55n,
    });
    expect(scan.nextVersion).toBe(55n);
    expect(scan.events).toEqual([]);
  });

  it("throws AptosPrunedReadError on a 410 page and names the url", async () => {
    mockStatus(410);
    const err = await scanAuctionSettledEvents(TEST_CONFIG, {
      fromVersion: 3n,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AptosPrunedReadError);
    expect((err as AptosPrunedReadError).url).toContain("start=3");
  });
});

// ─── scanAuctionOutcomeEvents ──────────────────────────────────────────────

describe("scanAuctionOutcomeEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("decodes AuctionSettled and AuctionRefunded in ledger order", async () => {
    mockPages([
      makeTx(10, [
        {
          // Removed by the Aptos unwind (213): no longer decoded.
          type: `${TEST_CONFIG.contractAddress}::auction::BidUnopened`,
          data: { window_id: "4" },
        },
        makeRawAptosEvent(4, TEST_PAIR),
      ]),
      makeTx(11, [
        {
          type: `${TEST_CONFIG.contractAddress}::auction::AuctionRefunded`,
          data: {
            window_id: "5",
            pair_bcs: "0x0102",
            timelock_id: "9",
            reason: 2,
            bid_count: "3",
            seller_lock_count: "1",
          },
        },
        OTHER_EVENT,
      ]),
    ]);

    const scan = await scanAuctionOutcomeEvents(TEST_CONFIG, { pageSize: 2 });

    expect(scan.events.map((e) => e.kind)).toEqual([
      "AuctionSettled",
      "AuctionRefunded",
    ]);
    const refunded = scan.events[1];
    if (refunded.kind !== "AuctionRefunded") throw new Error("kind");
    expect(refunded.event).toEqual({
      windowId: 5n,
      pairBcs: ethers.getBytes("0x0102"),
      timelockId: 9n,
      reason: 2,
      bidCount: 3n,
      sellerLockCount: 1n,
    });
    expect(refunded.version).toBe(11n);
  });
});

const ETH = 10n ** 18n;

describe("bcsEncodePair", () => {
  it("writes Move BCS: ULEB128 lengths, fields in Pair order", () => {
    expect(ethers.hexlify(bcsEncodePair(TEST_PAIR))).toBe(
      "0x08657468657265756d0746616b65455448056170746f730746616b65555344",
    );
  });

  it("LAUNCH_PAIR_BCS is bcsEncodePair of the launch pair", () => {
    expect(LAUNCH_PAIR).toEqual({
      baseChain: "ethereum",
      baseToken: "FakeETH",
      quoteChain: "ethereum",
      quoteToken: "FakeUSD",
    });
    expect(ethers.hexlify(LAUNCH_PAIR_BCS)).toBe(
      "0x08657468657265756d0746616b6545544808657468657265756d0746616b65555344",
    );
    expect(LAUNCH_PAIR_BCS).toEqual(bcsEncodePair(LAUNCH_PAIR));
  });
});

describe("parseBidResults", () => {
  it("decodes the REST JSON of vector<auction::BidResult>", () => {
    // Shape aptos-node returns for a #[view] returning vector<BidResult>:
    // u256 fields as decimal strings, address as hex, bool as JSON bool.
    const rest = [
      [
        {
          bidder: "0x" + "77".repeat(32),
          is_winner: true,
          fill_amount: "4000000000000000000",
          clearing_price: "2000",
        },
        {
          bidder: "0x" + "88".repeat(32),
          is_winner: false,
          fill_amount: "0",
          clearing_price: "2000",
        },
      ],
    ];
    expect(parseBidResults(rest[0])).toEqual([
      { bidder: "0x" + "77".repeat(32), fillAmount: 4n * ETH, isWinner: true },
      { bidder: "0x" + "88".repeat(32), fillAmount: 0n, isWinner: false },
    ]);
    expect(() => parseBidResults(undefined)).toThrow(/did not return a vector/);
  });
});

describe("AuctionSettled pair decoding", () => {
  it("decodes vector<u8> pair fields that Aptos REST renders as hex", async () => {
    const hex = (t: string) => ethers.hexlify(ethers.toUtf8Bytes(t));
    mockPages([
      makeTx(3, [
        {
          type: `${TEST_CONFIG.contractAddress}::auction::AuctionSettled`,
          data: {
            window_id: "1",
            pair: {
              base_chain: hex("ethereum"),
              base_token: hex("FakeETH"),
              quote_chain: hex("aptos"),
              quote_token: hex("FakeUSD"),
            },
            clearing_price: "1",
            total_filled: "0",
            winner_count: "0",
            lock_ids: [],
          },
        },
      ]),
    ]);
    const scan = await scanAuctionSettledEvents(TEST_CONFIG);
    expect(scan.events[0].event.pair).toEqual(TEST_PAIR);
  });
});

// ─── aptosToEthereumAddress integration ───────────────────────────────────

describe("Aptos to Ethereum address conversion", () => {
  it("correctly converts a zero-padded 32-byte Aptos address to 20-byte Ethereum address", async () => {
    const { aptosToEthereumAddress } =
      await import("../src/ethereum/address-converter.js");

    const aptosAddr =
      "0x" + "00".repeat(12) + "1234567890abcdef1234567890abcdef12345678";
    const ethAddr = aptosToEthereumAddress(aptosAddr);

    expect(ethAddr).toBe("0x1234567890abcdef1234567890abcdef12345678");
    expect(ethAddr).toHaveLength(42);
  });

  it("throws on invalid (non-32-byte) Aptos address", async () => {
    const { aptosToEthereumAddress } =
      await import("../src/ethereum/address-converter.js");

    expect(() => aptosToEthereumAddress("0x1234")).toThrow(
      "Invalid Aptos address",
    );
  });
});

// ─── Outcome carrier (issue 195) ──────────────────────────────────────────

import carrierVectors from "./fixtures/outcome_carrier_vectors.json";
import * as carrier from "../src/settlement/outcome-carrier.js";
import * as lockbox from "../src/ethereum/lockbox.js";
import { LOCKBOX_ABI, APTOS_LIGHT_CLIENT_ABI } from "../src/ethereum/abis.js";
import {
  advanceEpochCalldata,
  carryOutcome,
  eventProofFromNode,
  isLeafUnpayable,
  parseLedgerInfoWithSignatures,
  planWindowReleases,
  recordOutcomeCalldata,
  windowOutcomeTree,
  type CarrierChain,
  type EventProof,
  type NodeEventProof,
  type SignedLedgerInfo,
} from "../src/settlement/outcome-carrier.js";

const NODE_PROOF = carrierVectors.event_proof as NodeEventProof;
const GENESIS = carrierVectors.genesis_ledger_info_with_signatures;
const EPOCH_CHANGE = carrierVectors.epoch_change_ledger_info_with_signatures;

/** The validator set of epoch 2: the next_epoch_state of the epoch 1 change. */
function epoch2Set(): Uint8Array {
  return parseLedgerInfoWithSignatures(ethers.getBytes(EPOCH_CHANGE))
    .nextEpochState!;
}

const LOCKBOX = new ethers.Interface(LOCKBOX_ABI);
const LIGHT_CLIENT = new ethers.Interface(APTOS_LIGHT_CLIENT_ABI);

/** A JSON fetch answer. */
function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Serve the golden node: an event proof and the epoch changes 0 and 1. */
function goldenNode(proofs: Array<unknown> = [json(NODE_PROOF)]) {
  const fn = vi.fn(async (url: string) => {
    if (url.includes("/v1/atomica/event_proof/")) {
      const next = proofs.length > 1 ? proofs.shift() : proofs[0];
      return next as ReturnType<typeof json>;
    }
    if (url.includes("/v1/atomica/epoch_change_proof")) {
      const start = Number(new URL(url).searchParams.get("start_epoch"));
      const end = Number(new URL(url).searchParams.get("end_epoch"));
      const all = [GENESIS, EPOCH_CHANGE];
      return json({ ledger_infos_with_signatures: all.slice(start, end) });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** A MockAptosLightClient-like chain that records the call data it is sent. */
function fakeChain(latest: bigint, recordErrors: unknown[] = []) {
  const sent: string[] = [];
  const chain: CarrierChain = {
    latestEpoch: async () => latest,
    advanceEpoch: async (s: SignedLedgerInfo) => {
      sent.push(advanceEpochCalldata(s));
      latest++;
    },
    recordOutcome: async (p: EventProof) => {
      sent.push(recordOutcomeCalldata(p));
      const err = recordErrors.shift();
      if (err) throw err;
    },
  };
  return { chain, sent };
}

/** An ethers CALL_EXCEPTION carrying a light client custom error. */
function revert(name: string, args: unknown[]) {
  return Object.assign(new Error(`execution reverted: ${name}`), {
    code: "CALL_EXCEPTION",
    data: LIGHT_CLIENT.encodeErrorResult(name, args),
  });
}

describe("outcome carrier golden vector", () => {
  it("encodes the golden outcome proof into recordOutcome call data byte for byte", () => {
    const proof = eventProofFromNode(NODE_PROOF, epoch2Set());
    expect(recordOutcomeCalldata(proof)).toBe(
      carrierVectors.record_outcome_calldata,
    );
  });

  it("encodes the golden epoch change into advanceEpoch call data byte for byte", () => {
    const set1 = parseLedgerInfoWithSignatures(
      ethers.getBytes(GENESIS),
    ).nextEpochState!;
    const signed = carrier.signedLedgerInfo(
      ethers.getBytes(EPOCH_CHANGE),
      set1,
    );
    expect(advanceEpochCalldata(signed)).toBe(
      carrierVectors.advance_epoch_calldata,
    );
  });
});

describe("carryOutcome", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("advances each missing epoch before recordOutcome", async () => {
    goldenNode();
    const { chain, sent } = fakeChain(1n);
    const result = await carryOutcome(
      chain,
      ["http://node-a/v1"],
      BigInt(NODE_PROOF.version),
      BigInt(NODE_PROOF.event_index),
    );
    expect(result).toEqual({ status: "recorded" });
    expect(sent).toEqual([
      carrierVectors.advance_epoch_calldata,
      carrierVectors.record_outcome_calldata,
    ]);
  });

  it("sends no advanceEpoch when the light client is already at the proof epoch", async () => {
    goldenNode();
    const { chain, sent } = fakeChain(2n);
    await carryOutcome(chain, ["http://node-a"], 1337n, 2n);
    expect(sent).toEqual([carrierVectors.record_outcome_calldata]);
  });

  it("refetches the proof once on StaleEpoch and retries", async () => {
    const fetchFn = goldenNode([json(NODE_PROOF), json(NODE_PROOF)]);
    const { chain, sent } = fakeChain(2n, [revert("StaleEpoch", [2, 3])]);
    const result = await carryOutcome(chain, ["http://node-a"], 1337n, 2n);
    expect(result).toEqual({ status: "recorded" });
    const proofFetches = fetchFn.mock.calls.filter(([u]) =>
      String(u).includes("event_proof"),
    );
    expect(proofFetches).toHaveLength(2);
    expect(
      sent.filter((d) =>
        d.startsWith(LOCKBOX.getFunction("recordOutcome")!.selector),
      ),
    ).toHaveLength(2);
  });

  it("gives up after one refetch when StaleEpoch repeats", async () => {
    goldenNode([json(NODE_PROOF), json(NODE_PROOF)]);
    const { chain } = fakeChain(2n, [
      revert("StaleEpoch", [2, 3]),
      revert("StaleEpoch", [2, 3]),
    ]);
    await expect(
      carryOutcome(chain, ["http://node-a"], 1337n, 2n),
    ).rejects.toThrow(/StaleEpoch/);
  });

  it("tries the next node on 404 version_pruned", async () => {
    const pruned = json(
      { message: "pruned", error_code: "version_pruned" },
      404,
    );
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith("http://node-a")) return pruned;
      if (url.includes("event_proof")) return json(NODE_PROOF);
      const start = Number(new URL(url).searchParams.get("start_epoch"));
      return json({
        ledger_infos_with_signatures: [GENESIS, EPOCH_CHANGE].slice(start, 2),
      });
    });
    vi.stubGlobal("fetch", fetchFn);
    const { chain } = fakeChain(2n);
    const result = await carryOutcome(
      chain,
      ["http://node-a/v1", "http://node-b/v1"],
      1337n,
      2n,
    );
    expect(result).toEqual({ status: "recorded" });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "http://node-a/v1/atomica/event_proof/1337/2",
    );
    expect(fetchFn.mock.calls[1][0]).toBe(
      "http://node-b/v1/atomica/event_proof/1337/2",
    );
  });

  it("reports unprovable when no node serves the proof, and sends nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ message: "pruned", error_code: "version_pruned" }, 404),
      ),
    );
    const { chain, sent } = fakeChain(1n);
    const result = await carryOutcome(
      chain,
      ["http://node-a", "http://node-b"],
      1337n,
      2n,
    );
    expect(result.status).toBe("unprovable");
    if (result.status !== "unprovable") throw new Error("status");
    expect(result.reason).toContain("node-a");
    expect(result.reason).toContain("node-b");
    expect(sent).toEqual([]);
  });

  it("counts an outcome another carrier recorded as done", async () => {
    goldenNode();
    const { chain } = fakeChain(2n, [
      Object.assign(new Error("reverted"), {
        code: "CALL_EXCEPTION",
        data: LOCKBOX.encodeErrorResult("OutcomeAlreadyRecorded", [
          "0x" + "00".repeat(32),
        ]),
      }),
    ]);
    expect(await carryOutcome(chain, ["http://node-a"], 1337n, 2n)).toEqual({
      status: "already-recorded",
    });
  });

  it("stops at a stale light client: the locks go home by reclaim", async () => {
    goldenNode();
    const { chain } = fakeChain(2n, [revert("StaleLightClient", [2, 999])]);
    const result = await carryOutcome(chain, ["http://node-a"], 1337n, 2n);
    expect(result.status).toBe("stale-light-client");
  });
});

// ─── No settlement authority (issue 195) ──────────────────────────────────

describe("release without a settlement authority", () => {
  const DEPOSITOR = "0x00000000000000000000000000000000000000a1";
  const WINNER = "0x00000000000000000000000000000000000000b1";
  const LOCK_A = "0x" + "11".repeat(32);
  const LOCK_B = "0x" + "22".repeat(32);
  const outcomes = [
    { lockId: LOCK_A, recipients: [WINNER, DEPOSITOR], amounts: [4n, 6n] },
    { lockId: LOCK_B, recipients: [DEPOSITOR], amounts: [5n] },
  ];
  const lock = (lockId: string, amount: bigint) => ({
    lockId,
    depositor: DEPOSITOR,
    token: "0x" + "e1".repeat(20),
    nonce: 1n,
    amount,
    windowId: 42n,
    pairHash: "0x" + "cd".repeat(32),
    deadline: 1_767_225_600n,
  });

  it("builds only LockBox.releaseByOutcome calls, each with a valid leaf proof", () => {
    const tree = windowOutcomeTree(outcomes);
    const calls = planWindowReleases({
      lockBoxAddress: "0x" + "cd".repeat(20),
      outcomes,
      openLocks: [lock(LOCK_A, 10n), lock(LOCK_B, 5n)],
      recordedRoot: tree.root,
    });
    const selector = LOCKBOX.getFunction("releaseByOutcome")!.selector;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.to).toBe("0x" + "cd".repeat(20));
      expect(call.data.slice(0, 10)).toBe(selector);
    }
    const decoded = LOCKBOX.decodeFunctionData(
      "releaseByOutcome",
      calls[0].data,
    );
    expect(decoded[1].map((p: ethers.Result) => p[0].toLowerCase())).toEqual([
      WINNER,
      DEPOSITOR,
    ]);
  });

  it("refuses to build a release when the rebuilt root differs from the recorded one", () => {
    expect(() =>
      planWindowReleases({
        lockBoxAddress: "0x" + "cd".repeat(20),
        outcomes,
        openLocks: [lock(LOCK_A, 10n)],
        recordedRoot: "0x" + "99".repeat(32),
      }),
    ).toThrow(/differs from the recorded/);
  });

  /** Plan one open lock against a tree of `planned` and LOCK_B's outcome. */
  function planOne(planned: (typeof outcomes)[number], amount: bigint) {
    const window = [planned, outcomes[1]];
    return planWindowReleases({
      lockBoxAddress: "0x" + "cd".repeat(20),
      outcomes: window,
      openLocks: [lock(planned.lockId, amount)],
      recordedRoot: windowOutcomeTree(window).root,
    });
  }

  it("planWindowReleases emits reclaimUnpayable for a leaf with a zero recipient", () => {
    const zero = {
      lockId: LOCK_A,
      recipients: [ethers.ZeroAddress, DEPOSITOR],
      amounts: [4n, 6n],
    };
    const calls = planOne(zero, 10n);
    expect(calls).toHaveLength(1);
    expect(calls[0].data.slice(0, 10)).toBe(
      LOCKBOX.getFunction("reclaimUnpayable")!.selector,
    );
    const decoded = LOCKBOX.decodeFunctionData(
      "reclaimUnpayable",
      calls[0].data,
    );
    expect(decoded[1].map((p: ethers.Result) => p[1])).toEqual([4n, 6n]);
    expect(
      isLeafUnpayable(10n, [{ recipient: ethers.ZeroAddress, amount: 0n }]),
    ).toBe(true);
  });

  it("planWindowReleases emits reclaimUnpayable for a leaf whose payouts sum above the lock amount", () => {
    const over = {
      lockId: LOCK_A,
      recipients: [WINNER, DEPOSITOR],
      amounts: [4n, 7n],
    };
    const calls = planOne(over, 10n);
    expect(calls[0].data.slice(0, 10)).toBe(
      LOCKBOX.getFunction("reclaimUnpayable")!.selector,
    );
    // An overflowing sum is unpayable too, whatever the lock amount.
    const max = (1n << 256n) - 1n;
    expect(
      isLeafUnpayable(max, [
        { recipient: WINNER, amount: max },
        { recipient: DEPOSITOR, amount: 1n },
      ]),
    ).toBe(true);
  });

  it("planWindowReleases emits releaseByOutcome for a payable leaf", () => {
    // A short sum is payable: LockBox sends the remainder to the depositor.
    const short = {
      lockId: LOCK_A,
      recipients: [WINNER],
      amounts: [4n],
    };
    const calls = planOne(short, 10n);
    expect(calls[0].data.slice(0, 10)).toBe(
      LOCKBOX.getFunction("releaseByOutcome")!.selector,
    );
    expect(planOne(outcomes[0], 10n)[0].data.slice(0, 10)).toBe(
      LOCKBOX.getFunction("releaseByOutcome")!.selector,
    );
    expect(isLeafUnpayable(10n, [{ recipient: WINNER, amount: 10n }])).toBe(
      false,
    );
  });

  it("exports no relayer write: no settleFill, refund or settlementAuthority path", () => {
    const relayerNames = [
      "settleFill",
      "refund",
      "withdrawWinnings",
      "executeLockBoxReleases",
      "getRelayerSigner",
      "relayAuctionSettled",
      "relayAuctionRefunded",
      "relayBidUnopened",
      "relayOutcomeScan",
      "planSettlementReleases",
      "planRefundReleases",
    ];
    for (const mod of [bridge, carrier, lockbox]) {
      for (const name of relayerNames) {
        expect(Object.keys(mod)).not.toContain(name);
      }
    }
    const fragments = LOCKBOX.fragments
      .filter((f) => f.type === "function")
      .map((f) => (f as ethers.FunctionFragment).name);
    for (const name of [
      "settleFill",
      "refund",
      "withdrawWinnings",
      "settlementAuthority",
    ]) {
      expect(fragments).not.toContain(name);
    }
  });
});
