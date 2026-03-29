import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "./aptos/config";
import { NetworkConfigContext } from "./network-config-state";
import { buildAptosFullnodeUrl, getStoredHost, setStoredHost, } from "./network-host";
function applyHost(host) {
    const aptosConfig = new AptosConfig({
        network: Network.LOCAL,
        fullnode: buildAptosFullnodeUrl(host),
    });
    setAptosInstance(new Aptos(aptosConfig));
}
export function NetworkConfigProvider({ children, }) {
    const [host, setHostState] = useState(() => {
        const stored = getStoredHost();
        // Apply immediately so the Aptos singleton uses the right host on first
        // render (not just after the first user interaction).
        applyHost(stored);
        return stored;
    });
    const setHost = (h) => {
        setStoredHost(h);
        setHostState(h);
        applyHost(h);
    };
    return (_jsx(NetworkConfigContext.Provider, { value: { host, setHost }, children: children }));
}
//# sourceMappingURL=network-config-context.js.map