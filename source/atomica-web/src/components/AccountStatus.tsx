import { useState, useEffect } from "react";
import { getDerivedAddress } from "../lib/aptos";
import {
  useDualChainBalances,
  formatETH,
  formatEthFakeETH,
  formatEthFakeUSD,
} from "../hooks/useDualChainBalances";

interface AccountStatusProps {
  ethAddress: string | null;
  balances: ReturnType<typeof useDualChainBalances>;
}

export function AccountStatus({ ethAddress, balances }: AccountStatusProps) {
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

  // Aptos-side formatting (base units)
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
          <>
            <div className="flex items-center">
              <span className="text-zinc-500 mr-2 min-w-[100px]">
                Aptos Address:
              </span>
              <span className="text-zinc-400 text-xs" title={aptosAddress}>
                {aptosAddress.substring(0, 8)}...{aptosAddress.substring(58)}
              </span>
            </div>
            {!balances.aptosExists && !balances.loading && ethAddress && (
              <div className="text-xs text-zinc-500 ml-[100px] mt-1 border-l-2 border-zinc-700 pl-2">
                Atomica account not found (request APT from Faucet)
              </div>
            )}
          </>
        )}
      </div>

      {/* Balances */}
      {ethAddress && (
        <>
          <div className="h-px bg-zinc-800"></div>

          {/* Ethereum balances */}
          <div className="flex flex-col gap-1">
            <span className="text-zinc-600 text-xs">Ethereum</span>
            <div className="flex items-center gap-4">
              <div title="Native ETH">
                <span className="text-zinc-500 mr-1">ETH:</span>
                <span className="text-zinc-200">
                  {formatETH(balances.ethBalance)}
                </span>
              </div>
              <div title="FakeETH ERC20 (18 decimals)">
                <span className="text-zinc-500 mr-1">FETH:</span>
                <span className="text-zinc-200">
                  {formatEthFakeETH(balances.ethFakeETH)}
                </span>
              </div>
              <div title="FakeUSD ERC20 (6 decimals)">
                <span className="text-zinc-500 mr-1">FUSD:</span>
                <span className="text-zinc-200">
                  {formatEthFakeUSD(balances.ethFakeUSD)}
                </span>
              </div>
            </div>
          </div>

          {/* Aptos balances (shown once account exists) */}
          {balances.aptosExists && (
            <>
              <div className="h-px bg-zinc-800"></div>
              <div className="flex flex-col gap-1">
                <span className="text-zinc-600 text-xs">Aptos</span>
                <div className="flex items-center gap-4">
                  <div title="Gas (APT)">
                    <span className="text-zinc-500 mr-1">APT:</span>
                    <span className="text-zinc-200">
                      {fmtApt(balances.apt)}
                    </span>
                  </div>

                  {!balances.aptosContractsDeployed ? (
                    <div className="text-zinc-500 text-xs animate-pulse">
                      Contracts Loading...
                    </div>
                  ) : (
                    <>
                      <div title="Bridged FakeETH on Aptos (8 decimals)">
                        <span className="text-zinc-500 mr-1">FETH:</span>
                        <span
                          className={
                            balances.aptosFakeEthInitialized
                              ? "text-zinc-400"
                              : "text-zinc-600"
                          }
                        >
                          {balances.aptosFakeEthInitialized
                            ? (balances.aptosFakeEth / 100_000_000).toFixed(4)
                            : "Not Init"}
                        </span>
                      </div>
                      <div title="Bridged FakeUSD on Aptos (6 decimals)">
                        <span className="text-zinc-500 mr-1">FUSD:</span>
                        <span
                          className={
                            balances.aptosFakeUsdInitialized
                              ? "text-zinc-400"
                              : "text-zinc-600"
                          }
                        >
                          {balances.aptosFakeUsdInitialized
                            ? (balances.aptosFakeUsd / 1_000_000).toFixed(2)
                            : "Not Init"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
