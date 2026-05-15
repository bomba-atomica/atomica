import { jsx as _jsx } from "react/jsx-runtime";
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
import { useEffect } from "react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "@atomica/sdk/aptos";
import { NetworkConfigContext } from "./network-config-state";
import { buildAptosFullnodeUrl, getStoredHost, setStoredHost, } from "@atomica/sdk/network-host";
import { useAppState } from "../state/app-state";
function applyHost(host) {
    const aptosConfig = new AptosConfig({
        network: Network.LOCAL,
        fullnode: buildAptosFullnodeUrl(host),
    });
    setAptosInstance(new Aptos(aptosConfig));
}
export function NetworkConfigProvider({ children, }) {
    const { state, dispatch } = useAppState();
    // Derive host from aptosRpc for backward compat with consumers using `host`.
    // When aptosRpc is the default, fall back to getStoredHost().
    const host = (() => {
        try {
            const url = new URL(state.network.aptosRpc);
            return url.hostname;
        }
        catch {
            return getStoredHost();
        }
    })();
    const setHost = (h) => {
        setStoredHost(h);
        applyHost(h);
        dispatch({
            type: "NETWORK_CONFIG_UPDATED",
            patch: { aptosRpc: buildAptosFullnodeUrl(h) },
        });
    };
    // Apply the host on mount so the Aptos singleton uses the persisted host
    // on first render, not just after the first user interaction.
    useEffect(() => {
        applyHost(host);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Re-apply whenever network.aptosRpc changes.
    useEffect(() => {
        applyHost(host);
    }, [host]);
    return (_jsx(NetworkConfigContext.Provider, { value: { host, setHost }, children: children }));
}
//# sourceMappingURL=network-config-context.js.map