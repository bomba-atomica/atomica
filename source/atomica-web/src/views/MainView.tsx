import { AuctionCreator } from "../components/AuctionCreator";
import { AuctionBidder } from "../components/AuctionBidder";
import { useWallet } from "../context/WalletContext";
import { useBalances } from "../context/BalancesContext";
import { useContractStatus } from "../context/ContractStatusContext";

interface MainViewProps {
  onNavigateToSettings: () => void;
}

export function MainView({ onNavigateToSettings }: MainViewProps) {
  const { account } = useWallet();
  const { ethBalances } = useBalances();
  const { evmAlive, aptosAlive } = useContractStatus();

  const networksUnavailable = evmAlive === false || aptosAlive === false;

  return (
    <main className="container mx-auto p-8 max-w-5xl">
      {/* Warning banners */}
      {!account && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-400">
          <span>
            Wallet not connected — connect to participate in auctions.
          </span>
          <button
            onClick={onNavigateToSettings}
            className="flex-shrink-0 rounded border border-amber-800 px-3 py-1 text-xs text-amber-300 hover:bg-amber-900/40 transition-colors"
          >
            Go to Settings →
          </button>
        </div>
      )}

      {networksUnavailable && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-400">
          <span>
            Testnet networks unreachable — check network configuration.
          </span>
          <button
            onClick={onNavigateToSettings}
            className="flex-shrink-0 rounded border border-amber-800 px-3 py-1 text-xs text-amber-300 hover:bg-amber-900/40 transition-colors"
          >
            Check Settings →
          </button>
        </div>
      )}

      {/* Auction tools */}
      {account && (
        <div className="mb-8">
          {ethBalances.ethFakeETH === 0n || ethBalances.ethFakeUSD === 0n ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 opacity-40 grayscale">
              <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-zinc-500">
                    Create Auction
                  </h2>
                  <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-1 rounded border border-zinc-700">
                    Needs tokens
                  </span>
                </div>
                <p className="text-zinc-600 text-sm">
                  Request FAKEETH and FAKEUSD from the faucet in Settings to
                  unlock auction creation.
                </p>
              </div>
              <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-zinc-500">
                    Bid on Auction
                  </h2>
                  <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-1 rounded border border-zinc-700">
                    Needs tokens
                  </span>
                </div>
                <p className="text-zinc-600 text-sm">
                  Request FAKEUSD from the faucet in Settings to unlock bidding.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <AuctionCreator />
              <AuctionBidder />
            </div>
          )}
        </div>
      )}

      {/* Active Auctions */}
      <div>
        <h2 className="text-2xl font-bold mb-4 text-zinc-200">
          Active Auctions
        </h2>
        <div className="bg-zinc-900/50 border border-zinc-900 p-8 rounded text-center text-zinc-600">
          No active auctions found.
        </div>
      </div>
    </main>
  );
}
