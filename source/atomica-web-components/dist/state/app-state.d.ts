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
import { type ReactNode } from "react";
import { type AppConfig } from "./app-config";
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
    chainHealth: {
        ethereum: boolean | null;
        aptos: boolean | null;
    };
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
export type AppAction = {
    type: "WALLET_CONNECTED";
    address: string;
    chainId: number | null;
} | {
    type: "WALLET_DISCONNECTED";
} | {
    type: "NETWORK_CONFIG_UPDATED";
    patch: Partial<NetworkState>;
} | {
    type: "CHAIN_HEALTH_UPDATED";
    ethereum?: boolean | null;
    aptos?: boolean | null;
} | {
    type: "POLLING_SET_INTERVAL";
    interval: number;
} | {
    type: "POLLING_SET_ACTIVE";
    active: boolean;
} | {
    type: "TX_PENDING";
} | {
    type: "TX_SUCCESS";
    hash: string;
} | {
    type: "TX_ERROR";
    error: string;
} | {
    type: "TX_RESET";
} | {
    type: "CONFIG_LOADED";
    config: AppConfig;
};
interface AppStateContextValue {
    state: AppState;
    dispatch: React.Dispatch<AppAction>;
}
export declare function AppStateProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
/**
 * Access the centralized app state and dispatch function.
 *
 * Must be called inside a component tree wrapped by `AppStateProvider`.
 */
export declare function useAppState(): AppStateContextValue;
/** Convenience selector: wallet slice only. */
export declare function useWalletState(): WalletState;
/** Convenience selector: network slice only. */
export declare function useNetworkState(): NetworkState;
/** Convenience selector: polling slice only. */
export declare function usePollingState(): PollingState;
/** Convenience selector: transaction slice only. */
export declare function useTxState(): TxState;
/** Convenience helper: build an `AppConfig` snapshot from current state. */
export declare function useConfigSnapshot(): AppConfig;
export {};
//# sourceMappingURL=app-state.d.ts.map