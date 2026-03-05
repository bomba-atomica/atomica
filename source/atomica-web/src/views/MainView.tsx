import { useState, useEffect } from "react";
import { AuctionCreator } from "../components/AuctionCreator";
import { AuctionBidder } from "../components/AuctionBidder";
import { AuctionCountdown } from "../components/AuctionCountdown";
import { getUpcomingAuctions } from "../components/auctionUtils";
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
  const needsTokens =
    account && (ethBalances.ethFakeETH === 0n || ethBalances.ethFakeUSD === 0n);

  // Keep auction list live — recompute when minute ticks over
  const [auctions, setAuctions] = useState(() =>
    getUpcomingAuctions(new Date()),
  );
  useEffect(() => {
    const id = setInterval(
      () => setAuctions(getUpcomingAuctions(new Date())),
      60_000,
    );
    return () => clearInterval(id);
  }, []);

  const [next, subsequent] = auctions;

  return (
    <main className="container mx-auto p-8 max-w-6xl">
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

      {needsTokens && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
          <span>Fund your account with test tokens to participate.</span>
          <button
            onClick={onNavigateToSettings}
            className="flex-shrink-0 rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Get Tokens →
          </button>
        </div>
      )}

      {/* ── Main 2/3 + 1/3 layout ── */}
      <div className="flex gap-6 items-start">
        {/* ── Left 2/3: next auction with Sell + Buy panels ── */}
        <div className="flex-[2] min-w-0 flex flex-col gap-5">
          {/* Auction header */}
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-0.5">
                Next Auction
              </p>
              <h2 className="text-xl font-semibold text-zinc-100">
                {next.name}
              </h2>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-zinc-500 mb-0.5">{next.utcLabel}</p>
              <AuctionCountdown
                startsAt={next.startsAt}
                className="font-mono text-lg font-semibold text-zinc-200"
              />
            </div>
          </div>

          {/* Sell + Buy panels */}
          <div className="grid grid-cols-2 gap-4">
            <AuctionCreator />
            <AuctionBidder />
          </div>
        </div>

        {/* ── Right 1/3: subsequent auction info only ── */}
        <div className="flex-[1] min-w-0">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Subsequent Auction
            </p>
            <h3 className="text-base font-semibold text-zinc-300">
              {subsequent.name}
            </h3>
            <div className="h-px bg-zinc-800" />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Opens at</span>
              <span className="text-sm text-zinc-400">
                {subsequent.utcLabel}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Opens in</span>
              <AuctionCountdown
                startsAt={subsequent.startsAt}
                className="font-mono text-sm text-zinc-400"
              />
            </div>
            <div className="h-px bg-zinc-800" />
            <p className="text-xs text-zinc-600 leading-relaxed">
              Sealed bids accepted until close. Settlement 1–3 hours after.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
