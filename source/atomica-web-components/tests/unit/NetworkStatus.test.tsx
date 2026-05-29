/**
 * Unit tests for NetworkStatus component.
 *
 * Verifies that:
 *   1. The component renders block height display for ETH and APT.
 *   2. Block heights update when the RPC mocks resolve.
 *
 * Mocks the Aptos and Ethereum provider calls so no live chain is needed.
 *
 * @see docs/specifications/web-architecture.md
 * @see #135 — Web component unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { NetworkConfigContext } from "../../src/network/network-config-state";

// vi.mock factories are hoisted — use vi.fn() inline, not outer variables.
vi.mock("@atomica/aptos-docker-testnet/browser", () => ({
  aptos: {
    getLedgerInfo: vi.fn().mockResolvedValue({ block_height: "42" }),
  },
}));

vi.mock("@atomica/sdk/ethereum", () => ({
  getEthereumProvider: vi.fn(() => ({
    getBlockNumber: vi.fn().mockResolvedValue(99),
  })),
}));

import { NetworkStatus } from "../../src/components/NetworkStatus";
import { aptos } from "@atomica/aptos-docker-testnet/browser";
import { getEthereumProvider } from "@atomica/sdk/ethereum";

function renderNetworkStatus() {
  return render(
    <NetworkConfigContext.Provider
      value={{ host: "localhost", setHost: vi.fn() }}
    >
      <NetworkStatus />
    </NetworkConfigContext.Provider>,
  );
}

describe("NetworkStatus — unit", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aptos.getLedgerInfo).mockResolvedValue({ block_height: "42" });
    vi.mocked(getEthereumProvider).mockReturnValue({
      getBlockNumber: vi.fn().mockResolvedValue(99),
    } as unknown as ReturnType<typeof getEthereumProvider>);
  });

  it("renders ETH and APT block height labels", () => {
    renderNetworkStatus();

    expect(screen.getByText("ETH")).toBeTruthy();
    expect(screen.getByText("APT")).toBeTruthy();
  });

  it("displays APT block height from getLedgerInfo mock", async () => {
    renderNetworkStatus();

    await waitFor(() => {
      expect(screen.getByText("42")).toBeTruthy();
    });
  });

  it("displays ETH block height from getBlockNumber mock", async () => {
    renderNetworkStatus();

    await waitFor(() => {
      expect(screen.getByText("99")).toBeTruthy();
    });
  });

  it("shows initial block height of 0 before fetch completes", () => {
    // Delay the mocks so initial state is visible
    vi.mocked(aptos.getLedgerInfo).mockReturnValueOnce(new Promise(() => {}));
    vi.mocked(getEthereumProvider).mockReturnValueOnce({
      getBlockNumber: vi.fn().mockReturnValueOnce(new Promise(() => {})),
    } as unknown as ReturnType<typeof getEthereumProvider>);

    renderNetworkStatus();

    // Initial render shows "0" for both
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });
});
