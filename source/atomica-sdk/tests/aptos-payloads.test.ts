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
 *   - getOpenBidsPayload / getFinalizeWindowPayload / getRefundExpiredWindowPayload
 *   - getUnwindPayload            → auction::unwind
 *   - getCancelUnauctionedPayload → lock_receipt::cancel_unauctioned<Ethereum, Asset>
 *   - getSiweDomain / assertSiweDomain → eth_proof::siwe_domain
 *
 * @see source/atomica-sdk/src/aptos/payloads.ts
 * @see docs/architecture/v0-architecture.md §2.5, §2.6, §2.7
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateTransactionPayloadWithABI,
  parseTypeTag,
  TypeTagU64,
  TypeTagVector,
  type EntryFunctionABI,
  type InputEntryFunctionData,
  type TransactionPayloadEntryFunction,
} from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";

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

import { aptos } from "../src/aptos/config.js";
import {
  assertSiweDomain,
  getCancelUnauctionedPayload,
  getSiweDomain,
  getUnwindPayload,
  SiweDomainMismatchError,
  getBidPayload,
  getFinalizeWindowPayload,
  getOpenBidsPayload,
  getRefundExpiredWindowPayload,
  getSettlePayload,
  LAUNCH_PAIR_BCS,
  MAX_OPEN_BIDS_PER_CALL,
} from "../src/aptos/payloads.js";

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const WINDOW_ID = 7n;
const PAIR_BCS = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
const CIPHERTEXT = new Uint8Array(190).fill(0xbb); // V2 bid ciphertext BCS(vk, U, nonce, C, sig)
const COLLATERAL_LOCK_ID = new Uint8Array(32).fill(0xcc);
const QUANTITY = 1_000_000_000_000_000_000n;

// ─── getBidPayload ─────────────────────────────────────────────────────────────

describe("getBidPayload", () => {
  const build = () =>
    getBidPayload(
      WINDOW_ID,
      PAIR_BCS,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
      QUANTITY,
    ) as InputEntryFunctionData;

  it("targets auction::submit_bid at CONTRACT_ADDR", () => {
    const payload = build();
    expect(payload.function).toContain("0xdeadbeef");
    expect(payload.function).toContain("::auction::");
    expect(payload.function).toMatch(/::submit_bid$/);
  });

  it("getBidPayload has five function arguments and no commitment", () => {
    // submit_bid(bidder &signer [implicit], window_id, pair_bcs, ciphertext,
    //   collateral_lock_id, quantity) — 5 non-signer args.
    expect(build().functionArguments).toEqual([
      WINDOW_ID,
      PAIR_BCS,
      CIPHERTEXT,
      COLLATERAL_LOCK_ID,
      QUANTITY,
    ]);
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

// ─── getOpenBidsPayload / getFinalizeWindowPayload / getRefundExpiredWindowPayload

describe("open, finalize and refund payloads", () => {
  it("getOpenBidsPayload targets auction::open_bids with the window id, the pair bytes and max_bids", () => {
    const payload = getOpenBidsPayload(
      WINDOW_ID,
      PAIR_BCS,
      MAX_OPEN_BIDS_PER_CALL,
    ) as InputEntryFunctionData;
    expect(payload.function).toBe("0xdeadbeef::auction::open_bids");
    expect(payload.functionArguments).toEqual([
      WINDOW_ID,
      PAIR_BCS,
      MAX_OPEN_BIDS_PER_CALL,
    ]);
    expect(payload.typeArguments).toBeUndefined();
  });

  it("getFinalizeWindowPayload targets auction::finalize_window with the window id and the pair bytes", () => {
    const payload = getFinalizeWindowPayload(
      WINDOW_ID,
      PAIR_BCS,
    ) as InputEntryFunctionData;
    expect(payload.function).toBe("0xdeadbeef::auction::finalize_window");
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

describe("no faucet claim", () => {
  it("the payloads module exports no getClaimMintPayload and no submitClaim", async () => {
    const payloads = await import("../src/aptos/payloads.js");
    for (const name of [
      "getClaimMintPayload",
      "submitClaim",
      "getFakeEthBalance",
    ]) {
      expect(Object.keys(payloads)).not.toContain(name);
    }
  });
});

describe("launch pair", () => {
  it("LAUNCH_PAIR_BCS equals the BCS of the launch Pair (ethereum, FakeETH, ethereum, FakeUSD)", () => {
    // Move BCS of a struct of four vector<u8>: each field is a ULEB128 length
    // then its bytes, in field order.
    const field = (s: string) => [s.length, ...new TextEncoder().encode(s)];
    const expected = new Uint8Array([
      ...field("ethereum"),
      ...field("FakeETH"),
      ...field("ethereum"),
      ...field("FakeUSD"),
    ]);
    expect(LAUNCH_PAIR_BCS).toEqual(expected);
    expect(LAUNCH_PAIR_BCS.length).toBe(34);
  });
});

// ─── Permissionless unwind payloads (issue 195) ───────────────────────────────

/** The mocked CONTRACT_ADDR padded to 32 bytes, as the strict parser wants it. */
const FULL_ADDR = "0x" + "00".repeat(28) + "deadbeef";

/**
 * Encode a payload as Aptos does, against the Move signature of the entry.
 * Returns the type arguments (with the short address again) and the BCS of
 * each argument.
 */
function entryBcs(
  payload: InputEntryFunctionData,
  abi: EntryFunctionABI,
): { typeArgs: string[]; args: string[] } {
  const full = (t: string) => t.replaceAll("0xdeadbeef", FULL_ADDR);
  const built = generateTransactionPayloadWithABI({
    function: full(payload.function) as `${string}::${string}::${string}`,
    typeArguments: (payload.typeArguments ?? []).map((t) => full(String(t))),
    functionArguments: payload.functionArguments,
    abi,
  }) as TransactionPayloadEntryFunction;
  return {
    typeArgs: built.entryFunction.type_args.map((t) =>
      t.toString().replaceAll(FULL_ADDR, "0xdeadbeef"),
    ),
    args: built.entryFunction.args.map((a) => ethers.hexlify(a.bcsToBytes())),
  };
}

describe("getUnwindPayload", () => {
  const payload = getUnwindPayload(
    WINDOW_ID,
    PAIR_BCS,
  ) as InputEntryFunctionData;

  it("targets auction::unwind with no type arguments", () => {
    expect(payload.function).toBe("0xdeadbeef::auction::unwind");
    expect(payload.typeArguments).toBeUndefined();
  });

  it("encodes (window_id: u64, pair_bcs: vector<u8>) as Move BCS", () => {
    const bcs = entryBcs(payload, {
      typeParameters: [],
      parameters: [new TypeTagU64(), new TypeTagVector(parseTypeTag("u8"))],
    });
    expect(bcs.typeArgs).toEqual([]);
    expect(bcs.args).toEqual([
      "0x0700000000000000", // u64 7, little-endian
      "0x0401020304", // ULEB128 length 4, then the bytes
    ]);
  });
});

describe("getCancelUnauctionedPayload", () => {
  it("targets lock_receipt::cancel_unauctioned<Ethereum, FakeETH>", () => {
    const payload = getCancelUnauctionedPayload(
      "FakeETH",
      COLLATERAL_LOCK_ID,
    ) as InputEntryFunctionData;
    expect(payload.function).toBe(
      "0xdeadbeef::lock_receipt::cancel_unauctioned",
    );
    const bcs = entryBcs(payload, {
      typeParameters: [{ constraints: [] }, { constraints: [] }],
      parameters: [new TypeTagVector(parseTypeTag("u8"))],
    });
    expect(bcs.typeArgs).toEqual([
      "0xdeadbeef::lock_receipt::Ethereum",
      "0xdeadbeef::lock_receipt::FakeETH",
    ]);
    expect(bcs.args).toEqual(["0x20" + "cc".repeat(32)]);
  });

  it("names the FakeUSD receipt registry for a collateral lock", () => {
    const payload = getCancelUnauctionedPayload(
      "FakeUSD",
      COLLATERAL_LOCK_ID,
    ) as InputEntryFunctionData;
    expect(payload.typeArguments).toEqual([
      "0xdeadbeef::lock_receipt::Ethereum",
      "0xdeadbeef::lock_receipt::FakeUSD",
    ]);
  });
});

// ─── SIWE domain guard (issue 195) ────────────────────────────────────────────

describe("assertSiweDomain", () => {
  const view = aptos.view as unknown as ReturnType<typeof vi.fn>;

  it("reads eth_proof::siwe_domain as UTF-8", async () => {
    view.mockResolvedValueOnce([
      ethers.hexlify(ethers.toUtf8Bytes("app.example:443")),
    ]);
    expect(await getSiweDomain()).toBe("app.example:443");
    expect(view.mock.calls.at(-1)?.[0].payload.function).toBe(
      "0xdeadbeef::eth_proof::siwe_domain",
    );
  });

  it("passes when the host equals the pinned domain", async () => {
    view.mockResolvedValueOnce([
      ethers.hexlify(ethers.toUtf8Bytes("localhost:3000")),
    ]);
    await expect(assertSiweDomain("localhost:3000")).resolves.toBeUndefined();
  });

  it("throws and names the expected domain on another host", async () => {
    view.mockResolvedValueOnce([
      ethers.hexlify(ethers.toUtf8Bytes("localhost:3000")),
    ]);
    const err = await assertSiweDomain("evil.example").catch((e) => e);
    expect(err).toBeInstanceOf(SiweDomainMismatchError);
    expect((err as SiweDomainMismatchError).expected).toBe("localhost:3000");
    expect((err as Error).message).toContain("localhost:3000");
  });
});
