/**
 * @file network-config-context.tsx
 * @description Thin wrapper around AppStateProvider for network config state.
 *
 * Canonical doc: docs/architecture/v0-architecture.md §1.
 *
 * NetworkConfigProvider is preserved for backward compatibility. It now reads
 * `host` from the AppStateProvider (derived from `aptosRpc`) and dispatches
 * NETWORK_CONFIG_UPDATED instead of maintaining independent local state.
 *
 * Must be mounted inside <AppStateProvider>.
 */
export declare function NetworkConfigProvider({ children, }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=network-config-context.d.ts.map