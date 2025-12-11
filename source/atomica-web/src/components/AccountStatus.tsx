import { useState, useEffect } from 'react';
import { aptos, CONTRACT_ADDR, getDerivedAddress } from '../lib/aptos';

interface AccountStatusProps {
    ethAddress: string | null;
}

export function AccountStatus({ ethAddress }: AccountStatusProps) {
    const [balances, setBalances] = useState({
        apt: "0",
        fakeEth: "0",
        fakeUsd: "0"
    });

    useEffect(() => {
        const fetchBalances = async () => {
            if (!ethAddress) {
                setBalances({ apt: "0", fakeEth: "0", fakeUsd: "0" });
                return;
            }

            try {
                const derived = await getDerivedAddress(ethAddress);
                const resources = await aptos.getAccountResources({ accountAddress: derived });

                let apt = "0";
                let fakeEth = "0";
                let fakeUsd = "0";

                for (const res of resources) {
                    if (res.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>") {
                        apt = (res.data as any).coin.value;
                    }
                    if (res.type.includes("FAKEETH")) fakeEth = (res.data as any).coin.value;
                    if (res.type.includes("FAKEUSD")) fakeUsd = (res.data as any).coin.value;
                }

                const fmt = (val: string) => (Number(val) / 100_000_000).toFixed(4);

                setBalances({
                    apt: fmt(apt),
                    fakeEth: fmt(fakeEth),
                    fakeUsd: fmt(fakeUsd)
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
        <div className="flex items-center gap-6 text-sm font-mono bg-gray-800/50 px-4 py-2 rounded border border-gray-700">
            <div className="flex items-center">
                <span className="text-gray-400 mr-2">Wallet:</span>
                {ethAddress ? (
                    <span className="text-green-400">{ethAddress.substring(0, 6)}...{ethAddress.substring(38)}</span>
                ) : (
                    <span className="text-gray-500">Not Connected</span>
                )}
            </div>

            {ethAddress && (
                <>
                    <div className="h-4 w-px bg-gray-700"></div>
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
