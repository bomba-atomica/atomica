import { useState, useEffect } from "react";
import { getDerivedAddress } from "../lib/aptos";
import {
  formatETHBalance,
  formatFakeETHBalance,
  formatUSDBalance,
} from "../lib/ethereum/balances";
import { useWallet } from "../context/WalletContext";
import { useBalances } from "../context/BalancesContext";

function NetworkCard({
  label,
  icon,
  address,
  addressTitle,
  addressTruncate,
  notConnectedLabel,
  children,
}: {
  label: string;
  icon: string;
  address: string | null;
  addressTitle?: string;
  addressTruncate: (addr: string) => string;
  notConnectedLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 bg-zinc-800/50 border border-zinc-700/60 rounded-lg px-4 py-3">
      {/* Network header */}
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
      </div>

      <div className="h-px bg-zinc-700/50" />

      {/* Address row */}
      <div className="flex items-center gap-2 text-sm font-mono">
        <span className="text-zinc-500 min-w-[64px]">Address</span>
        {address ? (
          <span
            className="text-zinc-300 text-xs truncate"
            title={addressTitle ?? address}
          >
            {addressTruncate(address)}
          </span>
        ) : (
          <span className="text-zinc-600 text-xs">{notConnectedLabel}</span>
        )}
      </div>

      {/* Balances */}
      {children && (
        <>
          <div className="h-px bg-zinc-700/50" />
          <div className="flex items-center gap-4 text-sm font-mono flex-wrap">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function BalanceItem({
  label,
  value,
  title,
  muted,
}: {
  label: string;
  value: string;
  title?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1" title={title}>
      <span className="text-zinc-500 text-xs">{label}</span>
      <span className={muted ? "text-zinc-500" : "text-zinc-200"}>{value}</span>
    </div>
  );
}

export function AccountStatus() {
  const { account: ethAddress } = useWallet();
  const { ethBalances, aptosBalances } = useBalances();
  const [aptosAddress, setAptosAddress] = useState<string | null>(null);

  useEffect(() => {
    const derive = async () => {
      if (!ethAddress) {
        setAptosAddress(null);
        return;
      }
      const derived = await getDerivedAddress(ethAddress.toLowerCase());
      setAptosAddress(derived.toString());
    };
    derive();
  }, [ethAddress]);

  const fmtApt = (val: number) => (val / 100_000_000).toFixed(4);

  return (
    <div className="flex flex-col gap-3">
      {/* Ethereum */}
      <NetworkCard
        label="Ethereum"
        icon="⬡"
        address={ethAddress}
        addressTruncate={(a) => `${a.substring(0, 10)}...${a.substring(38)}`}
        notConnectedLabel="Not connected"
      >
        {ethAddress && (
          ethBalances.loading ? null : !ethBalances.ethAccountExists ? (
            <span className="text-xs text-zinc-500">
              Account not yet on chain
            </span>
          ) : (
            <>
              <BalanceItem
                label="ETH"
                value={formatETHBalance(ethBalances.ethBalance)}
                title="Native ETH"
              />
              {/* ERC-20 balances only meaningful when contracts are deployed */}
              {ethBalances.ethContractsDeployed ? (
                <>
                  <BalanceItem
                    label="FETH"
                    value={formatFakeETHBalance(ethBalances.ethFakeETH)}
                    title="FakeETH ERC20 (18 decimals)"
                  />
                  <BalanceItem
                    label="FUSD"
                    value={formatUSDBalance(ethBalances.ethFakeUSD)}
                    title="FakeUSD ERC20 (6 decimals)"
                  />
                </>
              ) : (
                <span className="text-xs text-zinc-500">
                  Contracts not deployed
                </span>
              )}
            </>
          )
        )}
      </NetworkCard>

      {/* Atomica (Aptos) */}
      <NetworkCard
        label="Atomica"
        icon="⬢"
        address={aptosAddress}
        addressTruncate={(a) => `${a.substring(0, 10)}...${a.substring(58)}`}
        notConnectedLabel={ethAddress ? "Deriving…" : "Not connected"}
      >
        {ethAddress &&
          (aptosBalances.loading ? null : aptosBalances.aptAccountExists ? (
            <BalanceItem
              label="APT"
              value={fmtApt(aptosBalances.apt)}
              title="Gas (APT)"
            />
          ) : (
            <span className="text-xs text-zinc-500">
              Account not yet on chain
            </span>
          ))}
      </NetworkCard>
    </div>
  );
}
