/**
 * Lock guard: the client refuses to approve or lock when its LockBox or token
 * address differs from the pin in `eth_proof`.
 *
 * @see source/atomica-sdk/src/ethereum-pin.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ethers } from "ethers";
import {
  assertEthereumConfigMatchesPin,
  setPinnedEthereumConfigReader,
  type PinnedEthereumConfig,
} from "../../src/ethereum-pin.js";
import {
  approveFakeEth,
  approveFakeUsd,
  lockFakeEth,
  lockFakeUsd,
} from "../../src/ethereum/lockbox.js";
import type { LockBinding } from "../../src/ethereum/lock-binding.js";

const LOCK_BOX = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const FAKE_ETH = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const FAKE_USD = "0xcCCCcCCCcCCcCcccCcccCcCccccCCcCcCcCCcCcC";
const OTHER = "0x" + "de".repeat(20);

const PIN: PinnedEthereumConfig = {
  lockBox: LOCK_BOX.toLowerCase(),
  fakeETH: FAKE_ETH.toLowerCase(),
  fakeUSD: FAKE_USD.toLowerCase(),
};

type GlobalWithConfig = typeof globalThis & {
  __ATOMICA_CHAIN_CONFIG__?: unknown;
};

function configure(ethereum: PinnedEthereumConfig) {
  (globalThis as GlobalWithConfig).__ATOMICA_CHAIN_CONFIG__ = {
    ethereum: { rpcUrl: "http://localhost:8545", ...ethereum },
    aptos: { contractAddress: "0x1" },
  };
}

describe("lock guard against the eth_proof pin", () => {
  beforeEach(() => {
    configure({ lockBox: LOCK_BOX, fakeETH: FAKE_ETH, fakeUSD: FAKE_USD });
  });

  afterEach(() => {
    (globalThis as GlobalWithConfig).__ATOMICA_CHAIN_CONFIG__ = undefined;
  });

  it("assertEthereumConfigMatchesPin resolves when the pinned addresses differ from the configured ones only in letter case", async () => {
    await expect(
      assertEthereumConfigMatchesPin(async () => PIN),
    ).resolves.toBeUndefined();
  });

  it("assertEthereumConfigMatchesPin throws an error that names the pinned address when the LockBox, FakeETH or FakeUSD address differs", async () => {
    for (const [key, name] of [
      ["lockBox", "LockBox"],
      ["fakeETH", "FakeETH"],
      ["fakeUSD", "FakeUSD"],
    ] as const) {
      const pinned = { ...PIN, [key]: OTHER };
      const configured = {
        lockBox: LOCK_BOX,
        fakeETH: FAKE_ETH,
        fakeUSD: FAKE_USD,
      };
      const err = await assertEthereumConfigMatchesPin(async () => pinned).then(
        () => undefined,
        (e: Error) => e,
      );
      expect(err, name).toBeInstanceOf(Error);
      expect(err!.message).toContain(`${name} address mismatch`);
      expect(err!.message).toContain(OTHER);
      expect(err!.message).toContain(configured[key]);
    }
  });

  it("assertEthereumConfigMatchesPin throws when the eth_proof::get_config view call rejects", async () => {
    await expect(
      assertEthereumConfigMatchesPin(async () => {
        throw new Error("Move abort: E_CONFIG_NOT_SET");
      }),
    ).rejects.toThrow(/Cannot read the LockBox.*E_CONFIG_NOT_SET/);
  });

  it("approveFakeEth, lockFakeEth, approveFakeUsd and lockFakeUsd reject on a differing pin and send no contract call", async () => {
    setPinnedEthereumConfigReader(async () => ({ ...PIN, lockBox: OTHER }));
    const getSigner = vi.fn();
    const provider = { getSigner } as unknown as ethers.BrowserProvider;
    const binding: LockBinding = {
      windowId: 7n,
      pairHash: "0x" + "00".repeat(32),
      deadline: 1_800_000_000n,
    };

    const calls = [
      () => approveFakeEth(provider, 1n),
      () => lockFakeEth(provider, 1n, binding),
      () => approveFakeUsd(provider, 1n),
      () => lockFakeUsd(provider, 1n, binding),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toThrow(OTHER);
    }
    // No signer was requested, so no transaction was built or sent.
    expect(getSigner).not.toHaveBeenCalled();
  });
});
