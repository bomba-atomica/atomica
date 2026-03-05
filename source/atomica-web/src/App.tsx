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
        <button
          onClick={() => setView("main")}
          className="text-2xl font-bold text-zinc-100 tracking-tight hover:text-white transition-colors"
        >
          Atomica Auction
        </button>

        <div className="flex items-center gap-2">
          {account ? (
            // Connected: truncated address + gear icon — both navigate to Settings
            <button
              onClick={() => setView("settings")}
              className={`flex items-center gap-2 text-xs font-mono border rounded px-3 py-2 transition-colors ${view === "settings"
                  ? "text-zinc-200 border-zinc-600 bg-zinc-800"
                  : "text-zinc-500 border-zinc-800 bg-zinc-900/50 hover:text-zinc-300 hover:border-zinc-600"
                }`}
            >
              <span>
                {account.substring(0, 6)}…{account.substring(38)}
              </span>
              <span className="text-zinc-500">⚙</span>
            </button>
          ) : (
            // Not connected: connect wallet button + gear icon to settings
            <>
              <button
                onClick={connect}
                className="bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded transition font-medium text-sm"
              >
                Connect MetaMask
              </button>
              <button
                onClick={() => setView("settings")}
                className={`p-2 rounded transition-colors ${view === "settings"
                    ? "text-zinc-200 bg-zinc-800"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                  }`}
                title="Settings"
              >
                ⚙
              </button>
            </>
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
