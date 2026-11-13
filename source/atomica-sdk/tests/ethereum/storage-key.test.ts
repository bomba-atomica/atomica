import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  calculateLockStorageKey,
  getLockId,
  LOCK_COMMITMENTS_SLOT,
} from "../../src/ethereum/proofs/storage-key";
import {
  auctionKey,
  currentWindowId,
  ETH_RECLAIM_DELAY_SECS,
  ethLockDeadline,
  lockBinding,
  lockCommitment,
  pairHashOf,
  parseWindowSchedule,
  PRODUCTION_WINDOW_SCHEDULE,
  WINDOW_AFTERNOON_CLOSE_SECS,
  WINDOW_DAY_SECS,
  WINDOW_MORNING_CLOSE_SECS,
  windowCloseSecs,
} from "../../src/ethereum/lock-binding";
import windowTable from "../fixtures/window_clock_vectors.json";

/**
 * Lock id, storage key and commitment of one LockBox lock (issues 171, 203).
 *
 * The pinned values were read from the proof-gated LockBox on anvil
 * (getLockId, commitmentStorageKey, commitments) for USER locking 10 FakeETH
 * (nonce 0) into window 41538 with pair hash keccak256(""), made by
 * source/evm-contracts/script/LockProofFixture.s.sol. The Move tests
 * eth_proof_tests.move and eth_lock_registration_tests.move pin the same
 * values, so the SDK, Solidity and Move agree.
 */
describe("LockBox lock id, storage key and commitment", () => {
  const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const WINDOW = 41538n;
  const TEN_ETH = 10n * 10n ** 18n;

  it("getLockId matches LockBox.getLockId", () => {
    expect(getLockId(USER, TOKEN, 0n)).toBe(
      "0x971e89c2b26f64aa4fc94b73baad52f35b2beb721f37991b5771e8328a10586a",
    );
  });

  it("calculateLockStorageKey matches LockBox.commitmentStorageKey (slot 0)", () => {
    expect(LOCK_COMMITMENTS_SLOT).toBe(0);
    expect(calculateLockStorageKey(USER, TOKEN, 0n)).toBe(
      "0xd06824aae8fc45f9d700be7d63b09e0baf2d07b123582f9e14a61e62c3ff0e71",
    );
  });

  it("each nonce names its own lock", () => {
    expect(getLockId(USER, TOKEN, 0n)).not.toBe(getLockId(USER, TOKEN, 1n));
  });

  it("lockCommitment matches LockBox.commitments for the anvil lock", () => {
    const binding = lockBinding(WINDOW, new Uint8Array(0));
    expect(binding.pairHash).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(binding.deadline).toBe(1794728700n);
    expect(lockCommitment(USER, TOKEN, TEN_ETH, binding)).toBe(
      "0x7cc6092f969b4b2ba9933b617e48965ee144d303198d4eeb3764e72eecbb20c1",
    );
  });

  it("the commitment changes with the amount, the window and the pair", () => {
    const binding = lockBinding(WINDOW, new Uint8Array(0));
    const base = lockCommitment(USER, TOKEN, TEN_ETH, binding);
    expect(lockCommitment(USER, TOKEN, TEN_ETH - 1n, binding)).not.toBe(base);
    expect(
      lockCommitment(
        USER,
        TOKEN,
        TEN_ETH,
        lockBinding(WINDOW + 1n, new Uint8Array(0)),
      ),
    ).not.toBe(base);
    expect(
      lockCommitment(
        USER,
        TOKEN,
        TEN_ETH,
        lockBinding(WINDOW, new Uint8Array([1])),
      ),
    ).not.toBe(base);
  });

  it("auctionKey is keccak256(abi.encode(uint64 windowId, bytes32 pairHash))", () => {
    const binding = lockBinding(WINDOW, new Uint8Array(0));
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint64", "bytes32"],
        [WINDOW, binding.pairHash],
      ),
    );
    expect(auctionKey(binding)).toBe(expected);
    // The deadline is not part of the key: it is a function of the window id.
    expect(auctionKey({ ...binding, deadline: binding.deadline + 1n })).toBe(
      expected,
    );
    expect(auctionKey(lockBinding(WINDOW + 1n, new Uint8Array(0)))).not.toBe(
      expected,
    );
    expect(auctionKey(lockBinding(WINDOW, new Uint8Array([1])))).not.toBe(
      expected,
    );
  });
});

describe("eth_lock_deadline", () => {
  it("is the window close plus 72 hours", () => {
    expect(ETH_RECLAIM_DELAY_SECS).toBe(259_200n);
    // Window 41538 closes at 07:45 UTC of day 20769.
    expect(windowCloseSecs(41538n)).toBe(20_769n * 86_400n + 27_900n);
    expect(ethLockDeadline(41538n)).toBe(1794728700n);
    // The anvil lock was mined at 1794441605, inside window 41538.
    expect(currentWindowId(1794441605n)).toBe(41538n);
  });

  it("currentWindowId is 0 at 27899, 1 at 27900, 1 at 58499, 2 at 58500, 2 at 114299 and 3 at 114300", () => {
    expect(currentWindowId(27_899n)).toBe(0n);
    expect(currentWindowId(27_900n)).toBe(1n);
    expect(currentWindowId(58_499n)).toBe(1n);
    expect(currentWindowId(58_500n)).toBe(2n);
    expect(currentWindowId(114_299n)).toBe(2n);
    expect(currentWindowId(114_300n)).toBe(3n);
  });

  it("windowCloseSecs is 27900, 58500, 114300 and 144900 for windows 0 to 3", () => {
    expect(windowCloseSecs(0n)).toBe(27_900n);
    expect(windowCloseSecs(1n)).toBe(58_500n);
    expect(windowCloseSecs(2n)).toBe(114_300n);
    expect(windowCloseSecs(3n)).toBe(144_900n);
  });

  it("every second of a window maps back to it, and the window closes at its last second + 1", () => {
    for (const w of [0n, 1n, 2n, 3n, 41537n, 41538n]) {
      const close = windowCloseSecs(w);
      expect(currentWindowId(close - 1n)).toBe(w);
      expect(currentWindowId(close)).toBe(w + 1n);
    }
  });

  it("pairHashOf is keccak256 of the pair BCS", () => {
    expect(pairHashOf(new Uint8Array([1, 2]))).toBe(ethers.keccak256("0x0102"));
  });
});

describe("window schedule", () => {
  it("windowCloseSecs, currentWindowId and ethLockDeadline follow a passed schedule and default to 07:45 and 16:15 UTC", () => {
    expect(PRODUCTION_WINDOW_SCHEDULE).toEqual({
      daySecs: 86_400n,
      closeOffsetsSecs: [27_900n, 58_500n],
    });
    // Default and explicit production schedule agree.
    for (const w of [0n, 1n, 41538n]) {
      expect(windowCloseSecs(w, PRODUCTION_WINDOW_SCHEDULE)).toBe(
        windowCloseSecs(w),
      );
      expect(ethLockDeadline(w, PRODUCTION_WINDOW_SCHEDULE)).toBe(
        ethLockDeadline(w),
      );
    }
    expect(windowCloseSecs(0n)).toBe(27_900n);

    // The 900:900 test schedule: one close every 15 minutes. These are the
    // values eth_proof::set_window_schedule_drives_window_ids_and_closes and
    // the LockBox (900, [900]) forge test assert.
    const test = parseWindowSchedule("900:900");
    expect(test).toEqual({ daySecs: 900n, closeOffsetsSecs: [900n] });
    expect(windowCloseSecs(5n, test)).toBe(5_400n);
    expect(currentWindowId(5_399n, test)).toBe(5n);
    expect(currentWindowId(5_400n, test)).toBe(6n);
    expect(ethLockDeadline(5n, test)).toBe(264_600n);
    expect(lockBinding(5n, new Uint8Array(0), test).deadline).toBe(264_600n);

    // A two-close test schedule.
    const two = parseWindowSchedule("1800:600,1200");
    expect(currentWindowId(599n, two)).toBe(0n);
    expect(currentWindowId(600n, two)).toBe(1n);
    expect(currentWindowId(1_200n, two)).toBe(2n);
    expect(windowCloseSecs(3n, two)).toBe(1_800n + 1_200n);
  });
});

/**
 * The shared (window id, close, deadline) table, also checked by LockBox.t.sol
 * (`test_windowClockMatchesSharedTable`) and eth_lock_registration_tests.move
 * (`window_close_and_lock_deadline_match_the_shared_table`). `ethLockDeadline`
 * must equal `LockBox.lockDeadline`, because the proof generator recomputes
 * the lock commitment from it.
 */
describe("shared window clock table", () => {
  it("ethLockDeadline and windowCloseSecs return the values of the shared (window id, close, deadline) table", () => {
    expect(BigInt(windowTable.day_secs)).toBe(WINDOW_DAY_SECS);
    expect(windowTable.close_offsets_secs.map(BigInt)).toEqual([
      WINDOW_MORNING_CLOSE_SECS,
      WINDOW_AFTERNOON_CLOSE_SECS,
    ]);
    expect(BigInt(windowTable.reclaim_delay_secs)).toBe(ETH_RECLAIM_DELAY_SECS);
    expect(windowTable.rows.length).toBeGreaterThanOrEqual(8);
    for (const row of windowTable.rows) {
      const w = BigInt(row.window_id);
      expect(currentWindowId(BigInt(row.at))).toBe(w);
      expect(windowCloseSecs(w)).toBe(BigInt(row.close));
      expect(ethLockDeadline(w)).toBe(BigInt(row.deadline));
      expect(lockBinding(w, new Uint8Array(0)).deadline).toBe(
        BigInt(row.deadline),
      );
    }
  });
});
