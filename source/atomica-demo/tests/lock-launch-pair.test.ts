import { describe, expect, it, vi } from "vitest";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/aptos";
import { pairHashOf } from "@atomica/sdk/ethereum/lock-binding";
import { lockLaunchPair } from "../scripts/lock-launch-pair";

describe("lockLaunchPair", () => {
  it.each([
    ["not allowed", async () => false],
    [
      "view error",
      async () => {
        throw new Error("view unavailable");
      },
    ],
  ])(
    "does not send Ethereum transactions when the pair is %s",
    async (_case, check) => {
      const calls: string[] = [];
      const isAllowed = vi.fn(async (pairBcs: Uint8Array) => {
        calls.push("isPairAllowed");
        expect(pairBcs).toEqual(LAUNCH_PAIR_BCS);
        return check();
      });
      const mint = vi.fn(async () => {
        calls.push("mint");
      });
      const approve = vi.fn(async () => {
        calls.push("approve");
      });
      const lock = vi.fn(async () => {
        calls.push("lock");
        return "receipt";
      });

      await expect(
        lockLaunchPair({
          pairBcs: LAUNCH_PAIR_BCS,
          pairHash: pairHashOf(LAUNCH_PAIR_BCS),
          isPairAllowed: isAllowed,
          mint,
          approve,
          lock,
        }),
      ).rejects.toThrow(/pair is not listed/i);

      expect(calls).toEqual(["isPairAllowed"]);
      expect(mint).not.toHaveBeenCalled();
      expect(approve).not.toHaveBeenCalled();
      expect(lock).not.toHaveBeenCalled();
    },
  );

  it("checks the launch pair before mint, approve and lock, using its pair hash", async () => {
    const calls: string[] = [];
    const expectedPairHash = pairHashOf(LAUNCH_PAIR_BCS);
    const isAllowed = vi.fn(async (pairBcs: Uint8Array) => {
      calls.push("isPairAllowed");
      expect(pairBcs).toEqual(LAUNCH_PAIR_BCS);
      return true;
    });
    const mint = vi.fn(async () => {
      calls.push("mint");
    });
    const approve = vi.fn(async () => {
      calls.push("approve");
    });
    const lock = vi.fn(async (pairHash: string) => {
      calls.push("lock");
      expect(pairHash).toBe(expectedPairHash);
      return "receipt";
    });

    await expect(
      lockLaunchPair({
        pairBcs: LAUNCH_PAIR_BCS,
        pairHash: expectedPairHash,
        isPairAllowed: isAllowed,
        mint,
        approve,
        lock,
      }),
    ).resolves.toBe("receipt");

    expect(calls).toEqual(["isPairAllowed", "mint", "approve", "lock"]);
    expect(lock).toHaveBeenCalledWith(expectedPairHash);
  });
});
