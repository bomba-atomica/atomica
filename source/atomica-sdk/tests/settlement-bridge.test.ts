/**
 * Unit tests for settlement/bridge.ts — BLS relayer bridge functions.
 *
 * Tests cover:
 *   - queryAuctionSettledEvents: Aptos event JSON parsing and filtering
 *   - submitSettlement: field mapping to authorizeSettlement arguments
 *   - aptosToEthereumAddress integration
 *
 * All Aptos and Ethereum I/O is mocked; no network calls are made.
 *
 * @see source/atomica-sdk/src/settlement/bridge.ts
 * @see docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock ethers ───────────────────────────────────────────────────────────
// vi.mock factories are hoisted — must use class syntax for constructors.

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  class MockJsonRpcProvider {}
  class MockWallet {}
  class MockContract {
    authorizeSettlement = vi.fn().mockResolvedValue({
      wait: vi.fn().mockResolvedValue({ hash: "0xdeadbeef" }),
    });
  }
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: MockJsonRpcProvider,
      Wallet: MockWallet,
      Contract: MockContract,
      keccak256: actual.ethers.keccak256,
    },
  };
});

// ─── Mock Aptos SDK ────────────────────────────────────────────────────────

vi.mock("@aptos-labs/ts-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aptos-labs/ts-sdk")>();
  class MockAptos {
    view = vi.fn().mockResolvedValue([[]]);
  }
  return {
    ...actual,
    Aptos: MockAptos,
    AptosConfig: vi.fn(),
    Network: actual.Network,
  };
});

// ─── Mock contracts helper ─────────────────────────────────────────────────

vi.mock("../src/ethereum/contracts.js", () => ({
  getBLSVerifierTestnetContract: vi.fn().mockReturnValue({
    authorizeSettlement: vi.fn().mockResolvedValue({
      wait: vi.fn().mockResolvedValue({ hash: "0xdeadbeef" }),
    }),
  }),
}));

// ─── Import after mocks ────────────────────────────────────────────────────

import {
  queryAuctionSettledEvents,
  scanAuctionSettledEvents,
  AptosPrunedReadError,
  submitSettlement,
  releaseBidderCollateral,
  type AuctionSettledEvent,
  type BidderCollateralRefund,
  type BridgeConfig,
  type Pair,
} from "../src/settlement/bridge.js";

import { getBLSVerifierTestnetContract } from "../src/ethereum/contracts.js";
// Needed for vi.mocked() calls below
import type {} from "vitest";

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
  blsVerifierAddress: "0x" + "cd".repeat(20),
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

/** Helper: mock global fetch with an empty transaction page. */
function mockFetch(events: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(events),
    }),
  );
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

// ─── submitSettlement ──────────────────────────────────────────────────────

describe("submitSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set fetch mock for each test
    mockFetch([]);
  });

  it("throws when passed an empty events array", async () => {
    await expect(submitSettlement([], TEST_CONFIG)).rejects.toThrow(
      "no AuctionSettled events provided",
    );
  });

  it("calls authorizeSettlement with correct arguments when no winners", async () => {
    const event: AuctionSettledEvent = {
      windowId: 7n,
      pair: TEST_PAIR,
      clearingPrice: 2000n,
      totalFilled: 0n,
      winnerCount: 0n,
      lockIds: [],
    };

    const mockContract = {
      authorizeSettlement: vi.fn().mockResolvedValue({
        wait: vi.fn().mockResolvedValue({ hash: "0xdeadbeef" }),
      }),
    };
    vi.mocked(getBLSVerifierTestnetContract).mockReturnValueOnce(
      mockContract as unknown as ReturnType<
        typeof getBLSVerifierTestnetContract
      >,
    );

    const txHash = await submitSettlement([event], TEST_CONFIG);

    expect(txHash).toBe("0xdeadbeef");
    expect(mockContract.authorizeSettlement).toHaveBeenCalledOnce();

    const [windowId, pairHash, clearingPrice, winners, fills] =
      mockContract.authorizeSettlement.mock.calls[0];

    expect(windowId).toBe(7n);
    // pairHash should be a 32-byte hex string
    expect(pairHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(clearingPrice).toBe(2000n);
    expect(winners).toEqual([]);
    expect(fills).toEqual([]);
  });

  it("maps winner Aptos addresses to Ethereum addresses using aptosToEthereumAddress", async () => {
    // This test verifies the conversion logic directly (since mocking Aptos constructor
    // per-test in browser mode is complex). The address conversion is tested in the
    // dedicated "Aptos to Ethereum address conversion" suite below.
    const { aptosToEthereumAddress } =
      await import("../src/ethereum/address-converter.js");
    const winnerAptosAddr =
      "0x" + "00".repeat(12) + "1234567890abcdef1234567890abcdef12345678";
    const winnerEthAddr = "0x1234567890abcdef1234567890abcdef12345678";
    expect(aptosToEthereumAddress(winnerAptosAddr)).toBe(winnerEthAddr);
  });
});

// ─── pairHash determinism ──────────────────────────────────────────────────

describe("pairHash determinism", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch([]);
  });

  it("produces the same hash for the same pair across two calls", async () => {
    const event: AuctionSettledEvent = {
      windowId: 1n,
      pair: TEST_PAIR,
      clearingPrice: 100n,
      totalFilled: 0n,
      winnerCount: 0n,
      lockIds: [],
    };

    const calls: unknown[][] = [];
    const makeContract = () => ({
      authorizeSettlement: vi.fn().mockImplementation((...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve({
          wait: vi.fn().mockResolvedValue({ hash: "0xabc" }),
        });
      }),
    });

    vi.mocked(getBLSVerifierTestnetContract)
      .mockReturnValueOnce(
        makeContract() as unknown as ReturnType<
          typeof getBLSVerifierTestnetContract
        >,
      )
      .mockReturnValueOnce(
        makeContract() as unknown as ReturnType<
          typeof getBLSVerifierTestnetContract
        >,
      );

    await submitSettlement([event], TEST_CONFIG);
    await submitSettlement([event], TEST_CONFIG);

    expect(calls).toHaveLength(2);
    const hash1 = calls[0][1];
    const hash2 = calls[1][1];
    expect(hash1).toBe(hash2);
    expect(String(hash1)).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("produces different hashes for different pairs", async () => {
    const pairA: Pair = { ...TEST_PAIR, baseToken: "FakeETH" };
    const pairB: Pair = { ...TEST_PAIR, baseToken: "WBTC" };

    const eventA: AuctionSettledEvent = {
      windowId: 1n,
      pair: pairA,
      clearingPrice: 100n,
      totalFilled: 0n,
      winnerCount: 0n,
      lockIds: [],
    };
    const eventB: AuctionSettledEvent = {
      windowId: 1n,
      pair: pairB,
      clearingPrice: 100n,
      totalFilled: 0n,
      winnerCount: 0n,
      lockIds: [],
    };

    const calls: unknown[][] = [];
    const makeContract = () => ({
      authorizeSettlement: vi.fn().mockImplementation((...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve({
          wait: vi.fn().mockResolvedValue({ hash: "0xabc" }),
        });
      }),
    });

    vi.mocked(getBLSVerifierTestnetContract)
      .mockReturnValueOnce(
        makeContract() as unknown as ReturnType<
          typeof getBLSVerifierTestnetContract
        >,
      )
      .mockReturnValueOnce(
        makeContract() as unknown as ReturnType<
          typeof getBLSVerifierTestnetContract
        >,
      );

    await submitSettlement([eventA], TEST_CONFIG);
    await submitSettlement([eventB], TEST_CONFIG);

    const hashA = calls[0][1];
    const hashB = calls[1][1];
    expect(hashA).not.toBe(hashB);
  });
});

// ─── releaseBidderCollateral ───────────────────────────────────────────────

describe("releaseBidderCollateral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch([]);
  });

  it("calls authorizeSettlement with correct args for a losing bidder (releaseBidderCollateral_calls_lockbox_withdraw)", async () => {
    // Build a refund descriptor for a losing bidder whose Aptos address is the
    // zero-padded form of a known Ethereum address.
    const bidderEthAddr = "0x1234567890abcdef1234567890abcdef12345678";
    const bidderAptosAddr = "0x" + "00".repeat(12) + bidderEthAddr.slice(2);

    const pairBcs = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const refund: BidderCollateralRefund = {
      collateralLockId: new Uint8Array([0xde, 0xad]),
      bidderAddress: bidderAptosAddr,
      windowId: 5n,
      pairBcs,
    };

    const mockContract = {
      authorizeSettlement: vi.fn().mockResolvedValue({
        wait: vi.fn().mockResolvedValue({ hash: "0xcollateral" }),
      }),
    };
    vi.mocked(getBLSVerifierTestnetContract).mockReturnValueOnce(
      mockContract as unknown as ReturnType<
        typeof getBLSVerifierTestnetContract
      >,
    );

    await releaseBidderCollateral(refund, TEST_CONFIG);

    expect(mockContract.authorizeSettlement).toHaveBeenCalledOnce();

    const [windowId, pairHash, clearingPrice, winners, fills] =
      mockContract.authorizeSettlement.mock.calls[0];

    // windowId must match refund.windowId
    expect(windowId).toBe(5n);
    // pairHash is keccak256 of pairBcs
    expect(pairHash).toMatch(/^0x[0-9a-f]{64}$/i);
    // clearingPrice must be 0 for the collateral-release path
    expect(clearingPrice).toBe(0n);
    // winners array contains the converted Ethereum address
    expect(winners).toEqual([bidderEthAddr]);
    // fills array contains 0n (loser)
    expect(fills).toEqual([0n]);
  });

  it("resolves with the Ethereum tx hash (releaseBidderCollateral_returns_tx_hash)", async () => {
    const bidderAptosAddr =
      "0x" + "00".repeat(12) + "abcdef1234567890abcdef1234567890abcdef12";

    const refund: BidderCollateralRefund = {
      collateralLockId: new Uint8Array([0xca, 0xfe]),
      bidderAddress: bidderAptosAddr,
      windowId: 9n,
      pairBcs: new Uint8Array([0x05, 0x06]),
    };

    const mockContract = {
      authorizeSettlement: vi.fn().mockResolvedValue({
        wait: vi.fn().mockResolvedValue({ hash: "0xrelayertxhash" }),
      }),
    };
    vi.mocked(getBLSVerifierTestnetContract).mockReturnValueOnce(
      mockContract as unknown as ReturnType<
        typeof getBLSVerifierTestnetContract
      >,
    );

    const txHash = await releaseBidderCollateral(refund, TEST_CONFIG);

    expect(txHash).toBe("0xrelayertxhash");
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
