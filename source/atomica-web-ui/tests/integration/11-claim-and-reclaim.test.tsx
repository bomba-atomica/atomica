/**
 * @file 11-claim-and-reclaim.test.tsx
 * @description Browser integration tests for the ClaimButton component.
 *
 * The ClaimButton now accepts `sellerAddress` and queries settlement state
 * on-chain. It compares the winner against the current user's derived Aptos
 * address and, if the user is the winner, enables a Claim button that calls
 * `fake_eth::mint` via SIWE.
 *
 * These unit-level tests mock the payload helpers to cover:
 *   - Unsettled auction: both buttons disabled, status shows "not yet settled"
 *   - Winner: claim enabled, click fires mint, status shows "Claimed"
 *   - Non-winner: claim disabled, status shows "not the winner"
 *   - Claim error: error message displayed in status
 *   - Reclaim button: always disabled in Demo phase
 *
 * Integration tests against live testnets are in 14-happy-path.test.tsx.
 */

import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────

// vi.mock factories are hoisted — they must not reference outer variables.

vi.mock("../../src/lib/aptos/payloads", () => ({
  isSettled: vi.fn(),
  getSettlement: vi.fn(),
  submitClaim: vi.fn(),
  getFakeEthBalance: vi.fn(),
}));

vi.mock("../../src/lib/aptos/siwe", () => ({
  getDerivedAddress: vi.fn().mockResolvedValue({
    toString: () => "0xabc123",
  }),
}));

vi.mock("../../src/context/WalletContext", () => ({
  useWallet: vi.fn().mockReturnValue({
    account: "0xdeadbeef",
    connect: vi.fn(),
  }),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────

import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ClaimButton } from "../../src/components/ClaimButton";
import { SELECTORS } from "./helpers/selectors";
import {
  isSettled,
  getSettlement,
  submitClaim,
  getFakeEthBalance,
} from "../../src/lib/aptos/payloads";

// Cast to mock types for easy setup in tests
const mockIsSettled = vi.mocked(isSettled);
const mockGetSettlement = vi.mocked(getSettlement);
const mockSubmitClaim = vi.mocked(submitClaim);
const mockGetFakeEthBalance = vi.mocked(getFakeEthBalance);

const SELLER_ADDR = "0xseller";
const MOCK_DERIVED_ADDR = "0xabc123";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("11: ClaimButton — settlement-aware claim with Demo-phase mint", () => {
  // ── 11-1: Unsettled auction ────────────────────────────────────────────

  it("unsettled auction: both buttons disabled, status shows 'not yet settled'", async () => {
    mockIsSettled.mockResolvedValue(false);

    render(<ClaimButton sellerAddress={SELLER_ADDR} />);

    await waitFor(() => {
      const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
      expect(status.textContent).toContain("Auction not yet settled");
    });

    const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
    const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
    expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
    expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // ── 11-2: Winner can claim ─────────────────────────────────────────────

  it("winner: claim button enabled, click triggers mint, status shows 'Claimed'", async () => {
    mockIsSettled.mockResolvedValue(true);
    mockGetSettlement.mockResolvedValue({
      winner: MOCK_DERIVED_ADDR,
      clearingPrice: 200_000_000n,
    });
    mockSubmitClaim.mockResolvedValue({ hash: "0xtxhash" } as never);
    mockGetFakeEthBalance
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(200_000_000n);

    render(<ClaimButton sellerAddress={SELLER_ADDR} />);

    await waitFor(() => {
      const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
      expect((claimBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.claimButton));

    await waitFor(() => {
      const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
      expect(status.textContent).toBe("Claimed");
    });

    expect(mockSubmitClaim).toHaveBeenCalledWith("0xdeadbeef", 200_000_000n);
  });

  // ── 11-3: Non-winner claim disabled ────────────────────────────────────

  it("non-winner: claim button disabled, status shows 'not the winner'", async () => {
    mockIsSettled.mockResolvedValue(true);
    mockGetSettlement.mockResolvedValue({
      winner: "0xsomeoneelse",
      clearingPrice: 100n,
    });

    render(<ClaimButton sellerAddress={SELLER_ADDR} />);

    await waitFor(() => {
      const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
      expect(status.textContent).toContain("not the auction winner");
    });

    const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
    expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // ── 11-4: Claim error surfaces in status ───────────────────────────────

  it("claim error: error message displayed in status text", async () => {
    mockIsSettled.mockResolvedValue(true);
    mockGetSettlement.mockResolvedValue({
      winner: MOCK_DERIVED_ADDR,
      clearingPrice: 100n,
    });
    mockSubmitClaim.mockRejectedValue(new Error("Move abort: E_EXCEEDS_MAX_MINT"));
    mockGetFakeEthBalance.mockResolvedValue(0n);

    render(<ClaimButton sellerAddress={SELLER_ADDR} />);

    await waitFor(() => {
      const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
      expect((claimBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.claimButton));

    await waitFor(() => {
      const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
      expect(status.textContent).toContain("Error: Move abort: E_EXCEEDS_MAX_MINT");
    });
  });

  // ── 11-5: Reclaim always disabled in Demo ──────────────────────────────

  it("reclaim button is always disabled and shows 'Not applicable (Demo)'", async () => {
    mockIsSettled.mockResolvedValue(true);
    mockGetSettlement.mockResolvedValue({
      winner: MOCK_DERIVED_ADDR,
      clearingPrice: 100n,
    });

    render(<ClaimButton sellerAddress={SELLER_ADDR} />);

    const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
    expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
    expect(reclaimBtn.textContent).toBe("Not applicable (Demo)");
  });

  // ── 11-6: Winner sees claimed amount after successful claim ────────────

  it("winner: after successful claim, displays the amount received", async () => {
    mockIsSettled.mockResolvedValue(true);
    mockGetSettlement.mockResolvedValue({
      winner: MOCK_DERIVED_ADDR,
      clearingPrice: 500_000_000n,
    });
    mockSubmitClaim.mockResolvedValue({ hash: "0xtx" } as never);
    mockGetFakeEthBalance
      .mockResolvedValueOnce(100_000_000n)
      .mockResolvedValueOnce(600_000_000n);

    render(<ClaimButton sellerAddress={SELLER_ADDR} />);

    await waitFor(() => {
      const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
      expect((claimBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.claimButton));

    await waitFor(() => {
      const amountEl = screen.getByTestId(SELECTORS.claimButton.claimAmount);
      expect(amountEl.textContent).toContain("5.00000000 FAKEETH");
    });
  });

  // ── 11-7: Claim button disabled after successful claim ─────────────────

  it("winner: claim button shows 'Claimed' and is disabled after successful claim", async () => {
    mockIsSettled.mockResolvedValue(true);
    mockGetSettlement.mockResolvedValue({
      winner: MOCK_DERIVED_ADDR,
      clearingPrice: 100n,
    });
    mockSubmitClaim.mockResolvedValue({ hash: "0xtx" } as never);
    mockGetFakeEthBalance
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(100n);

    render(<ClaimButton sellerAddress={SELLER_ADDR} />);

    await waitFor(() => {
      const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
      expect((claimBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.claimButton));

    await waitFor(() => {
      const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
      expect(claimBtn.textContent).toBe("Claimed");
      expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
