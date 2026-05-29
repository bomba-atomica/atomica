/**
 * Unit tests for useTokenBalances hook — issue #136.
 *
 * Verifies initial loading state, resolved balance values, and error handling
 * using vi.mock to stub @atomica/aptos-docker-testnet/browser so no network
 * or Docker environment is required.
 *
 * @see source/atomica-web-components/src/hooks/useTokenBalances.ts
 * @see docs/specifications/web-architecture.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { useTokenBalances } from "../../../src/hooks/useTokenBalances";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetDerivedAddress = vi.fn();
const mockGetAccountAPTAmount = vi.fn();
const mockAptosView = vi.fn();
const mockAreContractsDeployed = vi.fn();

vi.mock("@atomica/aptos-docker-testnet/browser", () => ({
  aptos: {
    getAccountAPTAmount: (...args: unknown[]) =>
      mockGetAccountAPTAmount(...args),
    view: (...args: unknown[]) => mockAptosView(...args),
  },
  CONTRACT_ADDR: "0xtest_contract_addr",
  getDerivedAddress: (...args: unknown[]) => mockGetDerivedAddress(...args),
  areContractsDeployed: () => mockAreContractsDeployed(),
}));

// ─── Test harness ─────────────────────────────────────────────────────────────

function TokenBalancesHarness({ ethAddress }: { ethAddress: string | null }) {
  const balances = useTokenBalances(ethAddress);
  return (
    <div>
      <span data-testid="loading">{String(balances.loading)}</span>
      <span data-testid="fakeEth">{balances.fakeEth}</span>
      <span data-testid="fakeUsd">{balances.fakeUsd}</span>
      <span data-testid="apt">{balances.apt}</span>
      <span data-testid="exists">{String(balances.exists)}</span>
      <span data-testid="contractsDeployed">
        {String(balances.contractsDeployed)}
      </span>
    </div>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const DERIVED_ADDR = "0xderivedaddress";
const ETH_ADDR = "0x1234567890123456789012345678901234567890";

describe("useTokenBalances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDerivedAddress.mockResolvedValue(DERIVED_ADDR);
    mockAreContractsDeployed.mockResolvedValue(true);
    mockGetAccountAPTAmount.mockResolvedValue(1000);
    mockAptosView
      .mockResolvedValueOnce([500]) // fakeEth
      .mockResolvedValueOnce([200]); // fakeUsd
  });

  afterEach(() => {
    cleanup();
  });

  it("returns loading: true on initial render with mocked wallet", () => {
    render(<TokenBalancesHarness ethAddress={ETH_ADDR} />);
    // Before async resolution completes, loading should be true
    expect(screen.getByTestId("loading").textContent).toBe("true");
  });

  it("returns fakeEth: 0, fakeUsd: 0 initial values while loading", () => {
    render(<TokenBalancesHarness ethAddress={ETH_ADDR} />);
    expect(screen.getByTestId("fakeEth").textContent).toBe("0");
    expect(screen.getByTestId("fakeUsd").textContent).toBe("0");
  });

  it("transitions to resolved balance values after mock resolves", async () => {
    render(<TokenBalancesHarness ethAddress={ETH_ADDR} />);

    await waitFor(
      () => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      },
      { timeout: 5000 },
    );

    expect(screen.getByTestId("fakeEth").textContent).toBe("500");
    expect(screen.getByTestId("fakeUsd").textContent).toBe("200");
    expect(screen.getByTestId("apt").textContent).toBe("1000");
    expect(screen.getByTestId("exists").textContent).toBe("true");
    expect(screen.getByTestId("contractsDeployed").textContent).toBe("true");
  });

  it("returns loading: false and exists: false when ethAddress is null", async () => {
    render(<TokenBalancesHarness ethAddress={null} />);

    await waitFor(
      () => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      },
      { timeout: 5000 },
    );

    expect(screen.getByTestId("exists").textContent).toBe("false");
  });

  it("returns exists: false when contract call rejects (getAccountAPTAmount throws)", async () => {
    mockGetAccountAPTAmount.mockRejectedValue(new Error("account not found"));

    render(<TokenBalancesHarness ethAddress={ETH_ADDR} />);

    await waitFor(
      () => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      },
      { timeout: 5000 },
    );

    expect(screen.getByTestId("exists").textContent).toBe("false");
    expect(screen.getByTestId("fakeEth").textContent).toBe("0");
    expect(screen.getByTestId("fakeUsd").textContent).toBe("0");
  });

  it("shows contractsDeployed: false when areContractsDeployed returns false", async () => {
    mockAreContractsDeployed.mockResolvedValue(false);

    render(<TokenBalancesHarness ethAddress={ETH_ADDR} />);

    await waitFor(
      () => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      },
      { timeout: 5000 },
    );

    expect(screen.getByTestId("contractsDeployed").textContent).toBe("false");
    expect(screen.getByTestId("fakeEth").textContent).toBe("0");
    expect(screen.getByTestId("fakeUsd").textContent).toBe("0");
  });
});
