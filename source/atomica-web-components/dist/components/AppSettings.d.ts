/**
 * @file AppSettings.tsx
 * @description Settings panel for network endpoints and polling configuration.
 *
 * Canonical doc: docs/architecture/v0-architecture.md §1 (package layout).
 *
 * Renders:
 *   - Ethereum RPC endpoint input (persists across reload via AppStateProvider).
 *   - Aptos RPC endpoint input (persists across reload via AppStateProvider).
 *   - Polling interval selector.
 *   - Reset-to-defaults button.
 *   - `TestnetSelector` origin indicator.
 *
 * All changes are dispatched to `AppStateProvider` which persists them via
 * `saveConfig` automatically. No local state is maintained here.
 */
export declare function AppSettings(): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AppSettings.d.ts.map