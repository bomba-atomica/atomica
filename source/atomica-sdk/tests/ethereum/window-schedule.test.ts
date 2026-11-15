import { describe, expect, it } from "vitest";
import {
  assertWindowSchedulesMatch,
  type WindowSchedule,
} from "../../src/ethereum/lock-binding.js";

const expected: WindowSchedule = {
  daySecs: 86_400n,
  closeOffsetsSecs: [27_900n, 58_500n],
};

describe("assertWindowSchedulesMatch", () => {
  it("returns when expected, LockBox and Aptos schedules match", () => {
    expect(() =>
      assertWindowSchedulesMatch(expected, expected, expected),
    ).not.toThrow();
  });

  it.each([
    ["day length", { ...expected, daySecs: 86_401n }],
    ["offset count", { ...expected, closeOffsetsSecs: [27_900n] }],
    ["offset value", { ...expected, closeOffsetsSecs: [27_900n, 58_501n] }],
  ])("rejects a LockBox %s mismatch", (_kind, lockBox) => {
    expect(() =>
      assertWindowSchedulesMatch(expected, lockBox as WindowSchedule, expected),
    ).toThrow(/LockBox/);
  });

  it.each([
    ["day length", { ...expected, daySecs: 86_401n }],
    ["offset count", { ...expected, closeOffsetsSecs: [27_900n] }],
    ["offset value", { ...expected, closeOffsetsSecs: [27_900n, 58_501n] }],
  ])("rejects an Aptos %s mismatch", (_kind, aptos) => {
    expect(() =>
      assertWindowSchedulesMatch(expected, expected, aptos as WindowSchedule),
    ).toThrow(/Aptos/);
  });

  it("rejects Aptos differing from LockBox when both differ from expected", () => {
    const lockBox = { ...expected, daySecs: 86_399n };
    const aptos = { ...expected, daySecs: 86_398n };
    expect(() => assertWindowSchedulesMatch(expected, lockBox, aptos)).toThrow(
      /LockBox/,
    );
  });
});
