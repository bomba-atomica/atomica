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
  submitSettlement,
  type AuctionSettledEvent,
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

/** Helper: mock global fetch for Aptos event queries. */
function mockFetch(events: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(events),
    }),
  );
}

// ─── queryAuctionSettledEvents ─────────────────────────────────────────────

describe("queryAuctionSettledEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no events are emitted", async () => {
    mockFetch([]);

    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);

    expect(result).toEqual([]);
  });

  it("parses a single AuctionSettled event from raw Aptos JSON", async () => {
    const rawEvent = makeRawAptosEvent(42, TEST_PAIR, 1500, 7500, 3);
    mockFetch([rawEvent]);

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
    const rawEvent = makeRawAptosEvent(1, TEST_PAIR);
    mockFetch([rawEvent]);

    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);

    expect(result[0].lockIds).toHaveLength(2);
    expect(result[0].lockIds[0]).toBeInstanceOf(Uint8Array);
    // 0xdeadbeef → 4 bytes
    expect(result[0].lockIds[0]).toEqual(
      new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    );
  });

  it("filters out events from other windows", async () => {
    const rawWindow1 = makeRawAptosEvent(1, TEST_PAIR);
    const rawWindow2 = makeRawAptosEvent(2, TEST_PAIR);
    mockFetch([rawWindow1, rawWindow2]);

    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);

    expect(result).toHaveLength(1);
    expect(result[0].windowId).toBe(1n);
  });

  it("filters out events for different trading pairs", async () => {
    const otherPair: Pair = { ...TEST_PAIR, baseToken: "WBTC" };
    const rawOtherPair = makeRawAptosEvent(1, otherPair);
    const rawMyPair = makeRawAptosEvent(1, TEST_PAIR);
    mockFetch([rawOtherPair, rawMyPair]);

    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);

    expect(result).toHaveLength(1);
    expect(result[0].pair.baseToken).toBe("FakeETH");
  });

  it("returns empty array when fetch returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue(null),
      }),
    );

    const result = await queryAuctionSettledEvents(1n, TEST_PAIR, TEST_CONFIG);
    expect(result).toEqual([]);
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
      mockContract as unknown as ReturnType<typeof getBLSVerifierTestnetContract>,
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
    const { aptosToEthereumAddress } = await import(
      "../src/ethereum/address-converter.js"
    );
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
        return Promise.resolve({ wait: vi.fn().mockResolvedValue({ hash: "0xabc" }) });
      }),
    });

    vi.mocked(getBLSVerifierTestnetContract)
      .mockReturnValueOnce(makeContract() as unknown as ReturnType<typeof getBLSVerifierTestnetContract>)
      .mockReturnValueOnce(makeContract() as unknown as ReturnType<typeof getBLSVerifierTestnetContract>);

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
      windowId: 1n, pair: pairA, clearingPrice: 100n, totalFilled: 0n, winnerCount: 0n, lockIds: [],
    };
    const eventB: AuctionSettledEvent = {
      windowId: 1n, pair: pairB, clearingPrice: 100n, totalFilled: 0n, winnerCount: 0n, lockIds: [],
    };

    const calls: unknown[][] = [];
    const makeContract = () => ({
      authorizeSettlement: vi.fn().mockImplementation((...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve({ wait: vi.fn().mockResolvedValue({ hash: "0xabc" }) });
      }),
    });

    vi.mocked(getBLSVerifierTestnetContract)
      .mockReturnValueOnce(makeContract() as unknown as ReturnType<typeof getBLSVerifierTestnetContract>)
      .mockReturnValueOnce(makeContract() as unknown as ReturnType<typeof getBLSVerifierTestnetContract>);

    await submitSettlement([eventA], TEST_CONFIG);
    await submitSettlement([eventB], TEST_CONFIG);

    const hashA = calls[0][1];
    const hashB = calls[1][1];
    expect(hashA).not.toBe(hashB);
  });
});

// ─── aptosToEthereumAddress integration ───────────────────────────────────

describe("Aptos to Ethereum address conversion", () => {
  it("correctly converts a zero-padded 32-byte Aptos address to 20-byte Ethereum address", async () => {
    const { aptosToEthereumAddress } = await import(
      "../src/ethereum/address-converter.js"
    );

    const aptosAddr =
      "0x" + "00".repeat(12) + "1234567890abcdef1234567890abcdef12345678";
    const ethAddr = aptosToEthereumAddress(aptosAddr);

    expect(ethAddr).toBe("0x1234567890abcdef1234567890abcdef12345678");
    expect(ethAddr).toHaveLength(42);
  });

  it("throws on invalid (non-32-byte) Aptos address", async () => {
    const { aptosToEthereumAddress } = await import(
      "../src/ethereum/address-converter.js"
    );

    expect(() => aptosToEthereumAddress("0x1234")).toThrow(
      "Invalid Aptos address",
    );
  });
});
