import { useState, useEffect } from "react";
import { getDerivedAddress } from "../lib/aptos";
import { useTokenBalances } from "../hooks/useTokenBalances"; // Import type

interface AccountStatusProps {
  ethAddress: string | null;
  // Inherit state from parent (which uses useTokenBalances)
  balances: ReturnType<typeof useTokenBalances>;
}

export function AccountStatus({ ethAddress, balances }: AccountStatusProps) {
  const [aptosAddress, setAptosAddress] = useState<string | null>(null);

  // Derive Aptos address from ETH address (pure calculation, no network required)
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

  // Format balances with correct decimal places
  const fmtEth = (val: number) => (val / 100_000_000).toFixed(4); // 8 decimals for ETH
  const fmtUsd = (val: number) => (val / 1_000_000).toFixed(2);   // 6 decimals for USD
  const fmtApt = (val: number) => (val / 100_000_000).toFixed(4); // 8 decimals for APT

  return (
    <div className="flex flex-col gap-2 text-sm font-mono bg-gray-800/50 px-4 py-3 rounded border border-gray-700">
      {/* Address Display */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center">
          <span className="text-gray-400 mr-2 min-w-[100px]">ETH Address:</span>
          {ethAddress ? (
            <span className="text-green-400 text-xs" title={ethAddress}>
              {ethAddress.substring(0, 8)}...{ethAddress.substring(38)}
            </span>
          ) : (
            <span className="text-gray-500">Not Connected</span>
          )}
        </div>

        {aptosAddress && (
          <>
            <div className="flex items-center">
              <span className="text-gray-400 mr-2 min-w-[100px]">Aptos Address:</span>
              <span className="text-blue-400 text-xs" title={aptosAddress}>
                {aptosAddress.substring(0, 8)}...{aptosAddress.substring(58)}
              </span>
            </div>
            <div className="text-xs text-gray-500 italic ml-[100px]">
              ↑ Derived from ETH address (holds APT & tokens)
            </div>
            {!balances.exists && !balances.loading && ethAddress && (
              <div className="text-xs text-red-400 ml-[100px] mt-1">
                ⚠ Account not found on chain (please use Faucet)
              </div>
            )}
          </>
        )}
      </div>

      {/* Balances */}
      {ethAddress && balances.exists && (
        <>
          <div className="h-px bg-gray-700"></div>
          <div className="flex items-center gap-4">
            <div title="Gas (APT)">
              <span className="text-gray-400 mr-1">APT:</span>
              <span className="text-white">{fmtApt(balances.apt)}</span>
            </div>

            {!balances.contractsDeployed ? (
              <div className="text-yellow-600 text-xs animate-pulse">Contracts Loading...</div>
            ) : (
              <>
                <div title="Fake ETH (8 decimals)">
                  <span className="text-gray-400 mr-1">ETH:</span>
                  <span className={balances.fakeEthInitialized ? "text-white" : "text-gray-500 italic"}>
                    {balances.fakeEthInitialized ? fmtEth(balances.fakeEth) : "Not Init"}
                  </span>
                </div>
                <div title="Fake USD (6 decimals)">
                  <span className="text-gray-400 mr-1">USD:</span>
                  <span className={balances.fakeUsdInitialized ? "text-white" : "text-gray-500 italic"}>
                    {balances.fakeUsdInitialized ? fmtUsd(balances.fakeUsd) : "Not Init"}
                  </span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
