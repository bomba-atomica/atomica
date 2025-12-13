import { useState, useEffect } from "react";
import { getDerivedAddress, CONTRACT_ADDR } from "../lib/aptos";

interface AccountStatusProps {
  ethAddress: string | null;
}

export function AccountStatus({ ethAddress }: AccountStatusProps) {
  const [balances, setBalances] = useState({
    apt: "0",
    fakeEth: "0",
    fakeUsd: "0",
  });
  const [aptosAddress, setAptosAddress] = useState<string | null>(null);

  useEffect(() => {
    const fetchBalances = async () => {
      if (!ethAddress) {
        setBalances({ apt: "0", fakeEth: "0", fakeUsd: "0" });
        setAptosAddress(null);
        return;
      }

      try {
        const derived = await getDerivedAddress(ethAddress);
        const derivedStr = derived.toString();
        setAptosAddress(derivedStr);

        // Helper to fetch balance via View function (supports Coin and FA)
        const getBalance = async (coinType: string) => {
          try {
            const NODE_URL = "http://127.0.0.1:8080/v1";
            const res = await fetch(`${NODE_URL}/view`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                function: "0x1::coin::balance",
                type_arguments: [coinType],
                arguments: [derivedStr],
              }),
            });
            if (!res.ok) return "0";
            const data = await res.json();
            return Array.isArray(data) ? data[0] : "0";
          } catch (e) {
            console.error(`Failed to fetch balance for ${coinType}`, e);
            return "0";
          }
        };

        // Fetch balances in parallel
        const [apt, fakeEth, fakeUsd] = await Promise.all([
          getBalance("0x1::aptos_coin::AptosCoin"),
          getBalance(`${CONTRACT_ADDR}::FAKEETH::FAKEETH`),
          getBalance(`${CONTRACT_ADDR}::FAKEUSD::FAKEUSD`),
        ]);

        const fmt = (val: string) => (Number(val) / 100_000_000).toFixed(4);

        setBalances({
          apt: fmt(apt),
          fakeEth: fmt(fakeEth),
          fakeUsd: fmt(fakeUsd),
        });
      } catch (e) {
        console.error("Balance Fetch Error", e);
      }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 3000);
    return () => clearInterval(interval);
  }, [ethAddress]);

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
          </>
        )}
      </div>

      {/* Balances */}
      {ethAddress && (
        <>
          <div className="h-px bg-gray-700"></div>
          <div className="flex items-center gap-4">
            <div title="Gas (APT)">
              <span className="text-gray-400 mr-1">APT:</span>
              <span className="text-white">{balances.apt}</span>
            </div>
            <div title="Fake ETH">
              <span className="text-gray-400 mr-1">ETH:</span>
              <span className="text-white">{balances.fakeEth}</span>
            </div>
            <div title="Fake USD">
              <span className="text-gray-400 mr-1">USD:</span>
              <span className="text-white">{balances.fakeUsd}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
