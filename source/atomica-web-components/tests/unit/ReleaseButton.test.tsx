/**
 * ReleaseButton and useWindowRelease (issue 236): the release step of a
 * trade, after open and settle.
 *
 * The SDK's real `carryAndReleaseWindow` and `planWindowReleases` run here,
 * loaded from the SDK source, so the order of the carrier and the releases,
 * the per-lock calls and the unpayable leaf branch are the SDK's own. Only
 * the chain edges are mocked: the Aptos views, the LockBox reads, the
 * outcome carrier's network calls and `sendLockBoxCall`. LockBox statuses
 * change when a release or reclaim call is "sent".
 *
 * Runs in the Unit Tests (atomica-sdk, atomica-web-components) job through
 * vitest.unit.config.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { ethers } from "ethers";
import { WalletContext } from "../../src/context/WalletContext";

const { LOCK_STATUS, LOCKBOX, SIGNER } = vi.hoisted(() => ({
  LOCK_STATUS: { None: 0, Open: 1, Released: 2, Reclaimed: 3 },
  LOCKBOX: "0x" + "cd".repeat(20),
  SIGNER: { signer: "third party" },
}));

const m = vi.hoisted(() => ({
  isSettled: vi.fn(),
  getWindowLockIds: vi.fn(),
  getLockOutcome: vi.fn(),
  getLockById: vi.fn(),
  getLockStatus: vi.fn(),
  getRecordedOutcome: vi.fn(),
  sendLockBoxCall: vi.fn(),
  findOutcomeEvent: vi.fn(),
  carryOutcome: vi.fn(),
  ethersCarrierChain: vi.fn(),
}));

// The component's own SDK imports (the built package).
vi.mock("@atomica/sdk/aptos", () => ({
  isSettled: m.isSettled,
  getWindowLockIds: m.getWindowLockIds,
  getLockOutcome: m.getLockOutcome,
}));
vi.mock("@atomica/sdk/ethereum", () => ({
  getLockById: m.getLockById,
  getLockStatus: m.getLockStatus,
  getRecordedOutcome: m.getRecordedOutcome,
  LOCK_STATUS,
}));
// The real carryAndReleaseWindow, from the SDK source, over mocked edges.
vi.mock(
  "@atomica/sdk/settlement/window-release",
  () => import("../../../atomica-sdk/src/settlement/window-release"),
);
vi.mock("../../../atomica-sdk/src/aptos/config", () => ({
  aptos: { config: { fullnode: "http://aptos.test/v1" } },
  CONTRACT_ADDR: "0xatomica",
}));
vi.mock("../../../atomica-sdk/src/aptos/payloads", () => ({
  getWindowLockIds: m.getWindowLockIds,
  getLockOutcome: m.getLockOutcome,
}));
vi.mock("../../../atomica-sdk/src/chain-config", () => ({
  getChainConfig: () => ({ ethereum: { lockBox: LOCKBOX } }),
}));
vi.mock("../../../atomica-sdk/src/ethereum-pin", () => ({
  assertEthereumConfigMatchesPin: vi.fn(),
}));
vi.mock(
  "../../../atomica-sdk/src/ethereum/lockbox",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getLockById: m.getLockById,
    getLockStatus: m.getLockStatus,
    getRecordedOutcome: m.getRecordedOutcome,
    sendLockBoxCall: m.sendLockBoxCall,
  }),
);
vi.mock(
  "../../../atomica-sdk/src/settlement/outcome-carrier",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    findOutcomeEvent: m.findOutcomeEvent,
    carryOutcome: m.carryOutcome,
    ethersCarrierChain: m.ethersCarrierChain,
  }),
);
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  class BrowserProvider {
    async getSigner() {
      return SIGNER;
    }
  }
  return { ...actual, ethers: { ...actual.ethers, BrowserProvider } };
});

import { ReleaseButton } from "../../src/components/ReleaseButton";
import { LOCKBOX_ABI } from "../../../atomica-sdk/src/ethereum/abis";
import { windowOutcomeTree } from "../../../atomica-sdk/src/settlement/outcome-carrier";

const LOCKBOX_IFACE = new ethers.Interface(LOCKBOX_ABI);
const RELEASE = LOCKBOX_IFACE.getFunction("releaseByOutcome")!.selector;
const RECLAIM_UNPAYABLE =
  LOCKBOX_IFACE.getFunction("reclaimUnpayable")!.selector;

const WINDOW_ID = 7n;
const PAIR = new Uint8Array([1, 2, 3]);
const SELLER = "0x00000000000000000000000000000000000000a1";
const WINNER = "0x00000000000000000000000000000000000000b1";
const LOSER = "0x00000000000000000000000000000000000000c1";
/** Neither the seller nor a bidder. */
const THIRD_PARTY = "0x00000000000000000000000000000000000000d1";
const FAKE_ETH = "0x" + "e1".repeat(20);
const FAKE_USD = "0x" + "e2".repeat(20);

interface TestLock {
  id: string;
  asset: "FakeETH" | "FakeUSD";
  depositor: string;
  amount: bigint;
  recipients: string[];
  amounts: bigint[];
}

/** The seller lock pays the winner and the rest home; collateral pays the seller. */
function windowLocks(): TestLock[] {
  return [
    {
      id: "0x" + "11".repeat(32),
      asset: "FakeETH",
      depositor: SELLER,
      amount: 10n,
      recipients: [WINNER, SELLER],
      amounts: [4n, 6n],
    },
    {
      id: "0x" + "22".repeat(32),
      asset: "FakeUSD",
      depositor: WINNER,
      amount: 8n,
      recipients: [SELLER],
      amounts: [8n],
    },
    {
      id: "0x" + "33".repeat(32),
      asset: "FakeUSD",
      depositor: LOSER,
      amount: 5n,
      recipients: [LOSER],
      amounts: [5n],
    },
  ];
}

let locks: TestLock[];
let statuses: Map<string, number>;
let recorded: boolean;

function fields(l: TestLock, nonce: number) {
  return {
    lockId: l.id,
    depositor: l.depositor,
    token: l.asset === "FakeETH" ? FAKE_ETH : FAKE_USD,
    nonce: BigInt(nonce),
    amount: l.amount,
    windowId: WINDOW_ID,
    pairHash: "0x" + "99".repeat(32),
    deadline: 1_767_225_600n,
  };
}

function setup(ls: TestLock[]) {
  locks = ls;
  statuses = new Map(ls.map((l) => [l.id, LOCK_STATUS.Open]));
  recorded = false;
  const root = windowOutcomeTree(
    ls.map((l) => ({
      lockId: l.id,
      recipients: l.recipients,
      amounts: l.amounts,
    })),
  ).root;
  m.isSettled.mockResolvedValue(true);
  m.getWindowLockIds.mockImplementation(async () => ({
    sellers: locks.filter((l) => l.asset === "FakeETH").map((l) => l.id),
    collateral: locks.filter((l) => l.asset === "FakeUSD").map((l) => l.id),
  }));
  m.getLockOutcome.mockImplementation(async (_asset: string, id: string) => {
    const l = locks.find((x) => x.id === id)!;
    return {
      kind: 4,
      windowId: WINDOW_ID,
      recipients: l.recipients,
      amounts: l.amounts,
    };
  });
  m.getLockById.mockImplementation(async (_p: unknown, id: string) => {
    const i = locks.findIndex((x) => x.id === id);
    return fields(locks[i], i + 1);
  });
  m.getLockStatus.mockImplementation(
    async (_p: unknown, id: string) => statuses.get(id) ?? 0,
  );
  m.getRecordedOutcome.mockImplementation(async () => ({
    root: recorded ? root : ethers.ZeroHash,
    leafCount: recorded ? BigInt(locks.length) : 0n,
    recorded,
  }));
  m.findOutcomeEvent.mockResolvedValue({ version: 900n, eventIndex: 3n });
  m.ethersCarrierChain.mockResolvedValue({ chain: true });
  m.carryOutcome.mockImplementation(async () => {
    recorded = true;
    return { status: "recorded" };
  });
  // A sent call closes its lock, found by the nonce in its Lock tuple.
  m.sendLockBoxCall.mockImplementation(
    async (_signer: unknown, call: { to: string; data: string }) => {
      const selector = call.data.slice(0, 10);
      const name =
        selector === RELEASE ? "releaseByOutcome" : "reclaimUnpayable";
      const args = LOCKBOX_IFACE.decodeFunctionData(name, call.data);
      const id = locks[Number(args[0].nonce) - 1].id;
      statuses.set(
        id,
        name === "releaseByOutcome"
          ? LOCK_STATUS.Released
          : LOCK_STATUS.Reclaimed,
      );
      return { hash: `0x${m.sendLockBoxCall.mock.calls.length}` };
    },
  );
}

/** The decoded LockBox calls sent so far: function name and lock nonce. */
function sentCalls() {
  return m.sendLockBoxCall.mock.calls.map(([, call]) => {
    const name =
      call.data.slice(0, 10) === RELEASE
        ? "releaseByOutcome"
        : "reclaimUnpayable";
    const args = LOCKBOX_IFACE.decodeFunctionData(name, call.data);
    return {
      name,
      lockId: locks[Number(args[0].nonce) - 1].id,
      recipients: (args[1] as ethers.Result[]).map((p) =>
        (p[0] as string).toLowerCase(),
      ),
    };
  });
}

function renderButton(account: string | null = THIRD_PARTY) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <ReleaseButton
        windowId={WINDOW_ID}
        pairBcs={PAIR}
        pollIntervalMs={60_000}
      />
    </WalletContext.Provider>,
  );
}

async function enabledButton() {
  const button = screen.getByTestId("release-button");
  await waitFor(() => expect(button).not.toBeDisabled());
  return button;
}

async function pressAndWait() {
  fireEvent.click(await enabledButton());
  await waitFor(() =>
    expect(screen.getByTestId("release-status").textContent).toMatch(
      /Released/,
    ),
  );
}

describe("ReleaseButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { ethereum: unknown }).ethereum = {};
    setup(windowLocks());
  });
  afterEach(() => cleanup());

  it("calls the outcome carrier before any releaseByOutcome", async () => {
    renderButton();
    await pressAndWait();
    expect(m.findOutcomeEvent).toHaveBeenCalledWith(
      "http://aptos.test/v1",
      "0xatomica",
      WINDOW_ID,
      expect.any(String),
    );
    expect(m.carryOutcome).toHaveBeenCalledTimes(1);
    expect(m.carryOutcome).toHaveBeenCalledWith(
      { chain: true },
      ["http://aptos.test/v1"],
      900n,
      3n,
    );
    expect(m.sendLockBoxCall).toHaveBeenCalledTimes(3);
    expect(m.carryOutcome.mock.invocationCallOrder[0]).toBeLessThan(
      m.sendLockBoxCall.mock.invocationCallOrder[0],
    );
  });

  it("skips the carrier when LockBox.outcomes(auctionKey) is already set", async () => {
    recorded = true;
    renderButton();
    await waitFor(() =>
      expect(screen.getByTestId("release-note").textContent).toContain(
        "The outcome is on Ethereum",
      ),
    );
    await pressAndWait();
    expect(m.findOutcomeEvent).not.toHaveBeenCalled();
    expect(m.carryOutcome).not.toHaveBeenCalled();
    expect(sentCalls().map((c) => c.name)).toEqual([
      "releaseByOutcome",
      "releaseByOutcome",
      "releaseByOutcome",
    ]);
  });

  it("calls releaseByOutcome once per open lock", async () => {
    // The losing bidder's collateral was already released.
    statuses.set(locks[2].id, LOCK_STATUS.Released);
    renderButton();
    await pressAndWait();
    expect(sentCalls()).toEqual([
      {
        name: "releaseByOutcome",
        lockId: locks[0].id,
        recipients: [WINNER, SELLER],
      },
      { name: "releaseByOutcome", lockId: locks[1].id, recipients: [SELLER] },
    ]);
    expect(screen.getByTestId("release-status").textContent).toBe(
      "Released 2 lock(s).",
    );
  });

  it("shows the status of each lock and is disabled when every lock is released", async () => {
    // Before the window settles nothing can be released.
    m.isSettled.mockResolvedValue(false);
    const view = renderButton();
    await waitFor(() =>
      expect(screen.getByTestId("release-note").textContent).toContain(
        "once the window settles",
      ),
    );
    expect(screen.getByTestId("release-button")).toBeDisabled();
    view.unmount();

    m.isSettled.mockResolvedValue(true);
    renderButton();
    await waitFor(() =>
      expect(screen.getAllByTestId("release-lock")).toHaveLength(3),
    );
    const rows = screen.getAllByTestId("release-lock");
    // Seller lock first, then the collateral locks, each with its asset,
    // payouts and status.
    expect(rows.map((r) => r.getAttribute("data-lock-id"))).toEqual(
      locks.map((l) => l.id),
    );
    expect(rows[0].textContent).toContain("FakeETH");
    expect(rows[1].textContent).toContain("FakeUSD");
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual([
      "open",
      "open",
      "open",
    ]);

    await pressAndWait();
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId("release-lock")
          .map((r) => r.getAttribute("data-status")),
      ).toEqual(["released", "released", "released"]),
    );
    expect(screen.getByTestId("release-button")).toBeDisabled();
    expect(screen.getByTestId("release-note").textContent).toContain(
      "Every lock of this window is closed",
    );
  });

  it("a second press finds no open lock and sends no transaction", async () => {
    renderButton();
    await pressAndWait();
    expect(m.sendLockBoxCall).toHaveBeenCalledTimes(3);
    expect(m.carryOutcome).toHaveBeenCalledTimes(1);

    // A second page still shows the locks open; another wallet closes them
    // all before it presses.
    cleanup();
    for (const l of locks) statuses.set(l.id, LOCK_STATUS.Open);
    recorded = false;
    renderButton();
    const button = await enabledButton();
    for (const l of locks) statuses.set(l.id, LOCK_STATUS.Released);
    recorded = true;
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await waitFor(() =>
      expect(screen.getByTestId("release-note").textContent).toContain(
        "Every lock of this window is closed",
      ),
    );
    expect(m.sendLockBoxCall).toHaveBeenCalledTimes(3);
    expect(m.carryOutcome).toHaveBeenCalledTimes(1);
  });

  it("works for a wallet that is neither the seller nor a bidder", async () => {
    renderButton(THIRD_PARTY);
    await pressAndWait();
    // The third party only signs; every payout goes to the leaf's recipients.
    for (const [signer] of m.sendLockBoxCall.mock.calls) {
      expect(signer).toBe(SIGNER);
    }
    const recipients = sentCalls().flatMap((c) => c.recipients);
    expect(recipients).not.toContain(THIRD_PARTY);
    expect(new Set(recipients)).toEqual(new Set([WINNER, SELLER, LOSER]));
    expect(
      [...statuses.values()].every((s) => s === LOCK_STATUS.Released),
    ).toBe(true);
  });

  it("calls reclaimUnpayable for a lock whose leaf is unpayable", async () => {
    const ls = windowLocks();
    // A zero recipient makes the losing bidder's leaf unpayable.
    ls[2].recipients = [ethers.ZeroAddress];
    setup(ls);
    renderButton();
    await pressAndWait();
    expect(sentCalls().map((c) => [c.name, c.lockId])).toEqual([
      ["releaseByOutcome", ls[0].id],
      ["releaseByOutcome", ls[1].id],
      ["reclaimUnpayable", ls[2].id],
    ]);
    expect(m.sendLockBoxCall.mock.calls[2][1].data.slice(0, 10)).toBe(
      RECLAIM_UNPAYABLE,
    );
    expect(screen.getByTestId("release-status").textContent).toContain(
      "Returned 1 unpayable lock(s) to their depositors",
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId("release-lock")
          .map((r) => r.getAttribute("data-status")),
      ).toEqual(["released", "released", "reclaimed"]),
    );
  });
});
