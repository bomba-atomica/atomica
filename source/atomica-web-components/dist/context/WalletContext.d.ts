/**
 * @file WalletContext.tsx
 * @description Thin wrapper around AppStateProvider for wallet state.
 *
 * Canonical doc: docs/architecture/v0-architecture.md §1.
 *
 * WalletProvider and WalletContext are preserved for backward compatibility
 * with existing consumers (e.g. tests that inject WalletContext.Provider
 * directly).  Internally, WalletProvider now delegates to AppStateProvider
 * — it dispatches WALLET_CONNECTED / WALLET_DISCONNECTED instead of
 * maintaining independent local state.
 *
 * Components that have already migrated to useAppState() do not need this
 * wrapper.
 */
interface WalletContextValue {
    account: string | null;
    connect: () => Promise<void>;
}
export declare const WalletContext: import("react").Context<WalletContextValue>;
/**
 * WalletProvider — thin wrapper that:
 *   1. Reads account from AppStateProvider (wallet.address).
 *   2. Dispatches WALLET_CONNECTED on successful wallet connect.
 *   3. Exposes the legacy WalletContext shape so existing consumers compile
 *      without changes.
 *
 * Must be mounted inside <AppStateProvider>.
 */
export declare function WalletProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare const useWallet: () => WalletContextValue;
export {};
//# sourceMappingURL=WalletContext.d.ts.map