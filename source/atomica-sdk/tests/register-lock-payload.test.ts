/**
 * Unit tests for getRegisterLockPayload and getCreateAuctionPayload.
 *
 * Verifies parameter order and types match the Move entry function signatures:
 *   lock_receipt::register_ethereum_lock<FakeETH>(
 *     account, block_number, block_hash, state_root,
 *     contract_address, user_address, token_address, storage_key,
 *     storage_value, account_proof, storage_proof
 *   )
 *   auction::create_auction(seller, window_id, pair_bcs, lock_id, min_price,
 *     timelock_id, mpk_bytes)
 *   ibe_config::register_timelock(account, deadline_us)
 *
 * Note: Aptos-side fake token mint payload removed — fake tokens mint on Ethereum.
 */

import { describe, it, expect, vi } from "vitest";
import type { InputEntryFunctionData } from "@aptos-labs/ts-sdk";

// Mock the Aptos config to avoid SDK initialization side effects.
vi.mock("../src/aptos/config", () => ({
  CONTRACT_ADDR: "0xtest",
  aptos: { getAccountModules: vi.fn() },
}));

// Mock siwe and transaction so payloads.ts can be imported cleanly.
vi.mock("../src/siwe", () => ({
  getDerivedAddress: vi.fn(),
}));
vi.mock("../src/transaction", () => ({
  submitNativeTransaction: vi.fn(),
}));

import {
  getRegisterLockPayload,
  getCreateAuctionPayload,
  getRegisterTimelockPayload,
  timelockIdFromEvents,
  TIMELOCK_REGISTRATION_EVENT,
} from "../src/aptos/payloads";
import type { LockedBalanceProof } from "../src/ethereum/proofs/generator";

// ── Fixture ──────────────────────────────────────────────────────────────────

function makeMockProof(): LockedBalanceProof {
  return {
    blockNumber: 42,
    blockHash: "0x" + "ab".repeat(32),
    stateRoot: "0x" + "cd".repeat(32),
    contractAddress: "0x" + "11".repeat(20),
    userAddress: "0x" + "22".repeat(20),
    tokenAddress: "0x" + "33".repeat(20),
    storageKey: "0x" + "44".repeat(32),
    storageValue: 1_000_000_000_000_000_000n, // 1 FETH in wei
    accountProof: ["0x" + "55".repeat(20)],
    storageProof: ["0x" + "66".repeat(20)],
    timestamp: 1700000000,
    generatedAt: Date.now(),
  };
}

// ── getRegisterLockPayload ────────────────────────────────────────────────────

describe("getRegisterLockPayload", () => {
  it("targets lock_receipt::register_ethereum_lock", () => {
    const payload = getRegisterLockPayload(
      makeMockProof(),
    ) as InputEntryFunctionData;
    expect(payload.function).toContain(
      "::lock_receipt::register_ethereum_lock",
    );
  });

  it("includes FakeETH as the type argument", () => {
    const payload = getRegisterLockPayload(
      makeMockProof(),
    ) as InputEntryFunctionData;
    expect(payload.typeArguments).toBeDefined();
    expect(payload.typeArguments![0]).toContain("::lock_receipt::FakeETH");
  });

  it("has exactly 10 function arguments matching the Move signature", () => {
    // Move entry function args (excluding implicit `account: &signer`):
    //   0: block_number (u64)
    //   1: block_hash   (vector<u8>)
    //   2: state_root   (vector<u8>)
    //   3: contract_address (vector<u8>)
    //   4: user_address     (vector<u8>)
    //   5: token_address    (vector<u8>)
    //   6: storage_key      (vector<u8>)
    //   7: storage_value    (u256 as decimal string)
    //   8: account_proof    (vector<vector<u8>>)
    //   9: storage_proof    (vector<vector<u8>>)
    const payload = getRegisterLockPayload(makeMockProof());
    expect(payload.functionArguments!.length).toBe(10);
  });

  it("places block_number (number) at index 0", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    expect(payload.functionArguments![0]).toBe(42);
  });

  it("serializes block_hash as 32-byte Uint8Array at index 1", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const blockHashBytes = payload.functionArguments![1] as Uint8Array;
    expect(blockHashBytes).toBeInstanceOf(Uint8Array);
    expect(blockHashBytes.length).toBe(32);
  });

  it("serializes state_root as 32-byte Uint8Array at index 2", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const stateRootBytes = payload.functionArguments![2] as Uint8Array;
    expect(stateRootBytes).toBeInstanceOf(Uint8Array);
    expect(stateRootBytes.length).toBe(32);
  });

  it("serializes contract_address as 20-byte Uint8Array at index 3", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const bytes = payload.functionArguments![3] as Uint8Array;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(20);
  });

  it("serializes user_address as 20-byte Uint8Array at index 4", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const bytes = payload.functionArguments![4] as Uint8Array;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(20);
  });

  it("serializes token_address as 20-byte Uint8Array at index 5", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const bytes = payload.functionArguments![5] as Uint8Array;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(20);
  });

  it("serializes storage_key as 32-byte Uint8Array at index 6", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const bytes = payload.functionArguments![6] as Uint8Array;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
  });

  it("serializes storage_value as decimal string (u256) at index 7", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const storageValue = payload.functionArguments![7];
    expect(typeof storageValue).toBe("string");
    expect(storageValue).toBe("1000000000000000000");
  });

  it("serializes account_proof as Uint8Array[] at index 8", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const proof = payload.functionArguments![8] as Uint8Array[];
    expect(Array.isArray(proof)).toBe(true);
    expect(proof[0]).toBeInstanceOf(Uint8Array);
  });

  it("serializes storage_proof as Uint8Array[] at index 9", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const proof = payload.functionArguments![9] as Uint8Array[];
    expect(Array.isArray(proof)).toBe(true);
    expect(proof[0]).toBeInstanceOf(Uint8Array);
  });

  it("is deterministic for the same proof", () => {
    const proof = makeMockProof();
    const p1 = getRegisterLockPayload(proof) as InputEntryFunctionData;
    const p2 = getRegisterLockPayload(proof) as InputEntryFunctionData;
    expect(p1.function).toBe(p2.function);
    expect(p1.functionArguments![0]).toBe(p2.functionArguments![0]);
  });
});

// ── getCreateAuctionPayload ───────────────────────────────────────────────────

describe("getCreateAuctionPayload", () => {
  const WINDOW_ID = 41n;
  const PAIR_BCS = new Uint8Array([1, 2, 3]);
  const LOCK_ID = new Uint8Array(32).fill(0xcd);
  const MIN_PRICE = 500_000n;
  const TIMELOCK_ID = 9n;
  const MPK = new Uint8Array(96).fill(0xee);

  const build = () =>
    getCreateAuctionPayload(
      WINDOW_ID,
      PAIR_BCS,
      LOCK_ID,
      MIN_PRICE,
      TIMELOCK_ID,
      MPK,
    ) as InputEntryFunctionData;

  it("targets auction::create_auction", () => {
    expect(build().function).toBe("0xtest::auction::create_auction");
  });

  it("sends 6 arguments in the Move order, timelock_id before mpk_bytes", () => {
    // create_auction(seller, window_id, pair_bcs, lock_id, min_price, timelock_id, mpk_bytes)
    expect(build().functionArguments).toEqual([
      WINDOW_ID,
      PAIR_BCS,
      LOCK_ID,
      MIN_PRICE,
      TIMELOCK_ID,
      MPK,
    ]);
  });

  it("does not add type arguments", () => {
    expect(build().typeArguments).toBeUndefined();
  });
});

// ── register_timelock ─────────────────────────────────────────────────────────

describe("getRegisterTimelockPayload", () => {
  it("targets the framework register_timelock with the deadline in microseconds", () => {
    const payload = getRegisterTimelockPayload(
      1_700_000_000_000_000n,
    ) as InputEntryFunctionData;
    expect(payload.function).toBe("0x1::ibe_config::register_timelock");
    expect(payload.functionArguments).toEqual([1_700_000_000_000_000n]);
  });
});

describe("timelockIdFromEvents", () => {
  it("reads timelock_id from the TimelockRegistrationEvent", () => {
    const id = timelockIdFromEvents([
      { type: "0x1::coin::Other", data: {} },
      { type: TIMELOCK_REGISTRATION_EVENT, data: { timelock_id: "12" } },
    ]);
    expect(id).toBe(12n);
  });

  it("throws when the transaction emitted no registration event", () => {
    expect(() => timelockIdFromEvents([])).toThrow(
      /no TimelockRegistrationEvent/,
    );
  });
});
