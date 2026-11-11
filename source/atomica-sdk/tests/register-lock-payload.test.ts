/**
 * Unit tests for getRegisterLockPayload and getCreateAuctionPayload.
 *
 * Verifies parameter order and types match the Move entry function signatures:
 *   lock_receipt::register_ethereum_lock<FakeETH>(
 *     carrier, block_number, user_address, lock_nonce, amount, window_id,
 *     pair_hash, deadline, account_proof, storage_proof
 *   )
 *   0x1::ethereum_headers::latest_block_number(): Option<u64>
 *   auction::create_auction(seller, window_id, pair_bcs, lock_id, min_price,
 *     timelock_id, mpk_bytes)
 *   ibe_config::register_timelock(account, deadline_us)
 *
 * Note: Aptos-side fake token mint payload removed — fake tokens mint on Ethereum.
 */

import { describe, it, expect, vi } from "vitest";
import type { InputEntryFunctionData } from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";

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

import * as payloads from "../src/aptos/payloads";
import {
  getRegisterLockPayload,
  getLatestCertifiedBlock,
  waitForCertifiedBlock,
  getCreateAuctionPayload,
  getRegisterTimelockPayload,
  timelockIdFromEvents,
  TIMELOCK_REGISTRATION_EVENT,
} from "../src/aptos/payloads";
import type { LockedBalanceProof } from "../src/ethereum/proofs/generator";
import type { Aptos } from "@aptos-labs/ts-sdk";

// ── Fixture ──────────────────────────────────────────────────────────────────

// SCOUT(#220) EDIT: window 83075 and deadline 1794700800 follow the old window formula; use a window id and deadline of the new one.
// SCOUT(#221) EDIT: the proof's deadline is no longer a payload argument.
function makeMockProof(): LockedBalanceProof {
  return {
    blockNumber: 42,
    blockHash: "0x" + "ab".repeat(32),
    stateRoot: "0x" + "cd".repeat(32),
    contractAddress: "0x" + "11".repeat(20),
    userAddress: "0x" + "22".repeat(20),
    tokenAddress: "0x" + "33".repeat(20),
    lockNonce: 7n,
    lockId: "0x" + "77".repeat(32),
    amount: 1_000_000_000_000_000_000n, // 1 FETH in wei
    windowId: 83075n,
    pairHash: "0x" + "88".repeat(32),
    deadline: 1794700800n,
    storageKey: "0x" + "44".repeat(32),
    storageValue: 0x99n, // the proven commitment
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

  // SCOUT(#233) EDIT: FakeETH stays the default; add the FakeUSD case.
  it("includes FakeETH as the type argument", () => {
    const payload = getRegisterLockPayload(
      makeMockProof(),
    ) as InputEntryFunctionData;
    expect(payload.typeArguments).toBeDefined();
    expect(payload.typeArguments![0]).toContain("::lock_receipt::FakeETH");
  });

  // SCOUT(#221) EDIT: eight arguments once the deadline goes; the proof indexes 7 and 8 below become 6 and 7.
  it("has exactly 9 function arguments matching the Move signature", () => {
    // Move entry function args (excluding implicit `account: &signer`):
    //   0: block_number  (u64)
    //   1: user_address  (vector<u8>)
    //   2: lock_nonce    (u64 as decimal string)
    //   3: amount        (u256 as decimal string)
    //   4: window_id     (u64 as decimal string)
    //   5: pair_hash     (vector<u8>, 32 bytes)
    //   6: deadline      (u64 as decimal string)
    //   7: account_proof (vector<vector<u8>>)
    //   8: storage_proof (vector<vector<u8>>)
    // The state root, LockBox, token, storage key and commitment are derived on chain.
    const payload = getRegisterLockPayload(makeMockProof());
    expect(payload.functionArguments!.length).toBe(9);
  });

  // SCOUT(#221) EDIT: the deadline at index 6 is no longer sent.
  // SCOUT(#220) EDIT: the pinned "83075" and "1794700800" change with the fixture.
  it("sends the lock fields Aptos hashes into the commitment (indexes 3 to 6)", () => {
    const args = getRegisterLockPayload(makeMockProof()).functionArguments!;
    expect(args[3]).toBe("1000000000000000000");
    expect(args[4]).toBe("83075");
    const pairHash = args[5] as Uint8Array;
    expect(pairHash).toBeInstanceOf(Uint8Array);
    expect(ethers.hexlify(pairHash)).toBe("0x" + "88".repeat(32));
    expect(args[6]).toBe("1794700800");
  });

  it("never sends the proven commitment itself", () => {
    const args = getRegisterLockPayload(makeMockProof()).functionArguments!;
    expect(args).not.toContain("153");
    expect(args).not.toContain(0x99n);
  });

  it("places block_number (number) at index 0", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    expect(payload.functionArguments![0]).toBe(42);
  });

  it("serializes user_address as 20-byte Uint8Array at index 1", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const bytes = payload.functionArguments![1] as Uint8Array;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(20);
  });

  it("serializes lock_nonce as decimal string at index 2", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    expect(payload.functionArguments![2]).toBe("7");
  });

  it("never sends a caller-supplied state root", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const root = ethers.getBytes(makeMockProof().stateRoot);
    for (const arg of payload.functionArguments!) {
      expect(arg).not.toEqual(root);
    }
  });

  it("serializes account_proof as Uint8Array[] at index 7", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const proof = payload.functionArguments![7] as Uint8Array[];
    expect(Array.isArray(proof)).toBe(true);
    expect(proof[0]).toBeInstanceOf(Uint8Array);
  });

  it("serializes storage_proof as Uint8Array[] at index 8", () => {
    const payload = getRegisterLockPayload(makeMockProof());
    const proof = payload.functionArguments![8] as Uint8Array[];
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

// ── Certified Ethereum headers ────────────────────────────────────────────────

describe("Ethereum header source", () => {
  it("exports no submit_header payload builder: only validators write headers", () => {
    const names = Object.keys(payloads);
    expect(names).not.toContain("getSubmitEthereumHeaderPayload");
    expect(names.filter((n) => /submit.*header/i.test(n))).toEqual([]);
  });
});

/** An Aptos client whose latest_block_number view returns `results` in turn. */
function viewClient(results: (string | undefined)[]) {
  const view = vi.fn(async () => {
    const next = results.length > 1 ? results.shift() : results[0];
    return [{ vec: next === undefined ? [] : [next] }];
  });
  return { client: { view } as unknown as Aptos, view };
}

describe("getLatestCertifiedBlock", () => {
  it("reads 0x1::ethereum_headers::latest_block_number", async () => {
    const { client, view } = viewClient(["17"]);
    expect(await getLatestCertifiedBlock(client)).toBe(17);
    expect(view).toHaveBeenCalledWith({
      payload: {
        function: "0x1::ethereum_headers::latest_block_number",
        functionArguments: [],
      },
    });
  });

  it("is undefined before the first certified header", async () => {
    const { client } = viewClient([undefined]);
    expect(await getLatestCertifiedBlock(client)).toBeUndefined();
  });
});

describe("waitForCertifiedBlock", () => {
  it("polls until a certified block covers the lock and returns it", async () => {
    const { client, view } = viewClient([undefined, "40", "45"]);
    expect(await waitForCertifiedBlock(42, 5_000, client, 1)).toBe(45);
    expect(view).toHaveBeenCalledTimes(3);
  });

  it("throws when no certified block covers the lock in time", async () => {
    const { client } = viewClient(["40"]);
    await expect(waitForCertifiedBlock(42, 20, client, 1)).rejects.toThrow(
      /No certified Ethereum block at or after 42.*latest certified: 40/,
    );
  });
});

// ── getCreateAuctionPayload ───────────────────────────────────────────────────

// SCOUT(#238) EDIT: no mpk argument.
// SCOUT(#241) EDIT: no minimum price argument.
// SCOUT(#243) EDIT: no timelock id argument.
// SCOUT(#217) EDIT: MIN_PRICE = 500_000n reads as micro-dollars; use a whole-USD value while the field exists.
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

// SCOUT(#243) REMOVE: the builder is deleted.
describe("getRegisterTimelockPayload", () => {
  it("targets the framework register_timelock with the deadline in microseconds", () => {
    const payload = getRegisterTimelockPayload(
      1_700_000_000_000_000n,
    ) as InputEntryFunctionData;
    expect(payload.function).toBe("0x1::ibe_config::register_timelock");
    expect(payload.functionArguments).toEqual([1_700_000_000_000_000n]);
  });
});

// SCOUT(#243) EDIT: keep or remove with timelockIdFromEvents.
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

describe("planned tests (SCOUT)", () => {
  it.todo(
    "SCOUT(#233) getRegisterLockPayload with asset FakeUSD has the lock_receipt::FakeUSD type argument, and FakeETH with no asset",
  );
  it.todo(
    "SCOUT(#221) getRegisterLockPayload sends eight arguments and no deadline",
  );
  it.todo(
    "SCOUT(#238) getCreateAuctionPayload builds no mpk argument (five arguments only while min_price and timelock_id remain)",
  );
  it.todo(
    "SCOUT(#241) getCreateAuctionPayload has no price value between the lock id and the timelock id",
  );
  it.todo(
    "SCOUT(#243) the create_auction payload has no timelock id: five arguments if it lands before the mpk (238) and reserve price (241) removals, three after all of them",
  );
  it.todo(
    "SCOUT(#243) the payloads module exports no registerTimelock and no getRegisterTimelockPayload",
  );
  it.todo(
    "SCOUT(#243) timelockRegistrarAddress equals object::create_object_address of the module address and the seed",
  );
});
