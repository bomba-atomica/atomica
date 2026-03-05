import { Faucet } from "../components/Faucet";
import { SanityTest } from "../components/SanityTest";
import { AccountStatus } from "../components/AccountStatus";
import { TestnetSelector } from "../components/TestnetSelector";
import { NetworkStatus } from "../components/NetworkStatus";
import { ContractStatus } from "../components/ContractStatus";
import { useWallet } from "../context/WalletContext";

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
      {title}
    </h2>
  );
}

export function SettingsView() {
  const { account, connect } = useWallet();

  return (
    <main className="container mx-auto p-8 max-w-3xl">
      <div className="flex flex-col gap-8">
        {/* Network */}
        <section>
          <SectionHeader title="Network" />
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-zinc-300 font-medium">
                  Testnet Host
                </span>
                <span className="text-xs text-zinc-500">
                  Switch between local and remote testnet nodes.
                </span>
              </div>
              <TestnetSelector />
            </div>
            <div className="h-px bg-zinc-800" />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-zinc-300 font-medium">
                  Block Heights
                </span>
                <span className="text-xs text-zinc-500">
                  Live block counters — confirms nodes are reachable.
                </span>
              </div>
              <NetworkStatus />
            </div>
            <div className="h-px bg-zinc-800" />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-zinc-300 font-medium">
                  Contracts
                </span>
                <span className="text-xs text-zinc-500">
                  Whether testnet contracts are deployed and reachable.
                </span>
              </div>
              <ContractStatus />
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <SectionHeader title="Account" />
          {!account && (
            <div className="flex items-center justify-between gap-4 mb-3">
              <span className="text-sm text-zinc-400">
                Connect MetaMask to see balances and interact with auctions.
              </span>
              <button
                onClick={connect}
                className="flex-shrink-0 bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded transition font-medium text-sm"
              >
                Connect MetaMask
              </button>
            </div>
          )}
          <AccountStatus />
        </section>

        {/* Tokens */}
        {account && (
          <section>
            <SectionHeader title="Tokens" />
            <Faucet />
          </section>
        )}

        {/* Diagnostics */}
        {account && (
          <section>
            <SectionHeader title="Diagnostics" />
            <SanityTest />
          </section>
        )}
      </div>
    </main>
  );
}
