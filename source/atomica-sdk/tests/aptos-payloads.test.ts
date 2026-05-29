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
  getSettlePayload,
  getSubmitCleartextPayload,
} from "../src/aptos/payloads.js";

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const WINDOW_ID = 7n;
const PAIR_BCS = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
const U_BYTES = new Uint8Array(48).fill(0xaa); // 48-byte G1 point
const CIPHERTEXT = new Uint8Array(32).fill(0xbb); // AES-GCM ciphertext
const COLLATERAL_LOCK_ID = new Uint8Array(32).fill(0xcc);
const CLEARTEXTS = [100n, 200n, 300n];

// ─── getBidPayload ─────────────────────────────────────────────────────────────

describe("getBidPayload", () => {
  it("function address contains CONTRACT_ADDR", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    ) as InputEntryFunctionData;
    expect(payload.function).toContain("0xdeadbeef");
  });

  it("function string contains module name 'auction'", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    ) as InputEntryFunctionData;
    expect(payload.function).toContain("::auction::");
  });

  it("function string ends with 'submit_bid'", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    ) as InputEntryFunctionData;
    expect(payload.function).toMatch(/::submit_bid$/);
  });

  it("has 5 function arguments matching the Move signature", () => {
    // Move entry fun submit_bid(bidder &signer [implicit], window_id, pair_bcs,
    //   u_bytes, ciphertext, collateral_lock_id) — 5 non-signer args.
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    );
    expect(payload.functionArguments!.length).toBe(5);
  });

  it("passes window_id (bigint) as argument 0", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    );
    expect(payload.functionArguments![0]).toBe(WINDOW_ID);
  });

  it("passes pair_bcs (Uint8Array) as argument 1", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    );
    expect(payload.functionArguments![1]).toBe(PAIR_BCS);
  });

  it("passes u_bytes (Uint8Array) as argument 2", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    );
    expect(payload.functionArguments![2]).toBe(U_BYTES);
  });

  it("passes ciphertext (Uint8Array) as argument 3", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    );
    expect(payload.functionArguments![3]).toBe(CIPHERTEXT);
  });

  it("passes collateral_lock_id (Uint8Array) as argument 4", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    );
    expect(payload.functionArguments![4]).toBe(COLLATERAL_LOCK_ID);
  });

  it("does not add type arguments", () => {
    const payload = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    ) as InputEntryFunctionData;
    expect(payload.typeArguments).toBeUndefined();
  });

  it("is deterministic for the same inputs", () => {
    const p1 = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    ) as InputEntryFunctionData;
    const p2 = getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      U_BYTES,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
    ) as InputEntryFunctionData;
    expect(p1.function).toBe(p2.function);
    expect(p1.functionArguments![0]).toBe(p2.functionArguments![0]);
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
  it("function string ends with 'submit_cleartext_and_clear'", () => {
    const payload = getSubmitCleartextPayload(
      WINDOW_ID,
      PAIR_BCS,
      CLEARTEXTS,
    ) as InputEntryFunctionData;
    expect(payload.function).toMatch(/::submit_cleartext_and_clear$/);
  });

  it("function string contains module name 'auction'", () => {
    const payload = getSubmitCleartextPayload(
      WINDOW_ID,
      PAIR_BCS,
      CLEARTEXTS,
    ) as InputEntryFunctionData;
    expect(payload.function).toContain("::auction::");
  });

  it("has exactly 3 function arguments (window_id, pair_bcs, cleartexts)", () => {
    const payload = getSubmitCleartextPayload(WINDOW_ID, PAIR_BCS, CLEARTEXTS);
    expect(payload.functionArguments!.length).toBe(3);
  });

  it("passes window_id as argument 0 (bigint)", () => {
    const payload = getSubmitCleartextPayload(WINDOW_ID, PAIR_BCS, CLEARTEXTS);
    expect(payload.functionArguments![0]).toBe(WINDOW_ID);
  });

  it("passes pair_bcs as argument 1 (Uint8Array)", () => {
    const payload = getSubmitCleartextPayload(WINDOW_ID, PAIR_BCS, CLEARTEXTS);
    expect(payload.functionArguments![1]).toBe(PAIR_BCS);
  });

  it("passes cleartexts array as argument 2", () => {
    const payload = getSubmitCleartextPayload(WINDOW_ID, PAIR_BCS, CLEARTEXTS);
    expect(payload.functionArguments![2]).toBe(CLEARTEXTS);
  });

  it("preserves individual cleartext bigint values", () => {
    const payload = getSubmitCleartextPayload(WINDOW_ID, PAIR_BCS, CLEARTEXTS);
    const cleartexts = payload.functionArguments![2] as bigint[];
    expect(cleartexts[0]).toBe(100n);
    expect(cleartexts[1]).toBe(200n);
    expect(cleartexts[2]).toBe(300n);
  });

  it("accepts an empty cleartexts array", () => {
    const payload = getSubmitCleartextPayload(WINDOW_ID, PAIR_BCS, []);
    const cleartexts = payload.functionArguments![2] as bigint[];
    expect(cleartexts).toHaveLength(0);
  });
});
