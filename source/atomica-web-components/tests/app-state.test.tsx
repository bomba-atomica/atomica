/**
 * @file app-state.test.tsx
 * @description Unit tests for AppStateProvider and useAppState hook.
 *
 * Covers the test plan items from issue #91:
 *   - AppStateProvider renders children.
 *   - useAppState returns expected initial state.
 *   - Dispatching actions updates the state slices correctly.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useAppState, AppStateProvider } from "../src/state/app-state";
import { DEFAULT_CONFIG } from "../src/state/app-config";

// ── Helper component ──────────────────────────────────────────────────────────

function StateReadout() {
  const { state } = useAppState();
  return (
    <div>
      <span data-testid="wallet-connected">
        {String(state.wallet.connected)}
      </span>
      <span data-testid="wallet-address">{state.wallet.address ?? "null"}</span>
      <span data-testid="eth-rpc">{state.network.ethereumRpc}</span>
      <span data-testid="aptos-rpc">{state.network.aptosRpc}</span>
      <span data-testid="polling-interval">
        {String(state.polling.interval)}
      </span>
      <span data-testid="tx-pending">{String(state.tx.pending)}</span>
    </div>
  );
}

function DispatchTestbed({
  onDispatch,
}: {
  onDispatch: (dispatch: ReturnType<typeof useAppState>["dispatch"]) => void;
}) {
  const { dispatch } = useAppState();
  onDispatch(dispatch);
  return <StateReadout />;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AppStateProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders children", () => {
    render(
      <AppStateProvider>
        <span data-testid="child">hello</span>
      </AppStateProvider>,
    );
    expect(screen.getByTestId("child").textContent).toBe("hello");
  });

  it("useAppState returns expected initial state", () => {
    render(
      <AppStateProvider>
        <StateReadout />
      </AppStateProvider>,
    );
    expect(screen.getByTestId("wallet-connected").textContent).toBe("false");
    expect(screen.getByTestId("wallet-address").textContent).toBe("null");
    expect(screen.getByTestId("eth-rpc").textContent).toBe(
      DEFAULT_CONFIG.ethereumRpc,
    );
    expect(screen.getByTestId("aptos-rpc").textContent).toBe(
      DEFAULT_CONFIG.aptosRpc,
    );
    expect(screen.getByTestId("polling-interval").textContent).toBe(
      String(DEFAULT_CONFIG.pollingInterval),
    );
    expect(screen.getByTestId("tx-pending").textContent).toBe("false");
  });

  it("WALLET_CONNECTED updates wallet slice", async () => {
    let dispatchRef: ReturnType<typeof useAppState>["dispatch"] | null = null;
    render(
      <AppStateProvider>
        <DispatchTestbed
          onDispatch={(d) => {
            dispatchRef = d;
          }}
        />
      </AppStateProvider>,
    );
    expect(screen.getByTestId("wallet-connected").textContent).toBe("false");

    await act(async () => {
      dispatchRef!({
        type: "WALLET_CONNECTED",
        address: "0xdeadbeef",
        chainId: 1,
      });
    });

    expect(screen.getByTestId("wallet-connected").textContent).toBe("true");
    expect(screen.getByTestId("wallet-address").textContent).toBe("0xdeadbeef");
  });

  it("NETWORK_CONFIG_UPDATED updates network slice", async () => {
    let dispatchRef: ReturnType<typeof useAppState>["dispatch"] | null = null;
    render(
      <AppStateProvider>
        <DispatchTestbed
          onDispatch={(d) => {
            dispatchRef = d;
          }}
        />
      </AppStateProvider>,
    );

    await act(async () => {
      dispatchRef!({
        type: "NETWORK_CONFIG_UPDATED",
        patch: { ethereumRpc: "http://custom:8545" },
      });
    });

    expect(screen.getByTestId("eth-rpc").textContent).toBe(
      "http://custom:8545",
    );
  });

  it("TX_PENDING / TX_SUCCESS updates tx slice", async () => {
    let dispatchRef: ReturnType<typeof useAppState>["dispatch"] | null = null;
    render(
      <AppStateProvider>
        <DispatchTestbed
          onDispatch={(d) => {
            dispatchRef = d;
          }}
        />
      </AppStateProvider>,
    );

    await act(async () => {
      dispatchRef!({ type: "TX_PENDING" });
    });
    expect(screen.getByTestId("tx-pending").textContent).toBe("true");

    await act(async () => {
      dispatchRef!({ type: "TX_SUCCESS", hash: "0xabc123" });
    });
    expect(screen.getByTestId("tx-pending").textContent).toBe("false");
  });

  it("useAppState throws when used outside AppStateProvider", () => {
    // Suppress the expected error from React's error boundary.
    const originalError = console.error;
    console.error = () => {};
    expect(() =>
      render(
        <StateReadout />,
      ),
    ).toThrow("useAppState must be used inside <AppStateProvider>");
    console.error = originalError;
  });
});
