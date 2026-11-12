/**
 * @file 17-unwind.test.tsx
 * @description Live permissionless unwind and reclaim UI (issue 195) on the
 * dual-chain testnet, anvil tier only (the reclaim case warps the anvil clock).
 *
 * Scenarios:
 *   1. UnwindButton on a live window reads its stuck deadline from Aptos
 *      (`auction::get_stuck_deadline_us`), says when anyone may unwind, and
 *      stays disabled before it. The window is not final, so there is no
 *      outcome to carry yet.
 *   2. ReclaimLockButton: a FakeETH lock is disabled before its deadline. After
 *      the anvil clock passes the deadline with no proven outcome, any wallet
 *      (here the carrier account, not the depositor) clicks Reclaim, and the
 *      depositor's FakeETH balance returns to its pre-lock value.
 *
 * Not covered live (recorded on issue 195): stalling a window past the 24 h
 * unwind grace (a timelock_config constant) and carrying a proof (both browser
 * tiers run Cancun, without the EIP-2537 precompiles the light client needs,
 * and the dual-chain testnet deploys no light client). The carrier is covered
 * by the SDK golden-vector tests and the forge LockBoxAptosOutcome tests.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { ethers } from "ethers";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { setAptosInstance, getStuckDeadlineUs } from "@atomica/sdk/aptos";
import {
  approveFakeEth,
  currentWindowId as hostWindowId,
  getLockStatus,
  LOCK_STATUS,
  lockBinding,
  lockFakeEth,
  lockFromReceipt,
  type LockFields,
} from "@atomica/sdk/ethereum";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { createLiveWindow, type LiveWindow } from "./helpers/auction-setup";
import { WalletContext } from "../../src/context/WalletContext";
import { UnwindButton } from "../../src/components/UnwindButton";
import { ReclaimLockButton } from "../../src/components/ReclaimLockButton";

const PAIR_BCS = new TextEncoder().encode("17-unwind");
const DEADLINE_AHEAD_US = 120_000_000n;
/** 24 h unwind grace plus the 10 min opening window, microseconds. */
const MIN_GRACE_US = 86_400_000_000n + 600_000_000n;
const LOCK_AMOUNT = ethers.parseEther("1");
const ERC20 = ["function balanceOf(address) view returns (uint256)"];

describe.sequential("17: permissionless unwind and reclaim", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;
  let operator: Account;
  let auction: LiveWindow;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();
    aptosClient = new Aptos(
      new AptosConfig({
        network: Network.LOCAL,
        fullnode: fixture.aptos.nodeUrl,
      }),
    );
    setAptosInstance(aptosClient);
    operator = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });
    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minPrice: 1n,
      deadlineAheadUs: DEADLINE_AHEAD_US,
    });
  }, 1_200_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  it("17-1: Unwind waits for the window's stuck deadline, read from Aptos", async () => {
    const stuckDeadlineUs = await getStuckDeadlineUs(
      auction.windowId,
      auction.pairBcs,
    );
    expect(stuckDeadlineUs).toBeGreaterThanOrEqual(
      auction.deadlineUs + MIN_GRACE_US,
    );

    render(
      <WalletContext.Provider
        value={{ account: fixture.eth.seller.address, connect: async () => {} }}
      >
        <UnwindButton
          windowId={auction.windowId}
          pairBcs={auction.pairBcs}
          pollIntervalMs={2_000}
        />
      </WalletContext.Provider>,
    );

    await waitFor(
      () =>
        expect(
          screen.getByTestId("unwind-eligibility").getAttribute("data-reason"),
        ).toBe("before-stuck-deadline"),
      { timeout: 30_000 },
    );
    const opensAt = new Date(Number(stuckDeadlineUs / 1000n))
      .toISOString()
      .replace(".000Z", "Z");
    expect(screen.getByTestId("unwind-eligibility").textContent).toContain(
      opensAt,
    );
    expect(screen.getByTestId("unwind-button")).toBeDisabled();
    // The window has no outcome yet, so there is nothing to carry.
    expect(screen.getByTestId("carry-outcome-button")).toBeDisabled();
  }, 120_000);

  it("17-2: anyone reclaims a lock after its deadline and the depositor's balance is restored", async () => {
    const rpc = new ethers.JsonRpcProvider(fixture.eth.rpcUrl, undefined, {
      cacheTimeout: -1,
    });
    const fakeEth = new ethers.Contract(
      fixture.eth.contracts.fakeETH,
      ERC20,
      rpc,
    );

    // The seller locks 1 FakeETH into the current window, with no Aptos
    // registration and no outcome.
    await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });
    const sellerProvider = new ethers.BrowserProvider(
      (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum,
    );
    const before = (await fakeEth.balanceOf(
      fixture.eth.seller.address,
    )) as bigint;
    await approveFakeEth(sellerProvider, LOCK_AMOUNT);
    const head = await rpc.getBlock("latest");
    const binding = lockBinding(
      hostWindowId(BigInt(head!.timestamp)),
      PAIR_BCS,
    );
    const lock: LockFields = lockFromReceipt(
      await lockFakeEth(sellerProvider, LOCK_AMOUNT, binding),
    );
    expect(await fakeEth.balanceOf(fixture.eth.seller.address)).toBe(
      before - LOCK_AMOUNT,
    );

    // Any wallet may press Reclaim: switch to the bidder, who has no rights
    // over the lock. The tokens still go to the depositor.
    const caller = await setupWalletMock({
      privateKey: fixture.eth.bidder.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });

    render(
      <WalletContext.Provider
        value={{ account: caller, connect: async () => {} }}
      >
        <ReclaimLockButton lock={lock} pollIntervalMs={1_000} />
      </WalletContext.Provider>,
    );

    await waitFor(
      () =>
        expect(
          screen
            .getByTestId("reclaim-lock-eligibility")
            .getAttribute("data-reason"),
        ).toBe("before-deadline"),
      { timeout: 30_000 },
    );
    expect(screen.getByTestId("reclaim-lock-button")).toBeDisabled();

    // Move the anvil clock past the lock deadline.
    const now = BigInt((await rpc.getBlock("latest"))!.timestamp);
    await rpc.send("evm_increaseTime", [Number(lock.deadline - now + 1n)]);
    await rpc.send("evm_mine", []);

    await waitFor(
      () =>
        expect(
          screen
            .getByTestId("reclaim-lock-eligibility")
            .getAttribute("data-reason"),
        ).toBe("eligible"),
      { timeout: 30_000 },
    );
    fireEvent.click(screen.getByTestId("reclaim-lock-button"));

    await waitFor(
      () =>
        expect(screen.getByTestId("reclaim-lock-status").textContent).toContain(
          "Reclaimed to",
        ),
      { timeout: 60_000 },
    );
    expect(await getLockStatus(rpc, lock.lockId)).toBe(LOCK_STATUS.Reclaimed);
    expect(await fakeEth.balanceOf(fixture.eth.seller.address)).toBe(before);
  }, 300_000);
});
