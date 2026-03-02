/**
 * Network Config Context
 *
 * Provides a runtime-configurable testnet host. Persists to localStorage so
 * the setting survives page refreshes.
 *
 * When the host changes, the Aptos singleton is updated immediately. Ethereum
 * providers call `getStoredHost()` at use-time, so they pick up changes on the
 * next invocation without needing a full page reload.
 */

import { createContext, useContext, useState } from "react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "./aptos/config";

const STORAGE_KEY = "atomica-testnet-host";

function getBrowserHost(): string {
  if (typeof window === "undefined") {
    return "localhost";
  }
  const host = window.location.hostname?.trim();
  return host || "localhost";
}

export function getStoredHost(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || getBrowserHost();
  } catch {
    return getBrowserHost();
  }
}

function applyHost(host: string): void {
  const aptosConfig = new AptosConfig({
    network: Network.LOCAL,
    fullnode: `http://${host}:8080/v1`,
  });
  setAptosInstance(new Aptos(aptosConfig));
}

const NetworkConfigContext = createContext<{
  host: string;
  setHost: (host: string) => void;
}>({ host: "localhost", setHost: () => {} });

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
    localStorage.setItem(STORAGE_KEY, h);
    setHostState(h);
    applyHost(h);
  };

  return (
    <NetworkConfigContext.Provider value={{ host, setHost }}>
      {children}
    </NetworkConfigContext.Provider>
  );
}

export function useNetworkConfig() {
  return useContext(NetworkConfigContext);
}
