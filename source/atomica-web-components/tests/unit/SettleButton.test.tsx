/**
 * Unit tests for SettleButton.
 *
 * Mocks @atomica/sdk/aptos so no chain is needed. The live browser cases are in
 * tests/integration/10-settle.test.tsx and 14-happy-path.test.tsx.
 *
 * Runs in the Unit Tests (atomica-sdk, atomica-web-components) job through
 * vitest.unit.config.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

vi.mock("@atomica/sdk/aptos", () => ({
  submitSettle: vi.fn(),
  isSettled: vi.fn(),
  getSettlement: vi.fn(),
}));

import { SettleButton } from "../../src/components/SettleButton";
import { submitSettle, isSettled, getSettlement } from "@atomica/sdk/aptos";

const ACCOUNT = "0xAbCd1234567890123456789012345678901234Ab";
const WINDOW_ID = 7n;
const PAIR_BCS = new Uint8Array([1, 2, 3]);

function renderSettleButton() {
  return render(
    <WalletContext.Provider value={{ account: ACCOUNT, connect: vi.fn() }}>
      <SettleButton
        windowId={WINDOW_ID}
        pairBcs={PAIR_BCS}
        auctionEndTime={Math.floor(Date.now() / 1000) - 10}
      />
    </WalletContext.Provider>,
  );
}

describe("SettleButton — unit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSettled).mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the filled total that get_settlement returns, not the window supply", async () => {
    // The window supply is 5 ETH; the winners filled 3 ETH. Only the
    // filled total reaches the UI through get_settlement.
    vi.mocked(submitSettle).mockResolvedValue(undefined as never);
    vi.mocked(getSettlement).mockResolvedValue({
      clearingPrice: 2050n,
      totalFilled: 3_000_000_000_000_000_000n,
    });

    renderSettleButton();
    const button = await screen.findByTestId("settle-button");
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);

    const filled = await screen.findByTestId("settle-total-filled");
    expect(filled.textContent).toBe("3.0000 ETH");
    expect(submitSettle).toHaveBeenCalledWith(ACCOUNT, WINDOW_ID, PAIR_BCS);
  });

  it("shows the raw abort message for an unknown abort, with no abort-99 branch", async () => {
    const msg = "Move abort in 0xcafe::auction: abort 99";
    vi.mocked(submitSettle).mockRejectedValue(new Error(msg));

    renderSettleButton();
    const button = await screen.findByTestId("settle-button");
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);

    const status = await screen.findByTestId("settle-status");
    await waitFor(() => expect(status.textContent).toBe(`Error: ${msg}`));
  });

  it("maps E_DEADLINE_NOT_PASSED (abort 31) to the not-ended message, and abort 3 to the raw message", async () => {
    vi.mocked(submitSettle).mockRejectedValueOnce(
      new Error("Move abort in 0xcafe::auction: abort 31"),
    );
    renderSettleButton();
    const button = await screen.findByTestId("settle-button");
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId("settle-status").textContent).toBe(
        "Error: Auction window has not ended yet",
      ),
    );

    vi.mocked(submitSettle).mockRejectedValueOnce(
      new Error("Move abort in 0xcafe::auction: abort 3"),
    );
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId("settle-status").textContent).toBe(
        "Error: Move abort in 0xcafe::auction: abort 3",
      ),
    );
  });

  it("maps E_WINDOW_ALREADY_SETTLED to the already-settled message", async () => {
    vi.mocked(submitSettle).mockRejectedValue(
      new Error("Move abort in 0xcafe::auction: E_WINDOW_ALREADY_SETTLED(0xb)"),
    );
    renderSettleButton();
    const button = await screen.findByTestId("settle-button");
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId("settle-status").textContent).toBe(
        "Error: Auction already settled",
      ),
    );
  });

  it("renders a clearing price of 2000n as $2000", async () => {
    vi.mocked(submitSettle).mockResolvedValue(undefined as never);
    vi.mocked(getSettlement).mockResolvedValue({
      clearingPrice: 2000n,
      totalFilled: 1_000_000_000_000_000_000n,
    });

    renderSettleButton();
    const button = await screen.findByTestId("settle-button");
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);

    const price = await screen.findByTestId("settle-clearing-price");
    expect(price.textContent).toBe("$2000");
  });
  it.todo(
    "SCOUT(#236) enables from chain state when no auctionEndTime prop is passed",
  );
});
