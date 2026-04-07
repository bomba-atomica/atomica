import { useState, useEffect } from "react";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import {
  formatETHBalance,
  formatFakeETHBalance,
  formatUSDBalance,
} from "@atomica/sdk/ethereum";
import { useWallet } from "../context/WalletContext";
import { useBalances } from "../context/BalancesContext";

/**
 * Renders a single network's account card: header, address row, and balance row.
 * The balance row is only rendered when `children` is non-null; callers control
 * exactly what gets shown (balances, "not on chain" message, etc.).
 */
function NetworkCard({
  label,
  address,
  addressTitle,
  addressTruncate,
  notConnectedLabel,
  children,
}: {
  label: string;
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
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
      </div>

      <div className="h-px bg-zinc-700/50" />

      {/* Address row — always shown; falls back to notConnectedLabel when null */}
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

      {/* Balance row — only rendered when the caller passes balance content */}
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

/** Single labelled balance value, e.g. "ETH 0.5000". */
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

  // Derive the Atomica address from the connected Ethereum address.
  // This is recomputed whenever the wallet changes.
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

  // APT is stored in octas (1 APT = 1e8 octas); display with 4 decimal places.
  const fmtApt = (val: number) => (val / 100_000_000).toFixed(4);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Ethereum ── */}
      <NetworkCard
        label="Ethereum"
        address={ethAddress}
        addressTruncate={(a) => `${a.substring(0, 10)}...${a.substring(38)}`}
        notConnectedLabel="Not connected"
      >
        {ethAddress &&
          // Balance display flow for Ethereum:
          //   loading         → render nothing (card still shows address)
          //   !ethAccountExists → account hasn't been funded/used yet on this chain
          //   ethAccountExists, no contracts → ETH balance only (token contracts not deployed)
          //   ethAccountExists, contracts up  → ETH + FETH + FUSD
          (ethBalances.loading ? null : !ethBalances.ethAccountExists ? (
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
          ))}
      </NetworkCard>

      {/* ── Atomica (Aptos) ── */}
      <NetworkCard
        label="Atomica"
        address={aptosAddress}
        addressTruncate={(a) => `${a.substring(0, 10)}...${a.substring(58)}`}
        // While the address is being derived (ethAddress known but aptosAddress not yet set)
        // show a transient label rather than "Not connected".
        notConnectedLabel={ethAddress ? "Deriving…" : "Not connected"}
      >
        {ethAddress &&
          // Balance display flow for Atomica:
          //   loading                       → render nothing
          //   !aptAccountExists || apt === 0 → not funded yet (show hint)
          //   apt > 0                        → show APT balance
          (aptosBalances.loading ? null : aptosBalances.aptAccountExists &&
            aptosBalances.apt > 0 ? (
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
