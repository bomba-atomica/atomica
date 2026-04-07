/**
 * UI tests for SellFlow localStorage resume behavior.
 *
 * Verifies that the correct step panel is shown when the page reloads
 * mid-flow (state was persisted to localStorage).
 *
 * These tests use the real useSellFlow hook with mocked blockchain dependencies,
 * so they exercise the actual persistence and hydration logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

// Prevent real network calls from blockchain dependencies.
vi.mock("@atomica/sdk/chain-config", () => ({
  getChainConfig: vi.fn().mockReturnValue({
    ethereum: {
      rpcUrl: "http://localhost:9999",
      lockBox: "0x" + "11".repeat(20),
      fakeETH: "0x" + "22".repeat(20),
    },
    aptos: {},
  }),
}));
vi.mock("@atomica/sdk/ethereum", () => ({
  approveFakeEth: vi.fn(),
  lockFakeEth: vi.fn(),
  getUnlockTime: vi.fn(),
  withdrawFakeEth: vi.fn(),
}));
vi.mock("@atomica/sdk/ethereum/proofs", () => ({
  generateLockedBalanceProof: vi.fn(),
}));
vi.mock("@atomica/sdk/aptos", () => ({
  getRegisterLockPayload: vi.fn(),
  getCreateAuctionPayload: vi.fn(),
}));
vi.mock("@atomica/sdk", () => ({
  submitNativeTransaction: vi.fn(),
}));
vi.mock("../../src/hooks/useEthereumBalances", () => ({
  useEthereumBalances: vi.fn().mockReturnValue({
    ethAccountExists: true,
    ethBalance: 0n,
    ethFakeETH: 10n * 10n ** 18n,
    ethFakeUSD: 0n,
    ethContractsDeployed: true,
    loading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../src/hooks/useAptosBalances", () => ({
  useAptosBalances: vi.fn().mockReturnValue({
    apt: 1,
    aptAccountExists: true,
    aptosContractsDeployed: true,
    loading: false,
    refetch: vi.fn(),
  }),
}));

import { SellFlow } from "../../src/components/SellFlow/SellFlow";
import { BalancesProvider } from "../../src/context/BalancesContext";

const ACCOUNT = "0xaaaa567890123456789012345678901234567890";
const STORAGE_KEY = `sell-flow-${ACCOUNT.toLowerCase()}`;

function renderSellFlow() {
  return render(
    <WalletContext.Provider value={{ account: ACCOUNT, connect: vi.fn() }}>
      <BalancesProvider>
        <SellFlow />
      </BalancesProvider>
    </WalletContext.Provider>,
  );
}

describe("SellFlow localStorage resume", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Step2Lock by default when no state is persisted", async () => {
    await act(async () => {
      renderSellFlow();
    });
    expect(screen.getByText(/Approve & Lock/i)).toBeTruthy();
  });

  it("resumes to Step3Confirm when localStorage has confirming step", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step: "confirming",
        txHash: "0xdeadbeef",
        lockBlock: 100,
      }),
    );
    await act(async () => {
      renderSellFlow();
    });
    // Step3Confirm shows block confirmation progress
    expect(screen.getByText(/Waiting for/i)).toBeTruthy();
  });

  it("resumes to creating-auction step when localStorage has creating-auction step", async () => {
    // When the creating-auction step loads, Step7Auction auto-calls onCreateAuction.
    // With mocked submitNativeTransaction (no-op), it transitions to monitoring immediately.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step: "creating-auction",
        lockId: "0x" + "ab".repeat(32),
        amount: "1000000000000000000",
        minPrice: "100",
      }),
    );
    await act(async () => {
      renderSellFlow();
    });
    // After auto-transition completes the component shows Step8Monitor
    expect(screen.getByText(/Locked amount/i)).toBeTruthy();
  });

  it("resumes to Step8Monitor when localStorage has monitoring step", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step: "monitoring",
        amount: "1000000000000000000",
        minPrice: "2000000000",
        auctionEndTime: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    await act(async () => {
      renderSellFlow();
    });
    expect(screen.getByText(/Locked amount/i)).toBeTruthy();
  });

  it("resumes StepIndicator to the correct position", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ step: "creating-auction" }),
    );
    await act(async () => {
      renderSellFlow();
    });
    // StepIndicator renders all step labels — verify it's rendered
    expect(screen.getByText("Auction")).toBeTruthy();
    expect(screen.getByText("Monitor")).toBeTruthy();
  });

  it("clears resume state when reset is triggered", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: "monitoring" }));
    await act(async () => {
      renderSellFlow();
    });
    // Reset button appears at steps beyond lock
    const resetBtn = screen.getByText(/Reset/i);
    await act(async () => {
      resetBtn.click();
    });
    // After reset, should be back at lock step
    expect(screen.getByText(/Approve & Lock/i)).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"step":"lock"');
  });

  // ── Pending: requires live blockchain infrastructure ──────────────────────

  it.skip(
    "auto-progresses from confirming to generating-proof after 1 block confirmation — tracked in #89",
  );
  it.skip(
    "auto-progresses steps 5→6→7 on successful Aptos transactions — tracked in #89",
  );
  it.skip(
    "shows correct resume state after browser tab closes mid-lock — tracked in #89",
  );
});
