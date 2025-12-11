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
        <div className="fixed top-16 right-4 bg-gray-900/90 text-blue-400 p-4 rounded border border-blue-800 font-mono text-sm z-50 shadow-xl backdrop-blur w-64">
            <h3 className="text-white font-bold mb-2 border-b border-gray-700 pb-1">Wallet Status</h3>
            <div className="mb-2">
                <span className="text-gray-400">Connected:</span>
                {ethAddress ? (
                    <span className="text-green-400 ml-2">✓ {ethAddress.substring(0, 6)}...</span>
                ) : (
                    <span className="text-red-400 ml-2">No</span>
                )}
            </div>

            {ethAddress && (
                <div className="space-y-1">
                    <div className="flex justify-between">
                        <span className="text-gray-400">APT (Gas):</span> <span className="text-white">{balances.apt}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">FAKEETH:</span> <span className="text-white">{balances.fakeEth}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">FAKEUSD:</span> <span className="text-white">{balances.fakeUsd}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
