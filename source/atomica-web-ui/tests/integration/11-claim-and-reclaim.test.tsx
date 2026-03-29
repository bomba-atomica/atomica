/**
 * @file 11-claim-and-reclaim.test.tsx
 * @description Browser integration tests for the ClaimButton component.
 *
 * Covers post-settlement claim/reclaim scenarios:
 *   - Winner can click Claim; callback fires and status updates
 *   - Non-winner claim button is disabled
 *   - Winner reclaim button is disabled
 *   - Loser can click Reclaim; callback fires and status updates
 *   - Error from claim callback is surfaced in status text
 *   - Error from reclaim callback is surfaced in status text
 *
 * Tests run against the stub component created by issue #41.  The stub accepts
 * `onClaim` / `onReclaim` callbacks and an `isWinner` flag, which is sufficient
 * to cover all acceptance criteria that can be expressed at the UI layer.
 *
 * When the full implementation is wired to real Move transactions the callbacks
 * will be replaced by contract calls — these tests remain valid because they
 * assert behaviour at the callback boundary, not the transport layer.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ClaimButton } from "../../src/components/ClaimButton";
import { SELECTORS } from "./helpers/selectors";

afterEach(() => {
  cleanup();
});

describe("11: ClaimButton — winner claim, loser reclaim, error handling", () => {
  // ── 11-1: Winner can click Claim ──────────────────────────────────────────

  it("winner: claim button is enabled and fires onClaim callback", async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    const onReclaim = vi.fn().mockResolvedValue(undefined);

    render(
      <ClaimButton onClaim={onClaim} onReclaim={onReclaim} isWinner={true} />,
    );

    const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
    expect(claimBtn).toBeTruthy();
    expect((claimBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(onClaim).toHaveBeenCalledTimes(1);
    });
  });

  // ── 11-2: Claim status shows "Claimed" after successful claim ─────────────

  it("winner: status updates to 'Claimed' after successful claim", async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    const onReclaim = vi.fn().mockResolvedValue(undefined);

    render(
      <ClaimButton onClaim={onClaim} onReclaim={onReclaim} isWinner={true} />,
    );

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.claimButton));

    await waitFor(() => {
      const status = screen.queryByText("Claimed");
      expect(status).not.toBeNull();
    });
  });

  // ── 11-3: Non-winner claim button is disabled ─────────────────────────────

  it("non-winner: claim button is disabled", () => {
    render(
      <ClaimButton
        onClaim={async () => {}}
        onReclaim={async () => {}}
        isWinner={false}
      />,
    );

    const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
    expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // ── 11-4: Non-winner cannot trigger onClaim ────────────────────────────────

  it("non-winner: clicking disabled claim button does not fire onClaim", () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);

    render(
      <ClaimButton
        onClaim={onClaim}
        onReclaim={async () => {}}
        isWinner={false}
      />,
    );

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.claimButton));
    // Callback must not have been called — disabled button prevents the click handler
    expect(onClaim).not.toHaveBeenCalled();
  });

  // ── 11-5: Loser can click Reclaim ─────────────────────────────────────────

  it("loser: reclaim button is enabled and fires onReclaim callback", async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    const onReclaim = vi.fn().mockResolvedValue(undefined);

    render(
      <ClaimButton onClaim={onClaim} onReclaim={onReclaim} isWinner={false} />,
    );

    const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
    expect((reclaimBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(reclaimBtn);

    await waitFor(() => {
      expect(onReclaim).toHaveBeenCalledTimes(1);
    });
  });

  // ── 11-6: Reclaim status shows "Reclaimed" ────────────────────────────────

  it("loser: status updates to 'Reclaimed' after successful reclaim", async () => {
    const onReclaim = vi.fn().mockResolvedValue(undefined);

    render(
      <ClaimButton
        onClaim={async () => {}}
        onReclaim={onReclaim}
        isWinner={false}
      />,
    );

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.reclaimButton));

    await waitFor(() => {
      const status = screen.queryByText("Reclaimed");
      expect(status).not.toBeNull();
    });
  });

  // ── 11-7: Winner reclaim button is disabled ───────────────────────────────

  it("winner: reclaim button is disabled", () => {
    render(
      <ClaimButton
        onClaim={async () => {}}
        onReclaim={async () => {}}
        isWinner={true}
      />,
    );

    const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
    expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // ── 11-8: Claim error surfaces in status text ─────────────────────────────

  it("winner: onClaim rejection surfaces error message in status", async () => {
    const onClaim = vi.fn().mockRejectedValue(new Error("Move abort: E_NOT_WINNER"));
    const onReclaim = vi.fn().mockResolvedValue(undefined);

    render(
      <ClaimButton onClaim={onClaim} onReclaim={onReclaim} isWinner={true} />,
    );

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.claimButton));

    await waitFor(() => {
      const statusEl = screen.queryByText(/Error: Move abort: E_NOT_WINNER/);
      expect(statusEl).not.toBeNull();
    });
  });

  // ── 11-9: Reclaim error surfaces in status text ───────────────────────────

  it("loser: onReclaim rejection surfaces error message in status", async () => {
    const onReclaim = vi.fn().mockRejectedValue(new Error("Move abort: E_ALREADY_CLAIMED"));
    const onClaim = vi.fn().mockResolvedValue(undefined);

    render(
      <ClaimButton onClaim={onClaim} onReclaim={onReclaim} isWinner={false} />,
    );

    fireEvent.click(screen.getByTestId(SELECTORS.claimButton.reclaimButton));

    await waitFor(() => {
      const statusEl = screen.queryByText(/Error: Move abort: E_ALREADY_CLAIMED/);
      expect(statusEl).not.toBeNull();
    });
  });

  // ── 11-10: Disabled prop disables both buttons ────────────────────────────

  it("disabled prop disables both claim and reclaim buttons regardless of isWinner", () => {
    render(
      <ClaimButton
        onClaim={async () => {}}
        onReclaim={async () => {}}
        isWinner={true}
        disabled={true}
      />,
    );

    const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
    const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
    expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
    expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
