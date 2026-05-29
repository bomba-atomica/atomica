/**
 * Unit tests for Aptos auction view query functions.
 *
 * Each view function calls `aptos.view(...)` under the hood. Tests mock the
 * Aptos client so no running chain is required. Return-type shapes and boolean
 * coercions are verified.
 *
 * Functions under test:
 *   - isSettled      → auction::is_settled        → boolean
 *   - getSettlement  → auction::get_settlement     → { clearingPrice, totalFilled }
 *   - getMpk         → timelock_config::get_mpk    → Uint8Array
 *   - isRevealed     → timelock_config::is_revealed → boolean
 *
 * @see source/atomica-sdk/src/aptos/payloads.ts
 * @see docs/architecture/v0-architecture.md §2 — sealed-bid reveal path
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Aptos config so view calls go to our spy ────────────────────────────
// NOTE: vi.mock factories must not reference top-level variables (browser mode).
// Use vi.fn() inline and access via vi.mocked() or module import after the mock.

vi.mock("../src/aptos/config.js", () => ({
  CONTRACT_ADDR: "0xdeadbeef",
  aptos: {
    view: vi.fn(),
    getAccountModules: vi.fn(),
  },
}));

vi.mock("../src/siwe.js", () => ({
  getDerivedAddress: vi.fn(),
}));

vi.mock("../src/transaction.js", () => ({
  submitNativeTransaction: vi.fn(),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import {
  isSettled,
  getSettlement,
  getMpk,
  isRevealed,
} from "../src/aptos/payloads.js";
import * as config from "../src/aptos/config.js";

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const WINDOW_ID = 42n;
const PAIR_BCS = new Uint8Array([0x01, 0x02, 0x03]);
const TIMELOCK_ID = 1n;

// ─── isSettled ─────────────────────────────────────────────────────────────────

describe("isSettled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the view returns [true]", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce([true]);
    const result = await isSettled(WINDOW_ID, PAIR_BCS);
    expect(result).toBe(true);
  });

  it("returns false when the view returns [false]", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce([false]);
    const result = await isSettled(WINDOW_ID, PAIR_BCS);
    expect(result).toBe(false);
  });

  it("return type is boolean", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce([true]);
    const result = await isSettled(WINDOW_ID, PAIR_BCS);
    expect(typeof result).toBe("boolean");
  });

  it("calls view with the correct function path", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce([false]);
    await isSettled(WINDOW_ID, PAIR_BCS);
    expect(config.aptos.view).toHaveBeenCalledOnce();
    const { payload } = vi.mocked(config.aptos.view).mock.calls[0][0] as {
      payload: { function: string; functionArguments: unknown[] };
    };
    expect(payload.function).toContain("::auction::is_settled");
    expect(payload.functionArguments[0]).toBe(WINDOW_ID);
    expect(payload.functionArguments[1]).toBe(PAIR_BCS);
  });
});

// ─── getSettlement ─────────────────────────────────────────────────────────────

describe("getSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns object with clearingPrice (bigint) and totalFilled (bigint)", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce(["1500", "7500"]);
    const result = await getSettlement(WINDOW_ID, PAIR_BCS);
    expect(typeof result.clearingPrice).toBe("bigint");
    expect(typeof result.totalFilled).toBe("bigint");
  });

  it("parses clearingPrice correctly from string", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce(["2000", "0"]);
    const result = await getSettlement(WINDOW_ID, PAIR_BCS);
    expect(result.clearingPrice).toBe(2000n);
  });

  it("parses totalFilled correctly from string", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce(["0", "5000"]);
    const result = await getSettlement(WINDOW_ID, PAIR_BCS);
    expect(result.totalFilled).toBe(5000n);
  });

  it("handles zero clearing price and zero total filled", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce(["0", "0"]);
    const result = await getSettlement(WINDOW_ID, PAIR_BCS);
    expect(result.clearingPrice).toBe(0n);
    expect(result.totalFilled).toBe(0n);
  });

  it("calls view with the correct function path", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce(["100", "500"]);
    await getSettlement(WINDOW_ID, PAIR_BCS);
    const { payload } = vi.mocked(config.aptos.view).mock.calls[0][0] as {
      payload: { function: string };
    };
    expect(payload.function).toContain("::auction::get_settlement");
  });
});

// ─── getMpk ───────────────────────────────────────────────────────────────────

describe("getMpk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Uint8Array", async () => {
    // 48-byte compressed G1 point as a hex string (mimicking on-chain format)
    const hexBytes = "0x" + "ab".repeat(48);
    vi.mocked(config.aptos.view).mockResolvedValueOnce([hexBytes]);
    const result = await getMpk();
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("returns 48 bytes for a 48-byte MPK", async () => {
    const hexBytes = "0x" + "cd".repeat(48);
    vi.mocked(config.aptos.view).mockResolvedValueOnce([hexBytes]);
    const result = await getMpk();
    expect(result.length).toBe(48);
  });

  it("decodes hex bytes correctly", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce(["0xdeadbeef"]);
    const result = await getMpk();
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("strips '0x' prefix before decoding", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce(["0x0102"]);
    const result = await getMpk();
    expect(result[0]).toBe(0x01);
    expect(result[1]).toBe(0x02);
  });

  it("calls view with timelock_config::get_mpk", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce(["0x00"]);
    await getMpk();
    const { payload } = vi.mocked(config.aptos.view).mock.calls[0][0] as {
      payload: { function: string };
    };
    expect(payload.function).toContain("::timelock_config::get_mpk");
  });
});

// ─── isRevealed ───────────────────────────────────────────────────────────────

describe("isRevealed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the view returns [true]", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce([true]);
    const result = await isRevealed(TIMELOCK_ID);
    expect(result).toBe(true);
  });

  it("returns false when the view returns [false]", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce([false]);
    const result = await isRevealed(TIMELOCK_ID);
    expect(result).toBe(false);
  });

  it("return type is boolean", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce([false]);
    const result = await isRevealed(TIMELOCK_ID);
    expect(typeof result).toBe("boolean");
  });

  it("calls view with the correct function path and timelockId", async () => {
    vi.mocked(config.aptos.view).mockResolvedValueOnce([true]);
    await isRevealed(TIMELOCK_ID);
    const { payload } = vi.mocked(config.aptos.view).mock.calls[0][0] as {
      payload: { function: string; functionArguments: unknown[] };
    };
    expect(payload.function).toContain("::timelock_config::is_revealed");
    expect(payload.functionArguments[0]).toBe(TIMELOCK_ID);
  });
});
