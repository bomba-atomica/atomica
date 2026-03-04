import { useState } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { BalancesProvider } from "./context/BalancesContext";
import { ContractStatusProvider } from "./context/ContractStatusContext";
import { MainView } from "./views/MainView";
import { SettingsView } from "./views/SettingsView";

type View = "main" | "settings";

function AppShell() {
  const [view, setView] = useState<View>("main");
  const { account, connect } = useWallet();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-400 font-sans selection:bg-zinc-800 selection:text-white">
      <header className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950/95 sticky top-0 z-50 backdrop-blur">
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
          Atomica Auction
        </h1>

        <nav className="flex items-center gap-1">
          <button
            onClick={() => setView("main")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              view === "main"
                ? "text-zinc-100 bg-zinc-800"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            Auctions
          </button>
          <button
            onClick={() => setView("settings")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              view === "settings"
                ? "text-zinc-100 bg-zinc-800"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            Settings
          </button>
        </nav>

        <div className="flex items-center">
          {account ? (
            <span className="text-xs font-mono text-zinc-500 border border-zinc-800 rounded px-3 py-2 bg-zinc-900/50">
              {account.substring(0, 6)}...{account.substring(38)}
            </span>
          ) : (
            <button
              onClick={connect}
              className="bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded transition font-medium text-sm"
            >
              Connect MetaMask
            </button>
          )}
        </div>
      </header>

      {view === "main" ? (
        <MainView onNavigateToSettings={() => setView("settings")} />
      ) : (
        <SettingsView />
      )}
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <ContractStatusProvider>
        <BalancesProvider>
          <AppShell />
        </BalancesProvider>
      </ContractStatusProvider>
    </WalletProvider>
  );
}
