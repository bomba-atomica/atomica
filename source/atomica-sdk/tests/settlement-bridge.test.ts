/**
 * Unit tests for settlement/bridge.ts — the Aptos outcome → LockBox relayer.
 *
 * Tests cover:
 *   - scanAuctionOutcomeEvents / queryAuctionSettledEvents: Aptos event parsing
 *   - planSettlementReleases / planRefundReleases: outcome → LockBox releases
 *   - relayAuctionSettled / relayAuctionRefunded / relayBidUnopened: Aptos
 *     reads joined to LockBox calls, signed through an ethers NonceManager
 *
 * All Aptos and Ethereum I/O is mocked; no network calls are made.
 *
 * @see source/atomica-sdk/src/settlement/bridge.ts
 * @see docs/architecture/v0-architecture.md §3.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared mock state ─────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  /** Aptos view responses keyed by function name suffix. */
  views: new Map<string, (args: unknown[], typeArgs: string[]) => unknown[]>(),
  /** LockBox calls recorded by the Contract mock. */
  calls: [] as Array<{ method: string; args: unknown[] }>,
  processed: new Set<string>(),
  /** Outcome ids whose LockBox call reverts. */
  revert: new Set<string>(),
  /** Outcome ids whose LockBox call fails with a given ethers error. */
  errors: new Map<string, object>(),
  nonceManagers: 0,
}));

// ─── Mock ethers ───────────────────────────────────────────────────────────
// vi.mock factories are hoisted — must use class syntax for constructors.

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  class MockJsonRpcProvider {}
  class MockWallet {}
  class MockNonceManager {
    reset = vi.fn();
    constructor() {
      mocks.nonceManagers++;
    }
  }
  class MockContract {
    fakeETH = vi.fn().mockResolvedValue("0x" + "e1".repeat(20));
    fakeUSD = vi.fn().mockResolvedValue("0x" + "aa".repeat(20));
    processedOutcomes = vi.fn(async (id: string) => mocks.processed.has(id));
    refund = vi.fn(async (...args: unknown[]) => {
      if (mocks.revert.has(args[0] as string)) {
        throw Object.assign(
          new Error("execution reverted: InsufficientLocked"),
          {
            code: "CALL_EXCEPTION",
            data: "0x8a6a1e5c" + "00".repeat(32),
          },
        );
      }
      const err = mocks.errors.get(args[0] as string);
      if (err) throw err;
      mocks.calls.push({ method: "refund", args });
      return { wait: async () => ({ hash: "0xrefund", status: 1 }) };
    });
    settleFill = vi.fn(async (...args: unknown[]) => {
      mocks.calls.push({ method: "settleFill", args });
      return { wait: async () => ({ hash: "0xfill", status: 1 }) };
    });
  }
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: MockJsonRpcProvider,
      Wallet: MockWallet,
      NonceManager: MockNonceManager,
      Contract: MockContract,
    },
  };
});

// ─── Mock Aptos SDK ────────────────────────────────────────────────────────

vi.mock("@aptos-labs/ts-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aptos-labs/ts-sdk")>();
  class MockAptos {
    view = vi.fn(
      async ({
        payload,
      }: {
        payload: {
          function: string;
          typeArguments?: string[];
          functionArguments: unknown[];
        };
      }) => {
        const name = payload.function.split("::").slice(-2).join("::");
        const fn = mocks.views.get(name);
        if (!fn) throw new Error(`unexpected view ${name}`);
        return fn(payload.functionArguments, payload.typeArguments ?? []);
      },
    );
  }
  return {
    ...actual,
    Aptos: MockAptos,
    AptosConfig: vi.fn(),
    Network: actual.Network,
  };
});

// ─── Import after mocks ────────────────────────────────────────────────────

import { ethers } from "ethers";
import {
  queryAuctionSettledEvents,
  scanAuctionSettledEvents,
  scanAuctionOutcomeEvents,
  AptosPrunedReadError,
  planSettlementReleases,
  planRefundReleases,
  quoteForFill,
  refundOutcomeId,
  fillOutcomeId,
  relayAuctionSettled,
  relayAuctionRefunded,
  relayBidUnopened,
  relayOutcomeScan,
  executeLockBoxReleases,
  PermanentRelayError,
  isPermanentRelayError,
  parseBidResults,
  RECEIPT_STATUS_REVOKED,
  type AuctionOutcomeScan,
  type AuctionSettledEvent,
  type BridgeConfig,
  type LockReceiptInfo,
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
  ethRpcUrl: "http://localhost:8545",
  lockBoxAddress: "0x" + "cd".repeat(20),
  relayerPrivateKey: "0x" + "ef".repeat(32),
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

  it("decodes AuctionSettled, AuctionRefunded and BidUnopened in ledger order", async () => {
    mockPages([
      makeTx(10, [
        {
          type: `${TEST_CONFIG.contractAddress}::auction::BidUnopened`,
          data: {
            window_id: "4",
            bidder: "0x" + "11".repeat(32),
            collateral_lock_id: "0xabcd",
          },
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
      "BidUnopened",
      "AuctionSettled",
      "AuctionRefunded",
    ]);
    const unopened = scan.events[0];
    if (unopened.kind !== "BidUnopened") throw new Error("kind");
    expect(unopened.event.windowId).toBe(4n);
    expect(ethers.hexlify(unopened.event.collateralLockId)).toBe("0xabcd");
    const refunded = scan.events[2];
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

// ─── Release planning ──────────────────────────────────────────────────────

const SELLER = "0x00000000000000000000000000000000000000a1";
const SELLER_2 = "0x00000000000000000000000000000000000000a2";
const WINNER = "0x00000000000000000000000000000000000000b1";
const LOSER = "0x00000000000000000000000000000000000000b2";
const ETH = 10n ** 18n;
const USD = 10n ** 6n;

function receipt(
  lockId: string,
  user: string,
  amount: bigint,
  status: number,
): LockReceiptInfo {
  return { lockId, user, amount, blockNumber: 1n, status };
}

describe("planSettlementReleases", () => {
  it("pays the winner FakeETH and the seller FakeUSD at the clearing price", () => {
    const releases = planSettlementReleases({
      clearingPrice: 2000n,
      sellers: [receipt("0x01", SELLER, 10n * ETH, 1)],
      bids: [
        {
          isWinner: true,
          fillAmount: 4n * ETH,
          collateral: receipt("0x02", WINNER, 10_000n * USD, 1),
        },
      ],
    });

    expect(releases).toEqual([
      {
        kind: "fill",
        outcomeId: fillOutcomeId("0x01", "0x02"),
        seller: SELLER,
        winner: WINNER,
        baseAmount: 4n * ETH,
        quoteAmount: 8_000n * USD,
      },
      // Excess collateral back to the winner.
      {
        kind: "refund",
        outcomeId: refundOutcomeId("0x02"),
        user: WINNER,
        asset: "FakeUSD",
        amount: 2_000n * USD,
      },
      // Unsold supply back to the seller.
      {
        kind: "refund",
        outcomeId: refundOutcomeId("0x01"),
        user: SELLER,
        asset: "FakeETH",
        amount: 6n * ETH,
      },
    ]);
  });

  it("splits a fill across seller locks in lock_ids order", () => {
    const releases = planSettlementReleases({
      clearingPrice: 1000n,
      sellers: [
        receipt("0x01", SELLER, 3n * ETH, 1),
        receipt("0x03", SELLER_2, 5n * ETH, 1),
      ],
      bids: [
        {
          isWinner: true,
          fillAmount: 8n * ETH,
          collateral: receipt("0x02", WINNER, 8_000n * USD, 1),
        },
      ],
    });
    expect(releases.filter((r) => r.kind === "fill")).toEqual([
      expect.objectContaining({
        seller: SELLER,
        baseAmount: 3n * ETH,
        quoteAmount: 3_000n * USD,
      }),
      expect.objectContaining({
        seller: SELLER_2,
        baseAmount: 5n * ETH,
        quoteAmount: 5_000n * USD,
      }),
    ]);
    expect(releases.filter((r) => r.kind === "refund")).toEqual([]);
  });

  it("refunds a losing bid's collateral only when Aptos released it", () => {
    const releases = planSettlementReleases({
      clearingPrice: 1000n,
      sellers: [receipt("0x01", SELLER, 1n * ETH, RECEIPT_STATUS_REVOKED)],
      bids: [
        {
          isWinner: false,
          fillAmount: 0n,
          collateral: receipt(
            "0x04",
            LOSER,
            500n * USD,
            RECEIPT_STATUS_REVOKED,
          ),
        },
        // Unopened: still claimed on Aptos, handled by relayBidUnopened.
        {
          isWinner: false,
          fillAmount: 0n,
          collateral: receipt("0x05", LOSER, 700n * USD, 1),
        },
      ],
    });
    expect(releases).toEqual([
      {
        kind: "refund",
        outcomeId: refundOutcomeId("0x04"),
        user: LOSER,
        asset: "FakeUSD",
        amount: 500n * USD,
      },
      {
        kind: "refund",
        outcomeId: refundOutcomeId("0x01"),
        user: SELLER,
        asset: "FakeETH",
        amount: 1n * ETH,
      },
    ]);
  });

  it("rejects a fill above the locked supply", () => {
    expect(() =>
      planSettlementReleases({
        clearingPrice: 1n,
        sellers: [receipt("0x01", SELLER, 1n * ETH, 1)],
        bids: [
          {
            isWinner: true,
            fillAmount: 2n * ETH,
            collateral: receipt("0x02", WINNER, 10n * USD, 1),
          },
        ],
      }),
    ).toThrow(/exceeds the locked supply/);
  });

  it("rejects a payment above the winner's collateral", () => {
    expect(() =>
      planSettlementReleases({
        clearingPrice: 2000n,
        sellers: [receipt("0x01", SELLER, 1n * ETH, 1)],
        bids: [
          {
            isWinner: true,
            fillAmount: 1n * ETH,
            collateral: receipt("0x02", WINNER, 1_999n * USD, 1),
          },
        ],
      }),
    ).toThrow(/owes/);
  });

  it("prices FakeUSD with 6 decimals against 18-decimal FakeETH", () => {
    expect(quoteForFill(ETH / 2n, 2010n)).toBe(1_005n * USD);
  });
});

describe("planRefundReleases", () => {
  it("refunds every released seller and collateral lock", () => {
    const releases = planRefundReleases({
      sellers: [
        receipt("0x01", SELLER, 2n * ETH, RECEIPT_STATUS_REVOKED),
        receipt("0x03", SELLER_2, 2n * ETH, 1),
      ],
      collateral: [receipt("0x02", WINNER, 9n * USD, RECEIPT_STATUS_REVOKED)],
    });
    expect(releases).toEqual([
      {
        kind: "refund",
        outcomeId: refundOutcomeId("0x01"),
        user: SELLER,
        asset: "FakeETH",
        amount: 2n * ETH,
      },
      {
        kind: "refund",
        outcomeId: refundOutcomeId("0x02"),
        user: WINNER,
        asset: "FakeUSD",
        amount: 9n * USD,
      },
    ]);
  });
});

// ─── Relays (Aptos reads → LockBox calls) ──────────────────────────────────

/**
 * The receipt's Aptos owner: an Ethereum-derivable account, which does not
 * encode the depositor's address. The relayer must not read the depositor from it.
 */
const DERIVED_OWNER = "0x" + "5d".repeat(32);

/** `get_receipt` returns the depositor's `eth_owner` as lowercase hex bytes. */
function ethOwner(eth: string): string {
  return eth.toLowerCase();
}

function stubReceipts(
  receipts: Record<string, [string, bigint, number]>,
): void {
  mocks.views.set("lock_receipt::get_receipt", (args) => {
    const id = ethers.hexlify(args[0] as Uint8Array);
    const r = receipts[id];
    if (!r) throw new Error(`no receipt ${id}`);
    return [DERIVED_OWNER, String(r[1]), "1", r[2], ethOwner(r[0])];
  });
}

describe("relay handlers", () => {
  beforeEach(() => {
    mocks.views.clear();
    mocks.calls.length = 0;
    mocks.processed.clear();
    mocks.revert.clear();
  });

  it("relayAuctionSettled sends settleFill and refunds through a NonceManager", async () => {
    mocks.views.set("auction::get_bid_results", () => [
      [
        {
          bidder: "0x" + "77".repeat(32),
          fill_amount: String(4n * ETH),
          is_winner: true,
        },
        { bidder: "0x" + "88".repeat(32), fill_amount: "0", is_winner: false },
      ],
    ]);
    mocks.views.set("auction::get_window_lock_ids", () => [
      ["0x01"],
      ["0x02", "0x04"],
    ]);
    mocks.views.set("auction::is_settled", () => [true]);
    stubReceipts({
      "0x01": [SELLER, 10n * ETH, 1],
      "0x02": [WINNER, 8_000n * USD, 1],
      "0x04": [LOSER, 500n * USD, RECEIPT_STATUS_REVOKED],
    });
    const before = mocks.nonceManagers;
    const event: AuctionSettledEvent = {
      windowId: 7n,
      pair: TEST_PAIR,
      clearingPrice: 2000n,
      totalFilled: 4n * ETH,
      winnerCount: 1n,
      lockIds: [],
      pairBcs: new Uint8Array(0),
    };

    const hashes = await relayAuctionSettled(event, {
      ...TEST_CONFIG,
      relayerPrivateKey: "0x" + "01".repeat(32),
    });

    expect(mocks.nonceManagers).toBe(before + 1);
    expect(hashes).toEqual(["0xfill", "0xrefund", "0xrefund"]);
    expect(mocks.calls.map((c) => c.method)).toEqual([
      "settleFill",
      "refund",
      "refund",
    ]);
    expect(mocks.calls[0].args).toEqual([
      fillOutcomeId("0x01", "0x02"),
      ethers.getAddress(SELLER),
      ethers.getAddress(WINNER),
      4n * ETH,
      8_000n * USD,
    ]);
    // Losing bid refunded to the Ethereum owner of its collateral receipt.
    expect(mocks.calls[1].args.slice(1)).toEqual([
      ethers.getAddress(LOSER),
      "0x" + "aa".repeat(20),
      500n * USD,
    ]);
    // Unsold supply back to the seller in FakeETH.
    expect(mocks.calls[2].args.slice(1)).toEqual([
      ethers.getAddress(SELLER),
      "0x" + "e1".repeat(20),
      6n * ETH,
    ]);
  });

  it("skips outcomes LockBox already processed", async () => {
    mocks.views.set("auction::get_window_lock_ids", () => [["0x01"], []]);
    stubReceipts({ "0x01": [SELLER, 3n * ETH, RECEIPT_STATUS_REVOKED] });
    mocks.processed.add(refundOutcomeId("0x01"));

    const hashes = await relayAuctionRefunded(
      {
        windowId: 5n,
        pairBcs: new Uint8Array(0),
        timelockId: 9n,
        reason: 1,
        bidCount: 0n,
        sellerLockCount: 1n,
      },
      TEST_CONFIG,
    );

    expect(hashes).toEqual([]);
    expect(mocks.calls).toEqual([]);
  });

  it("relayAuctionRefunded refunds every released lock of the window", async () => {
    mocks.views.set("auction::get_window_lock_ids", () => [["0x01"], ["0x02"]]);
    stubReceipts({
      "0x01": [SELLER, 3n * ETH, RECEIPT_STATUS_REVOKED],
      "0x02": [WINNER, 9n * USD, RECEIPT_STATUS_REVOKED],
    });

    await relayAuctionRefunded(
      {
        windowId: 5n,
        pairBcs: new Uint8Array(0),
        timelockId: 9n,
        reason: 1,
        bidCount: 1n,
        sellerLockCount: 1n,
      },
      TEST_CONFIG,
    );

    expect(mocks.calls.map((c) => [c.method, c.args[1], c.args[3]])).toEqual([
      ["refund", ethers.getAddress(SELLER), 3n * ETH],
      ["refund", ethers.getAddress(WINNER), 9n * USD],
    ]);
  });

  it("relayBidUnopened refunds the unopened bid's collateral", async () => {
    stubReceipts({ "0xabcd": [LOSER, 700n * USD, 1] });

    await relayBidUnopened(
      {
        windowId: 4n,
        bidder: "0x" + "11".repeat(32),
        collateralLockId: ethers.getBytes("0xabcd"),
      },
      TEST_CONFIG,
    );

    expect(mocks.calls).toEqual([
      {
        method: "refund",
        args: [
          refundOutcomeId("0xabcd"),
          ethers.getAddress(LOSER),
          "0x" + "aa".repeat(20),
          700n * USD,
        ],
      },
    ]);
  });
});

// ─── Poison-pill resistance ────────────────────────────────────────────────

const MOVE_ABORT =
  "Move abort in 0xab::lock_receipt: E_RECEIPT_NOT_FOUND(0x3): receipt not found";

function unopened(
  lockId: string,
  version: bigint,
): AuctionOutcomeScan["events"][number] {
  return {
    kind: "BidUnopened",
    version,
    event: {
      windowId: 4n,
      bidder: "0x" + "11".repeat(32),
      collateralLockId: ethers.getBytes(lockId),
    },
  };
}

describe("relayOutcomeScan", () => {
  beforeEach(() => {
    mocks.views.clear();
    mocks.calls.length = 0;
    mocks.processed.clear();
    mocks.revert.clear();
  });

  it("dead-letters a permanently failing outcome and still relays the next one", async () => {
    mocks.views.set("lock_receipt::get_receipt", (args) => {
      const id = ethers.hexlify(args[0] as Uint8Array);
      if (id === "0xdead") throw new Error(MOVE_ABORT);
      return [DERIVED_OWNER, String(700n * USD), "1", 1, ethOwner(LOSER)];
    });

    const result = await relayOutcomeScan(
      {
        events: [unopened("0xdead", 10n), unopened("0xabcd", 11n)],
        nextVersion: 12n,
      },
      TEST_CONFIG,
      { pair: TEST_PAIR },
    );

    expect(result.nextVersion).toBe(12n);
    expect(result.transientError).toBeUndefined();
    expect(result.deadLetters).toEqual([
      expect.objectContaining({ kind: "BidUnopened", version: 10n }),
    ]);
    expect(result.relayed).toHaveLength(1);
    expect(mocks.calls).toEqual([
      expect.objectContaining({ method: "refund" }),
    ]);
    expect(mocks.calls[0].args[0]).toBe(refundOutcomeId("0xabcd"));
  });

  it("dead-letters a reverting LockBox release and still relays the next outcome", async () => {
    stubReceipts({
      "0x0bad": [LOSER, 700n * USD, 1],
      "0xabcd": [LOSER, 700n * USD, 1],
    });
    mocks.revert.add(refundOutcomeId("0x0bad"));

    const result = await relayOutcomeScan(
      {
        events: [unopened("0x0bad", 10n), unopened("0xabcd", 11n)],
        nextVersion: 12n,
      },
      TEST_CONFIG,
      { pair: TEST_PAIR },
    );

    expect(result.nextVersion).toBe(12n);
    expect(result.deadLetters.map((d) => d.version)).toEqual([10n]);
    expect(result.deadLetters[0].error).toMatch(/InsufficientLocked/);
    expect(mocks.calls.map((c) => c.args[0])).toEqual([
      refundOutcomeId("0xabcd"),
    ]);
  });

  it("stops at a transient error and retries that outcome next poll", async () => {
    mocks.views.set("lock_receipt::get_receipt", () => {
      throw new Error("fetch failed: ECONNREFUSED");
    });

    const result = await relayOutcomeScan(
      {
        events: [unopened("0xabcd", 10n), unopened("0xbeef", 11n)],
        nextVersion: 12n,
      },
      TEST_CONFIG,
      { pair: TEST_PAIR },
    );

    expect(result.nextVersion).toBe(10n);
    expect(result.transientError).toMatch(/ECONNREFUSED/);
    expect(result.deadLetters).toEqual([]);
  });
});

describe("executeLockBoxReleases", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.processed.clear();
    mocks.revert.clear();
  });

  it("sends the rest of the batch after a revert, then reports it", async () => {
    mocks.revert.add(refundOutcomeId("0x01"));
    const refund = (lockId: string) => ({
      kind: "refund" as const,
      outcomeId: refundOutcomeId(lockId),
      user: SELLER,
      asset: "FakeETH" as const,
      amount: 1n,
    });

    const err = await executeLockBoxReleases(
      [refund("0x01"), refund("0x02")],
      TEST_CONFIG,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PermanentRelayError);
    expect(
      (err as PermanentRelayError).failed.map((f) => f.release.outcomeId),
    ).toEqual([refundOutcomeId("0x01")]);
    expect((err as PermanentRelayError).sent).toEqual(["0xrefund"]);
    expect(mocks.calls.map((c) => c.args[0])).toEqual([
      refundOutcomeId("0x02"),
    ]);
  });
});

describe("pair filtering", () => {
  beforeEach(() => {
    mocks.views.clear();
    mocks.calls.length = 0;
  });

  const refunded = (pairBcs: string) => ({
    windowId: 5n,
    pairBcs: ethers.getBytes(pairBcs),
    timelockId: 9n,
    reason: 1,
    bidCount: 0n,
    sellerLockCount: 1n,
  });

  it("dead-letters a refunded window of another pair without reading Aptos", async () => {
    await expect(
      relayAuctionRefunded(refunded("0x0102"), TEST_CONFIG),
    ).rejects.toBeInstanceOf(PermanentRelayError);
    expect(mocks.calls).toEqual([]);
  });

  it("a foreign-pair refund does not block the relayer loop", async () => {
    stubReceipts({ "0xabcd": [LOSER, 700n * USD, 1] });

    const result = await relayOutcomeScan(
      {
        events: [
          { kind: "AuctionRefunded", version: 10n, event: refunded("0x0102") },
          unopened("0xabcd", 11n),
        ],
        nextVersion: 12n,
      },
      TEST_CONFIG,
      { pair: TEST_PAIR },
    );

    expect(result.deadLetters.map((d) => d.version)).toEqual([10n]);
    expect(result.deadLetters[0].error).toMatch(/pair_bcs 0x0102/);
    expect(result.nextVersion).toBe(12n);
    expect(mocks.calls.map((c) => c.args[0])).toEqual([
      refundOutcomeId("0xabcd"),
    ]);
  });

  const settled = (pairBcs?: string): AuctionSettledEvent => ({
    windowId: 7n,
    pair: TEST_PAIR,
    clearingPrice: 1n,
    totalFilled: 0n,
    winnerCount: 0n,
    lockIds: [],
    ...(pairBcs === undefined ? {} : { pairBcs: ethers.getBytes(pairBcs) }),
  });

  it("dead-letters an AuctionSettled of another pair before any read", async () => {
    await expect(
      relayAuctionSettled(settled("0x0102"), TEST_CONFIG),
    ).rejects.toThrow(/serves 0x$/);
    await expect(relayAuctionSettled(settled(), TEST_CONFIG)).rejects.toThrow(
      /no pair_bcs/,
    );
  });

  it("dead-letters an AuctionSettled whose served window is not settled", async () => {
    mocks.views.set("auction::is_settled", () => [false]);
    await expect(
      relayAuctionSettled(settled("0x"), TEST_CONFIG),
    ).rejects.toBeInstanceOf(PermanentRelayError);
  });
});

// ─── Per-lock receipts, error classes, view shapes ─────────────────────────

describe("per-lock receipt amounts", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.processed.clear();
  });

  it("refunds exactly the amount of the one lock a receipt proves", async () => {
    // Issue 171: a receipt is one LockBox lock (lockAmounts of its lock id),
    // so the relayer releases its amount as is.
    mocks.views.set("auction::get_window_lock_ids", () => [["0x02"], []]);
    mocks.views.set("lock_receipt::get_receipt", () => [
      DERIVED_OWNER,
      String(15n * ETH),
      "2",
      RECEIPT_STATUS_REVOKED,
      ethOwner(SELLER),
    ]);

    await relayAuctionRefunded(
      {
        windowId: 5n,
        pairBcs: new Uint8Array(0),
        timelockId: 9n,
        reason: 1,
        bidCount: 0n,
        sellerLockCount: 1n,
      },
      TEST_CONFIG,
    );

    expect(mocks.calls.map((c) => c.args[3])).toEqual([15n * ETH]);
  });
});

describe("isPermanentRelayError", () => {
  it("counts a CALL_EXCEPTION as permanent only with revert evidence", () => {
    expect(
      isPermanentRelayError({ code: "CALL_EXCEPTION", data: "0x1234abcd" }),
    ).toBe(true);
    expect(
      isPermanentRelayError({ code: "CALL_EXCEPTION", receipt: { status: 0 } }),
    ).toBe(true);
    expect(isPermanentRelayError({ code: "CALL_EXCEPTION", data: null })).toBe(
      false,
    );
    expect(isPermanentRelayError({ code: "CALL_EXCEPTION", data: "0x" })).toBe(
      false,
    );
  });

  it("counts deterministic Aptos 4xx as permanent, 429 and 5xx as transient", () => {
    expect(
      isPermanentRelayError({ status: 400, message: "invalid_input" }),
    ).toBe(true);
    expect(
      isPermanentRelayError({ status: 404, message: "function_not_found" }),
    ).toBe(true);
    expect(
      isPermanentRelayError({ status: 429, message: "rate limited" }),
    ).toBe(false);
    expect(isPermanentRelayError({ status: 503, message: "unavailable" })).toBe(
      false,
    );
  });
});

describe("executeLockBoxReleases error handling", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.processed.clear();
    mocks.revert.clear();
    mocks.errors.clear();
  });

  const refund = (lockId: string) => ({
    kind: "refund" as const,
    outcomeId: refundOutcomeId(lockId),
    user: SELLER,
    asset: "FakeETH" as const,
    amount: 1n,
  });

  it("treats an OutcomeAlreadyProcessed revert as done", async () => {
    mocks.errors.set(refundOutcomeId("0x01"), {
      code: "CALL_EXCEPTION",
      data:
        ethers.id("OutcomeAlreadyProcessed(bytes32)").slice(0, 10) +
        refundOutcomeId("0x01").slice(2),
    });
    const hashes = await executeLockBoxReleases(
      [refund("0x01"), refund("0x02")],
      TEST_CONFIG,
    );
    expect(hashes).toEqual(["0xrefund"]);
  });

  it("rethrows a JSON-RPC CALL_EXCEPTION without revert data as transient", async () => {
    const rpc = Object.assign(new Error("could not coalesce error"), {
      code: "CALL_EXCEPTION",
      data: null,
    });
    mocks.errors.set(refundOutcomeId("0x01"), rpc);
    const err = await executeLockBoxReleases(
      [refund("0x01")],
      TEST_CONFIG,
    ).catch((e: unknown) => e);
    expect(err).toBe(rpc);
    expect(isPermanentRelayError(err)).toBe(false);
  });

  it("dead letters carry the failed release's user, token and amount", async () => {
    mocks.revert.add(refundOutcomeId("0x0bad"));
    stubReceipts({ "0x0bad": [LOSER, 700n * USD, 1] });
    const result = await relayOutcomeScan(
      { events: [unopened("0x0bad", 10n)], nextVersion: 11n },
      TEST_CONFIG,
      { pair: TEST_PAIR },
    );
    expect(result.transientError).toBeUndefined();
    expect(result.deadLetters[0].failed).toEqual([
      {
        release: {
          kind: "refund",
          outcomeId: refundOutcomeId("0x0bad"),
          user: ethers.getAddress(LOSER),
          asset: "FakeUSD",
          amount: 700n * USD,
        },
        error: expect.stringMatching(/InsufficientLocked/),
      },
    ]);
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
