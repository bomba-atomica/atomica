/**
 * Unit tests for ClaimButton component.
 *
 * Verifies that:
 *   1. The claim button renders with the correct label.
 *   2. Clicking the button calls submitClaim mock with the correct args.
 *   3. A loading state is shown during a pending transaction.
 *
 * Mocks @atomica/sdk/aptos and @atomica/sdk so no blockchain connection is needed.
 *
 * @see docs/specifications/web-architecture.md
 * @see #135 — Web component unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

// vi.mock factories are hoisted — no outer variables can be referenced inside.
vi.mock("@atomica/sdk/aptos", () => ({
  isSettled: vi.fn().mockResolvedValue(true),
  getSettlement: vi.fn().mockResolvedValue({ clearingPrice: 1000n }),
  submitClaim: vi.fn().mockResolvedValue(undefined),
  getFakeEthBalance: vi.fn().mockResolvedValue(0n),
}));

vi.mock("@atomica/sdk", () => ({
  getDerivedAddress: vi.fn().mockResolvedValue("0xderived1234"),
}));

import { ClaimButton } from "../../src/components/ClaimButton";
import {
  submitClaim,
  getFakeEthBalance,
  isSettled,
  getSettlement,
} from "@atomica/sdk/aptos";

const ACCOUNT = "0xAbCd1234567890123456789012345678901234Ab";
const WINDOW_ID = 1n;
const PAIR_BCS = new Uint8Array(4);

function renderClaimButton(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <ClaimButton windowId={WINDOW_ID} pairBcs={PAIR_BCS} />
    </WalletContext.Provider>,
  );
}

describe("ClaimButton — unit", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSettled).mockResolvedValue(true);
    vi.mocked(getSettlement).mockResolvedValue({ clearingPrice: 1000n });
    vi.mocked(submitClaim).mockResolvedValue(undefined);
    vi.mocked(getFakeEthBalance).mockResolvedValue(0n);
  });

  it("renders with the Claim button label", () => {
    renderClaimButton();
    const button = screen.getByTestId("claim-button");
    expect(button.textContent).toContain("Claim");
  });

  it("shows settled status after mount when settlement is confirmed", async () => {
    renderClaimButton();

    await waitFor(() => {
      const status = screen.getByTestId("claim-status");
      expect(status.textContent).toContain("Settled");
    });
  });

  it("calls submitClaim when the Claim button is clicked after settlement is confirmed", async () => {
    renderClaimButton();

    // Wait for settlement to be detected (enables the button)
    await waitFor(() => {
      const status = screen.getByTestId("claim-status");
      expect(status.textContent).toContain("Settled");
    });

    const button = screen.getByTestId("claim-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(submitClaim).toHaveBeenCalledWith(ACCOUNT, 1000n);
    });
  });

  it("shows loading/claiming state during pending claim transaction", async () => {
    let resolveSubmit!: () => void;
    vi.mocked(submitClaim).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      }),
    );

    renderClaimButton();

    // Wait for settlement detection
    await waitFor(() => {
      const status = screen.getByTestId("claim-status");
      expect(status.textContent).toContain("Settled");
    });

    const button = screen.getByTestId("claim-button");
    fireEvent.click(button);

    // Check loading/claiming status appeared
    await waitFor(() => {
      const status = screen.getByTestId("claim-status");
      expect(status.textContent).toContain("Claiming");
    });

    resolveSubmit();
  });

  it("shows error when claim is rejected", async () => {
    vi.mocked(submitClaim).mockRejectedValueOnce(new Error("Claim failed"));

    renderClaimButton();

    await waitFor(() => {
      const status = screen.getByTestId("claim-status");
      expect(status.textContent).toContain("Settled");
    });

    const button = screen.getByTestId("claim-button");
    fireEvent.click(button);

    await waitFor(() => {
      const status = screen.getByTestId("claim-status");
      expect(status.textContent).toContain("Error");
    });
  });
});
