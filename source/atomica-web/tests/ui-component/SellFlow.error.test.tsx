/**
 * UI error state tests for SellFlow step components.
 *
 * Tests that error messages are displayed correctly in step panels that
 * receive an `error` prop. Step components are tested directly (without
 * the full SellFlow wrapper) to keep tests focused and avoid blockchain deps.
 *
 * End-to-end error propagation tests (hook → component) are in the
 * sell-flow-state.test.ts todos, pending test infrastructure.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step2Lock } from "../../src/components/SellFlow/steps/Step2Lock";
import { Step5Submit } from "../../src/components/SellFlow/steps/Step5Submit";
import { Step6Mint } from "../../src/components/SellFlow/steps/Step6Mint";
import { Step7Auction } from "../../src/components/SellFlow/steps/Step7Auction";
import { Step8Monitor } from "../../src/components/SellFlow/steps/Step8Monitor";

describe("SellFlow error display", () => {
  afterEach(() => {
    cleanup();
  });

  describe("Step2Lock", () => {
    it("shows error message when error prop is set", () => {
      render(
        <Step2Lock
          onLock={vi.fn()}
          loading={false}
          error="Insufficient FakeETH balance"
        />,
      );
      expect(screen.getByText("Insufficient FakeETH balance")).toBeTruthy();
    });

    it("disables button while loading", () => {
      render(<Step2Lock onLock={vi.fn()} loading={true} />);
      const btn = screen.getByRole("button");
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows waiting message while loading", () => {
      render(<Step2Lock onLock={vi.fn()} loading={true} />);
      expect(screen.getByText(/Waiting for MetaMask/i)).toBeTruthy();
    });

    it("calls onLock when button is clicked", () => {
      const onLock = vi.fn();
      render(<Step2Lock onLock={onLock} loading={false} />);
      fireEvent.click(screen.getByRole("button"));
      expect(onLock).toHaveBeenCalledOnce();
    });

    it("shows no error when error prop is not set", () => {
      render(<Step2Lock onLock={vi.fn()} loading={false} />);
      // No error text in the DOM
      expect(screen.queryByText(/error/i)).toBeFalsy();
    });
  });

  describe("Step5Submit", () => {
    it("shows error message when error prop is set", () => {
      render(
        <Step5Submit
          onSubmit={vi.fn()}
          loading={false}
          error="Aptos transaction rejected"
        />,
      );
      expect(screen.getByText("Aptos transaction rejected")).toBeTruthy();
    });

    it("shows Submitting… text while loading (no button in loading state)", () => {
      // Buttons only appear in the error branch; the success branch shows a spinner.
      render(<Step5Submit onSubmit={vi.fn()} loading={true} />);
      expect(screen.getByText(/Submitting…/i)).toBeTruthy();
    });

    it("disables Retry button when error + loading", () => {
      render(
        <Step5Submit
          onSubmit={vi.fn()}
          loading={true}
          error="previous failure"
        />,
      );
      const btn = screen.getByRole("button", { name: /Retry/i });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe("Step6Mint", () => {
    it("shows error message when error prop is set", () => {
      render(
        <Step6Mint
          onMint={vi.fn()}
          loading={false}
          amount={1_000_000_000_000_000_000n}
          error="lock_receipt not found"
        />,
      );
      expect(screen.getByText("lock_receipt not found")).toBeTruthy();
    });

    it("disables Retry button when error + loading", () => {
      render(
        <Step6Mint
          onMint={vi.fn()}
          loading={true}
          amount={1_000_000_000_000_000_000n}
          error="previous failure"
        />,
      );
      const btn = screen.getByRole("button", { name: /Retry/i });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe("Step7Auction", () => {
    it("shows error message when error prop is set", () => {
      render(
        <Step7Auction
          onCreateAuction={vi.fn()}
          loading={false}
          amount={1_000_000_000_000_000_000n}
          minPrice={2_000_000_000n}
          error="auction::create_auction failed"
        />,
      );
      expect(screen.getByText("auction::create_auction failed")).toBeTruthy();
    });
  });

  describe("Step8Monitor", () => {
    it("shows Cancel & Unlock button when unlock time has passed", () => {
      const pastUnlockTime = Math.floor(Date.now() / 1000) - 10;
      render(
        <Step8Monitor
          onCancelAndUnlock={vi.fn()}
          loading={false}
          unlockTime={pastUnlockTime}
          auctionEndTime={Math.floor(Date.now() / 1000) - 5}
        />,
      );
      expect(screen.getByText(/Cancel & Unlock/i)).toBeTruthy();
    });

    it("shows error on cancel when error prop is set", () => {
      const pastUnlockTime = Math.floor(Date.now() / 1000) - 10;
      render(
        <Step8Monitor
          onCancelAndUnlock={vi.fn()}
          loading={false}
          unlockTime={pastUnlockTime}
          error="withdraw failed"
        />,
      );
      expect(screen.getByText("withdraw failed")).toBeTruthy();
    });

    it("does not show Cancel button when unlock time is in the future", () => {
      const futureUnlockTime = Math.floor(Date.now() / 1000) + 9999;
      render(
        <Step8Monitor
          onCancelAndUnlock={vi.fn()}
          loading={false}
          unlockTime={futureUnlockTime}
        />,
      );
      expect(screen.queryByText(/Cancel & Unlock/i)).toBeFalsy();
    });
  });
});
