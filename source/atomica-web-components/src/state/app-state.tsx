/**
 * @file app-state.tsx
 * @description Centralized, typed React state layer for the Atomica demo app.
 *
 * Canonical doc: docs/architecture/v0-architecture.md §1 (package layout).
 *
 * Replaces scattered per-context state with a single `AppStateProvider` that
 * wraps the demo root.  Sub-trees that previously maintained wallet, network,
 * polling, and transaction state independently now read from / write to
 * selectors exposed by `useAppState`.
 *
 * Design constraints (from issue #91 decisions):
 *   - React context + reducer only — no third-party state library.
 *   - Persisted config uses `loadConfig` / `saveConfig` from app-config.ts.
 *   - Multi-account / multi-wallet support is out of scope (v1+).
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from "react";
import {
  loadConfig,
  saveConfig,
  type AppConfig,
  DEFAULT_CONFIG,
} from "./app-config";

// ── State shape ───────────────────────────────────────────────────────────────

export interface WalletState {
  /** Connected Ethereum address, or null when disconnected. */
  address: string | null;
  /** EIP-155 chain ID reported by the connected wallet, or null. */
  chainId: number | null;
  /** True when a wallet account is connected. */
  connected: boolean;
}

export interface NetworkState {
  /** Ethereum JSON-RPC endpoint URL. */
  ethereumRpc: string;
  /** Aptos fullnode REST endpoint URL. */
  aptosRpc: string;
  /**
   * Dual-chain health snapshot.
   * null = not yet checked; true = responding; false = unreachable.
   */
  chainHealth: { ethereum: boolean | null; aptos: boolean | null };
}

export interface PollingState {
  /** Polling interval in milliseconds. */
  interval: number;
  /** Whether polling loops are currently active. */
  active: boolean;
}

export interface TxState {
  /** True while a transaction is in-flight. */
  pending: boolean;
  /** Hash of the most recent submitted transaction, or null. */
  lastHash: string | null;
  /** Error message from the most recent failed transaction, or null. */
  error: string | null;
}

export interface AppState {
  wallet: WalletState;
  network: NetworkState;
  polling: PollingState;
  tx: TxState;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type AppAction =
  | { type: "WALLET_CONNECTED"; address: string; chainId: number | null }
  | { type: "WALLET_DISCONNECTED" }
  | { type: "NETWORK_CONFIG_UPDATED"; patch: Partial<NetworkState> }
  | {
      type: "CHAIN_HEALTH_UPDATED";
      ethereum?: boolean | null;
      aptos?: boolean | null;
    }
  | { type: "POLLING_SET_INTERVAL"; interval: number }
  | { type: "POLLING_SET_ACTIVE"; active: boolean }
  | { type: "TX_PENDING" }
  | { type: "TX_SUCCESS"; hash: string }
  | { type: "TX_ERROR"; error: string }
  | { type: "TX_RESET" }
  | { type: "CONFIG_LOADED"; config: AppConfig };

// ── Reducer ───────────────────────────────────────────────────────────────────

function buildInitialState(): AppState {
  // Config is loaded synchronously; falls back to defaults if localStorage is
  // empty or version-mismatched (see app-config.ts).
  const cfg = loadConfig();
  return {
    wallet: { address: null, chainId: null, connected: false },
    network: {
      ethereumRpc: cfg.ethereumRpc,
      aptosRpc: cfg.aptosRpc,
      chainHealth: { ethereum: null, aptos: null },
    },
    polling: { interval: cfg.pollingInterval, active: true },
    tx: { pending: false, lastHash: null, error: null },
  };
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "WALLET_CONNECTED":
      return {
        ...state,
        wallet: {
          address: action.address,
          chainId: action.chainId,
          connected: true,
        },
      };
    case "WALLET_DISCONNECTED":
      return {
        ...state,
        wallet: { address: null, chainId: null, connected: false },
      };
    case "NETWORK_CONFIG_UPDATED":
      return {
        ...state,
        network: { ...state.network, ...action.patch },
      };
    case "CHAIN_HEALTH_UPDATED":
      return {
        ...state,
        network: {
          ...state.network,
          chainHealth: {
            ethereum:
              action.ethereum !== undefined
                ? action.ethereum
                : state.network.chainHealth.ethereum,
            aptos:
              action.aptos !== undefined
                ? action.aptos
                : state.network.chainHealth.aptos,
          },
        },
      };
    case "POLLING_SET_INTERVAL":
      return {
        ...state,
        polling: { ...state.polling, interval: action.interval },
      };
    case "POLLING_SET_ACTIVE":
      return {
        ...state,
        polling: { ...state.polling, active: action.active },
      };
    case "TX_PENDING":
      return {
        ...state,
        tx: { pending: true, lastHash: state.tx.lastHash, error: null },
      };
    case "TX_SUCCESS":
      return {
        ...state,
        tx: { pending: false, lastHash: action.hash, error: null },
      };
    case "TX_ERROR":
      return {
        ...state,
        tx: {
          pending: false,
          lastHash: state.tx.lastHash,
          error: action.error,
        },
      };
    case "TX_RESET":
      return {
        ...state,
        tx: { pending: false, lastHash: null, error: null },
      };
    case "CONFIG_LOADED": {
      const c = action.config;
      return {
        ...state,
        network: {
          ...state.network,
          ethereumRpc: c.ethereumRpc,
          aptosRpc: c.aptosRpc,
        },
        polling: { ...state.polling, interval: c.pollingInterval },
      };
    }
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    appReducer,
    undefined,
    buildInitialState,
  );

  // Persist network config and polling interval whenever they change.
  useEffect(() => {
    const cfg = loadConfig();
    const updated: AppConfig = {
      ...cfg,
      ethereumRpc: state.network.ethereumRpc,
      aptosRpc: state.network.aptosRpc,
      pollingInterval: state.polling.interval,
    };
    saveConfig(updated);
  }, [
    state.network.ethereumRpc,
    state.network.aptosRpc,
    state.polling.interval,
  ]);

  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Access the centralized app state and dispatch function.
 *
 * Must be called inside a component tree wrapped by `AppStateProvider`.
 */
export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used inside <AppStateProvider>");
  }
  return ctx;
}

// ── Selector helpers ──────────────────────────────────────────────────────────

/** Convenience selector: wallet slice only. */
export function useWalletState(): WalletState {
  return useAppState().state.wallet;
}

/** Convenience selector: network slice only. */
export function useNetworkState(): NetworkState {
  return useAppState().state.network;
}

/** Convenience selector: polling slice only. */
export function usePollingState(): PollingState {
  return useAppState().state.polling;
}

/** Convenience selector: transaction slice only. */
export function useTxState(): TxState {
  return useAppState().state.tx;
}

/** Convenience helper: build an `AppConfig` snapshot from current state. */
export function useConfigSnapshot(): AppConfig {
  const { state } = useAppState();
  return {
    version: 1,
    host: DEFAULT_CONFIG.host,
    ethereumRpc: state.network.ethereumRpc,
    aptosRpc: state.network.aptosRpc,
    pollingInterval: state.polling.interval,
  };
}
