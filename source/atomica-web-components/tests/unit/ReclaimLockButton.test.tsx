/**
 * ReclaimLockButton (issue 195): return an Ethereum lock to its depositor
 * after its deadline when no settlement was proven.
 *
 * Verifies the button is enabled only for an open lock past its deadline
 * with no recorded outcome, and that clicking it sends `LockBox.reclaim` for
 * that lock. All SDK calls are mocked; no chain is needed.
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
  reclaimLock: vi.fn(),
}));

vi.mock("@atomica/sdk/ethereum", () => ({
  getReclaimEligibility: mocks.eligibility,
  reclaimLock: mocks.reclaimLock,
}));
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  class BrowserProvider {}
  return { ...actual, ethers: { ...actual.ethers, BrowserProvider } };
});

import { ReclaimLockButton } from "../../src/components/ReclaimLockButton";

const ACCOUNT = "0x1234567890123456789012345678901234567890";
const LOCK = {
  lockId: "0x" + "11".repeat(32),
  depositor: "0x" + "aa".repeat(20),
  token: "0x" + "bb".repeat(20),
  nonce: 4n,
  amount: 10n ** 18n,
  windowId: 42n,
  pairHash: "0x" + "cc".repeat(32),
  deadline: 1_767_225_600n,
};

function renderButton(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <ReclaimLockButton lock={LOCK} pollIntervalMs={60_000} />
    </WalletContext.Provider>,
  );
}

async function reason(r: string) {
  await waitFor(() =>
    expect(
      screen
        .getByTestId("reclaim-lock-eligibility")
        .getAttribute("data-reason"),
    ).toBe(r),
  );
}

describe("ReclaimLockButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { ethereum: object }).ethereum = {};
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { ethereum?: object }).ethereum;
  });

  it("is enabled for an open lock past its deadline with no proven settlement", async () => {
    mocks.eligibility.mockResolvedValue("eligible");
    renderButton();
    await reason("eligible");
    expect(screen.getByTestId("reclaim-lock-button")).not.toBeDisabled();
    expect(mocks.eligibility).toHaveBeenCalledWith(expect.anything(), LOCK);
  });

  it.each(["before-deadline", "outcome-recorded", "not-open"])(
    "is disabled when the lock is %s",
    async (r) => {
      mocks.eligibility.mockResolvedValue(r);
      renderButton();
      await reason(r);
      expect(screen.getByTestId("reclaim-lock-button")).toBeDisabled();
    },
  );

  it("is disabled without a wallet", async () => {
    mocks.eligibility.mockResolvedValue("eligible");
    renderButton(null);
    await reason("eligible");
    expect(screen.getByTestId("reclaim-lock-button")).toBeDisabled();
  });

  it("reclaims the lock to its depositor", async () => {
    mocks.eligibility.mockResolvedValue("eligible");
    mocks.reclaimLock.mockResolvedValue({ hash: "0xreclaim" });
    renderButton();
    await reason("eligible");
    fireEvent.click(screen.getByTestId("reclaim-lock-button"));
    await waitFor(() =>
      expect(screen.getByTestId("reclaim-lock-status").textContent).toContain(
        "0xreclaim",
      ),
    );
    expect(mocks.reclaimLock).toHaveBeenCalledWith(expect.anything(), LOCK);
  });
});
