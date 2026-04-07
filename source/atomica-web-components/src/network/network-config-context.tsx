import { useState } from "react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "@atomica/sdk/aptos";
import { NetworkConfigContext } from "./network-config-state";
import {
  buildAptosFullnodeUrl,
  getStoredHost,
  setStoredHost,
} from "@atomica/sdk/network-host";

function applyHost(host: string): void {
  const aptosConfig = new AptosConfig({
    network: Network.LOCAL,
    fullnode: buildAptosFullnodeUrl(host),
  });
  setAptosInstance(new Aptos(aptosConfig));
}

export function NetworkConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [host, setHostState] = useState<string>(() => {
    const stored = getStoredHost();
    // Apply immediately so the Aptos singleton uses the right host on first
    // render (not just after the first user interaction).
    applyHost(stored);
    return stored;
  });

  const setHost = (h: string) => {
    setStoredHost(h);
    setHostState(h);
    applyHost(h);
  };

  return (
    <NetworkConfigContext.Provider value={{ host, setHost }}>
      {children}
    </NetworkConfigContext.Provider>
  );
}
