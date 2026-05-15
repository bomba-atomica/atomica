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

import { createContext, useContext, useEffect } from "react";
import { ethers } from "ethers";
import { useAppState } from "../state/app-state";

interface WalletContextValue {
  account: string | null;
  connect: () => Promise<void>;
}

export const WalletContext = createContext<WalletContextValue>({
  account: null,
  connect: async () => {},
});

/**
 * WalletProvider — thin wrapper that:
 *   1. Reads account from AppStateProvider (wallet.address).
 *   2. Dispatches WALLET_CONNECTED on successful wallet connect.
 *   3. Exposes the legacy WalletContext shape so existing consumers compile
 *      without changes.
 *
 * Must be mounted inside <AppStateProvider>.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useAppState();
  const account = state.wallet.address;

  const connect = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const network = await provider.getNetwork();
        dispatch({
          type: "WALLET_CONNECTED",
          address,
          chainId: Number(network.chainId),
        });
      } catch (error) {
        console.error("Error connecting wallet:", error);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const network = await provider.getNetwork();
          dispatch({
            type: "WALLET_CONNECTED",
            address: accounts[0].address,
            chainId: Number(network.chainId),
          });
        }
      }
    };
    void checkConnection();
  }, [dispatch]);

  return (
    <WalletContext.Provider value={{ account, connect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
