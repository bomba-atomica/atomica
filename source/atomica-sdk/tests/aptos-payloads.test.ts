/**
 * Unit tests for Aptos auction payload builders.
 *
 * Verifies function address, module name, function name, and argument
 * serialization for the pure payload-builder functions exported from
 * src/aptos/payloads.ts. No running chain is required.
 *
 * Functions under test:
 *   - getBidPayload          → auction::submit_bid
 *   - getSettlePayload       → auction::settle
 *   - getSubmitCleartextPayload → auction::submit_cleartext_and_clear
 *   - getOpenBidPayload / getFinalizeRevealPayload / getRefundExpiredWindowPayload
 *
 * @see source/atomica-sdk/src/aptos/payloads.ts
 * @see docs/architecture/v0-architecture.md §2.5, §2.6, §2.7
 */

import { describe, it, expect, vi } from "vitest";
import type { InputEntryFunctionData } from "@aptos-labs/ts-sdk";

// ─── Mocks (hoisted before imports) ───────────────────────────────────────────

// Suppress Aptos SDK initialisation side-effects and expose CONTRACT_ADDR.
vi.mock("../src/aptos/config.js", () => ({
  CONTRACT_ADDR: "0xdeadbeef",
  aptos: {
    view: vi.fn(),
    getAccountModules: vi.fn(),
  },
}));

// Prevent siwe from trying to resolve on-chain addresses.
vi.mock("../src/siwe.js", () => ({
  getDerivedAddress: vi.fn(),
}));

// Prevent any real transaction submission.
vi.mock("../src/transaction.js", () => ({
  submitNativeTransaction: vi.fn(),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import {
  getBidPayload,
  getFinalizeRevealPayload,
  getOpenBidPayload,
  getRefundExpiredWindowPayload,
  getSettlePayload,
  getSubmitCleartextPayload,
} from "../src/aptos/payloads.js";

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const WINDOW_ID = 7n;
const PAIR_BCS = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
const CIPHERTEXT = new Uint8Array(190).fill(0xbb); // V2 bid ciphertext BCS(vk, U, nonce, C, sig)
const COMMITMENT = new Uint8Array(32).fill(0xaa); // price commitment
const COLLATERAL_LOCK_ID = new Uint8Array(32).fill(0xcc);
const QUANTITY = 1_000_000_000_000_000_000n;
const CLEARTEXTS = [100n, 200n, 300n];
const SALTS = [
  new Uint8Array(32).fill(1),
  new Uint8Array(32).fill(2),
  new Uint8Array(32).fill(3),
];

// ─── getBidPayload ─────────────────────────────────────────────────────────────

describe("getBidPayload", () => {
  const build = () =>
    getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      CIPHERTEXT,
      COMMITMENT,
      COLLATERAL_LOCK_ID,
      QUANTITY,
    ) as InputEntryFunctionData;

  it("targets auction::submit_bid at CONTRACT_ADDR", () => {
    const payload = build();
    expect(payload.function).toContain("0xdeadbeef");
    expect(payload.function).toContain("::auction::");
    expect(payload.function).toMatch(/::submit_bid$/);
  });

  it("has 6 function arguments matching the Move signature", () => {
    // submit_bid(bidder &signer [implicit], window_id, pair_bcs, ciphertext,
    //   commitment, collateral_lock_id, quantity) — 6 non-signer args.
    expect(build().functionArguments!.length).toBe(6);
  });

  it("passes the arguments in Move order", () => {
    const args = build().functionArguments!;
    expect(args[0]).toBe(WINDOW_ID);
    expect(args[1]).toBe(PAIR_BCS);
    expect(args[2]).toBe(CIPHERTEXT);
    expect(args[3]).toBe(COMMITMENT);
    expect(args[4]).toBe(COLLATERAL_LOCK_ID);
    expect(args[5]).toBe(QUANTITY);
  });

  it("does not add type arguments", () => {
    expect(build().typeArguments).toBeUndefined();
  });

  it("is deterministic for the same inputs", () => {
    const p1 = build();
    const p2 = build();
    expect(p1.function).toBe(p2.function);
    expect(p1.functionArguments).toEqual(p2.functionArguments);
  });
});

// ─── getSettlePayload ──────────────────────────────────────────────────────────

describe("getSettlePayload", () => {
  it("function string ends with 'settle'", () => {
    const payload = getSettlePayload(
      WINDOW_ID,
      PAIR_BCS,
    ) as InputEntryFunctionData;
    expect(payload.function).toMatch(/::settle$/);
  });

  it("function string contains module name 'auction'", () => {
    const payload = getSettlePayload(
      WINDOW_ID,
      PAIR_BCS,
    ) as InputEntryFunctionData;
    expect(payload.function).toContain("::auction::");
  });

  it("has exactly 2 function arguments (window_id u64, pair_bcs vector<u8>)", () => {
    const payload = getSettlePayload(WINDOW_ID, PAIR_BCS);
    expect(payload.functionArguments!.length).toBe(2);
  });

  it("passes window_id as argument 0 (bigint)", () => {
    const payload = getSettlePayload(WINDOW_ID, PAIR_BCS);
    expect(payload.functionArguments![0]).toBe(WINDOW_ID);
  });

  it("passes pair_bcs as argument 1 (Uint8Array)", () => {
    const payload = getSettlePayload(WINDOW_ID, PAIR_BCS);
    expect(payload.functionArguments![1]).toBe(PAIR_BCS);
  });

  it("does not add type arguments", () => {
    const payload = getSettlePayload(
      WINDOW_ID,
      PAIR_BCS,
    ) as InputEntryFunctionData;
    expect(payload.typeArguments).toBeUndefined();
  });
});

// ─── getSubmitCleartextPayload ─────────────────────────────────────────────────

describe("getSubmitCleartextPayload", () => {
  it("targets auction::submit_cleartext_and_clear", () => {
    const payload = getSubmitCleartextPayload(
      WINDOW_ID,
      PAIR_BCS,
      CLEARTEXTS,
      SALTS,
    ) as InputEntryFunctionData;
    expect(payload.function).toContain("::auction::");
    expect(payload.function).toMatch(/::submit_cleartext_and_clear$/);
  });

  it("has 4 function arguments (window_id, pair_bcs, cleartexts, salts)", () => {
    const payload = getSubmitCleartextPayload(
      WINDOW_ID,
      PAIR_BCS,
      CLEARTEXTS,
      SALTS,
    );
    expect(payload.functionArguments!.length).toBe(4);
  });

  it("passes the arguments in Move order", () => {
    const args = getSubmitCleartextPayload(
      WINDOW_ID,
      PAIR_BCS,
      CLEARTEXTS,
      SALTS,
    ).functionArguments!;
    expect(args[0]).toBe(WINDOW_ID);
    expect(args[1]).toBe(PAIR_BCS);
    expect(args[2]).toBe(CLEARTEXTS);
    expect(args[3]).toBe(SALTS);
  });

  it("accepts empty arrays", () => {
    const args = getSubmitCleartextPayload(
      WINDOW_ID,
      PAIR_BCS,
      [],
      [],
    ).functionArguments!;
    expect(args[2]).toHaveLength(0);
    expect(args[3]).toHaveLength(0);
  });
});

// ─── getOpenBidPayload / getFinalizeRevealPayload / getRefundExpiredWindowPayload

describe("open, finalize and refund payloads", () => {
  it("getOpenBidPayload targets auction::open_bid with 5 arguments", () => {
    const payload = getOpenBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      2n,
      2010n,
      SALTS[0],
    ) as InputEntryFunctionData;
    expect(payload.function).toMatch(/::auction::open_bid$/);
    expect(payload.functionArguments).toEqual([
      WINDOW_ID,
      PAIR_BCS,
      2n,
      2010n,
      SALTS[0],
    ]);
  });

  it("getFinalizeRevealPayload targets auction::finalize_reveal", () => {
    const payload = getFinalizeRevealPayload(
      WINDOW_ID,
      PAIR_BCS,
    ) as InputEntryFunctionData;
    expect(payload.function).toMatch(/::auction::finalize_reveal$/);
    expect(payload.functionArguments).toEqual([WINDOW_ID, PAIR_BCS]);
  });

  it("getRefundExpiredWindowPayload targets auction::refund_expired_window", () => {
    const payload = getRefundExpiredWindowPayload(
      WINDOW_ID,
      PAIR_BCS,
    ) as InputEntryFunctionData;
    expect(payload.function).toMatch(/::auction::refund_expired_window$/);
    expect(payload.functionArguments).toEqual([WINDOW_ID, PAIR_BCS]);
  });
});
