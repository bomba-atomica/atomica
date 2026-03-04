import { useState, useEffect } from "react";
import { getDerivedAddress } from "../lib/aptos";
import {
  formatETHBalance,
  formatFakeETHBalance,
  formatUSDBalance,
} from "../lib/ethereum/balances";
import { useWallet } from "../context/WalletContext";
import { useBalances } from "../context/BalancesContext";
import { useContractStatus } from "../context/ContractStatusContext";
import type { ContractDeploymentStatus } from "../hooks/useContractStatuses";

const STATUS_COLORS: Record<ContractDeploymentStatus, string> = {
  loading: "text-amber-400",
  ready: "text-emerald-400",
  missing: "text-rose-400",
};

function getStatusText(
  chain: string,
  status: ContractDeploymentStatus,
): string {
  switch (status) {
    case "ready":
      return `${chain} contracts deployed`;
    case "loading":
      return `${chain} contracts checking...`;
    case "missing":
      return `${chain} contracts unavailable`;
  }
}

function StatusBadge({
  chain,
  status,
}: {
  chain: string;
  status: ContractDeploymentStatus;
}) {
  return (
    <span className={`text-xs font-mono ${STATUS_COLORS[status]}`}>
      {getStatusText(chain, status)}
    </span>
  );
}

export function AccountStatus() {
  const { account: ethAddress } = useWallet();
  const { ethBalances, aptosBalances } = useBalances();
  const { evmStatus, aptosStatus } = useContractStatus();
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
    <div className="flex flex-col gap-2 text-sm font-mono bg-zinc-900 px-4 py-3 rounded border border-zinc-800">
      {/* Address Display */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center">
          <span className="text-zinc-500 mr-2 min-w-[100px]">ETH Address:</span>
          {ethAddress ? (
            <span className="text-zinc-300 text-xs" title={ethAddress}>
              {ethAddress.substring(0, 8)}...{ethAddress.substring(38)}
            </span>
          ) : (
            <span className="text-zinc-600">Not Connected</span>
          )}
        </div>

        {aptosAddress && (
          <div className="flex items-center">
            <span className="text-zinc-500 mr-2 min-w-[100px]">
              Aptos Address:
            </span>
            <span className="text-zinc-400 text-xs" title={aptosAddress}>
              {aptosAddress.substring(0, 8)}...{aptosAddress.substring(58)}
            </span>
          </div>
        )}
      </div>

      {ethAddress && (
        <>
          <div className="h-px bg-zinc-800"></div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-600 text-xs">Ethereum</span>
              <StatusBadge chain="Ethereum" status={evmStatus} />
            </div>
            <div className="flex items-center gap-4">
              <div title="Native ETH">
                <span className="text-zinc-500 mr-1">ETH:</span>
                <span className="text-zinc-200">
                  {formatETHBalance(ethBalances.ethBalance)}
                </span>
              </div>
              <div title="FakeETH ERC20 (18 decimals)">
                <span className="text-zinc-500 mr-1">FETH:</span>
                <span className="text-zinc-200">
                  {formatFakeETHBalance(ethBalances.ethFakeETH)}
                </span>
              </div>
              <div title="FakeUSD ERC20 (6 decimals)">
                <span className="text-zinc-500 mr-1">FUSD:</span>
                <span className="text-zinc-200">
                  {formatUSDBalance(ethBalances.ethFakeUSD)}
                </span>
              </div>
            </div>
          </div>

          <div className="h-px bg-zinc-800"></div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-600 text-xs">Aptos</span>
              <StatusBadge chain="Aptos" status={aptosStatus} />
            </div>
            {aptosBalances.aptosExists ? (
              <div className="flex items-center gap-4">
                <div title="Gas (APT)">
                  <span className="text-zinc-500 mr-1">APT:</span>
                  <span className="text-zinc-200">
                    {fmtApt(aptosBalances.apt)}
                  </span>
                </div>
              </div>
            ) : (
              !aptosBalances.loading &&
              ethAddress && (
                <div className="text-xs text-zinc-500 ml-[100px] mt-1 border-l-2 border-zinc-700 pl-2">
                  Atomica account not found (request APT from Faucet)
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
