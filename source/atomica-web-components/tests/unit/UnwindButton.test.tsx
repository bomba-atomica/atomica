/**
 * UnwindButton (issue 195): the permissionless unwind of a finished or stuck
 * auction, and the outcome carrier that follows it.
 *
 * Verifies:
 *   1. Unwind is enabled only when Aptos would accept `auction::unwind`: the
 *      stuck deadline passed and the window is stuck (unfinished) or finished
 *      with locks it still holds.
 *   2. It stays disabled before the stuck deadline, on a final window that
 *      holds nothing, and with no wallet.
 *   3. Clicking it sends the unwind, then carries the outcome from that very
 *      transaction and releases the window's locks.
 *   4. Carry is enabled once the window is final.
 *
 * All SDK calls are mocked; no chain is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

const mocks = vi.hoisted(() => ({
  eligibility: vi.fn(),
  submitUnwind: vi.fn(),
  outcomeEventOfTransaction: vi.fn(),
  carryAndReleaseWindow: vi.fn(),
}));

vi.mock("@atomica/sdk/aptos", () => ({
  CONTRACT_ADDR: "0xatomica",
  getUnwindEligibility: mocks.eligibility,
  submitUnwind: mocks.submitUnwind,
}));
vi.mock("@atomica/sdk/settlement/outcome-carrier", () => ({
  outcomeEventOfTransaction: mocks.outcomeEventOfTransaction,
}));
vi.mock("@atomica/sdk/settlement/window-release", () => ({
  carryAndReleaseWindow: mocks.carryAndReleaseWindow,
  defaultAptosNodes: () => ["http://aptos.test/v1"],
}));
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  class BrowserProvider {
    async getSigner() {
      return { signer: true };
    }
  }
  return { ...actual, ethers: { ...actual.ethers, BrowserProvider } };
});

import { UnwindButton } from "../../src/components/UnwindButton";

const ACCOUNT = "0x1234567890123456789012345678901234567890";
const PAIR = new Uint8Array([1, 2, 3]);

type Reason = "eligible" | "before-stuck-deadline" | "nothing-to-return";

function eligibility(reason: Reason, final: boolean, heldLocks = 0) {
  return {
    eligible: reason === "eligible",
    stuckDeadlineUs: 1_800_000_000_000_000n,
    nowUs: 1_700_000_000_000_000n,
    final,
    heldLocks,
    reason,
  };
}

function renderButton(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <UnwindButton windowId={7n} pairBcs={PAIR} pollIntervalMs={60_000} />
    </WalletContext.Provider>,
  );
}

async function settled(reason: Reason) {
  await waitFor(() =>
    expect(
      screen.getByTestId("unwind-eligibility").getAttribute("data-reason"),
    ).toBe(reason),
  );
}

describe("UnwindButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { ethereum: object }).ethereum = {};
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { ethereum?: object }).ethereum;
  });

  it("is enabled for a stuck window past its stuck deadline", async () => {
    mocks.eligibility.mockResolvedValue(eligibility("eligible", false));
    renderButton();
    await settled("eligible");
    expect(screen.getByTestId("unwind-button")).not.toBeDisabled();
    expect(screen.getByTestId("carry-outcome-button")).toBeDisabled();
    expect(mocks.eligibility).toHaveBeenCalledWith(7n, PAIR);
  });

  it("is enabled for a finished window that still holds locks", async () => {
    mocks.eligibility.mockResolvedValue(eligibility("eligible", true, 2));
    renderButton();
    await settled("eligible");
    expect(screen.getByTestId("unwind-button")).not.toBeDisabled();
    expect(screen.getByTestId("unwind-eligibility").textContent).toContain(
      "2 lock(s)",
    );
  });

  it("is disabled before the stuck deadline and shows when unwind opens", async () => {
    mocks.eligibility.mockResolvedValue(
      eligibility("before-stuck-deadline", false),
    );
    renderButton();
    await settled("before-stuck-deadline");
    expect(screen.getByTestId("unwind-button")).toBeDisabled();
    expect(screen.getByTestId("unwind-eligibility").textContent).toContain(
      "2027-01-15T08:00:00Z",
    );
  });

  it("is disabled on a final window that holds nothing", async () => {
    mocks.eligibility.mockResolvedValue(eligibility("nothing-to-return", true));
    renderButton();
    await settled("nothing-to-return");
    expect(screen.getByTestId("unwind-button")).toBeDisabled();
    // The final window's outcome can still be carried by anyone.
    expect(screen.getByTestId("carry-outcome-button")).not.toBeDisabled();
  });

  it("is disabled without a wallet", async () => {
    mocks.eligibility.mockResolvedValue(eligibility("eligible", false));
    renderButton(null);
    await settled("eligible");
    expect(screen.getByTestId("unwind-button")).toBeDisabled();
  });

  it("unwinds, then carries the outcome of its own transaction and releases the locks", async () => {
    mocks.eligibility.mockResolvedValue(eligibility("eligible", false));
    mocks.submitUnwind.mockResolvedValue({ hash: "0xunwind" });
    mocks.outcomeEventOfTransaction.mockResolvedValue({
      version: 900n,
      eventIndex: 3n,
    });
    mocks.carryAndReleaseWindow.mockResolvedValue({
      carry: { status: "recorded" },
      released: ["0xa", "0xb"],
    });
    renderButton();
    await settled("eligible");
    fireEvent.click(screen.getByTestId("unwind-button"));

    await waitFor(() =>
      expect(screen.getByTestId("unwind-status").textContent).toContain(
        "Released 2 lock(s)",
      ),
    );
    expect(mocks.submitUnwind).toHaveBeenCalledWith(ACCOUNT, 7n, PAIR);
    expect(mocks.outcomeEventOfTransaction).toHaveBeenCalledWith(
      "http://aptos.test/v1",
      "0xatomica",
      "0xunwind",
    );
    expect(mocks.carryAndReleaseWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        windowId: 7n,
        pairBcs: PAIR,
        outcomeAt: { version: 900n, eventIndex: 3n },
        nodes: ["http://aptos.test/v1"],
      }),
    );
  });

  it("says the locks go home by reclaim when the outcome is unprovable", async () => {
    mocks.eligibility.mockResolvedValue(eligibility("nothing-to-return", true));
    mocks.carryAndReleaseWindow.mockResolvedValue({
      carry: { status: "unprovable", reason: "version 9 pruned" },
      released: [],
    });
    renderButton();
    await settled("nothing-to-return");
    fireEvent.click(screen.getByTestId("carry-outcome-button"));
    await waitFor(() =>
      expect(screen.getByTestId("unwind-status").textContent).toContain(
        "Reclaim",
      ),
    );
    expect(mocks.submitUnwind).not.toHaveBeenCalled();
  });
});
