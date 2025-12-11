import { useState, useEffect } from 'react';
import { aptos, CONTRACT_ADDR, getDerivedAddress } from '../lib/aptos';
import { Network } from '@aptos-labs/ts-sdk';

interface NetworkStatusProps {
    ethAddress: string | null;
}

export function NetworkStatus({ ethAddress }: NetworkStatusProps) {
    const [blockHeight, setBlockHeight] = useState<string>("0");
    const [balances, setBalances] = useState({
        apt: "0",
        fakeEth: "0",
        fakeUsd: "0"
    });

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                // 1. Block Height
                const ledger = await aptos.getLedgerInfo();
                setBlockHeight(ledger.block_height);

                // 2. Balances (if user connected)
                if (ethAddress) {
                    const derived = await getDerivedAddress(ethAddress);

                    // Fetch Resources
                    const resources = await aptos.getAccountResources({ accountAddress: derived });

                    let apt = "0";
                    let fakeEth = "0";
                    let fakeUsd = "0";

                    for (const res of resources) {
                        if (res.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>") {
                            apt = (res.data as any).coin.value;
                        }
                        if (res.type === `${CONTRACT_ADDR}::FAKEETH::FAKEETH`) { // Adjust if struct is different
                            // Try to match generic wrapper or direct resource?
                            // Usually CoinStore<TYPE>
                        }
                        // Check explicit CoinStore types
                        if (res.type.includes("FAKEETH")) fakeEth = (res.data as any).coin.value;
                        if (res.type.includes("FAKEUSD")) fakeUsd = (res.data as any).coin.value;
                    }

                    // Simple formatting (assuming 8 decimals)
                    const fmt = (val: string) => (Number(val) / 100_000_000).toFixed(4);

                    setBalances({
                        apt: fmt(apt),
                        fakeEth: fmt(fakeEth),
                        fakeUsd: fmt(fakeUsd)
                    });
                }
            } catch (e) {
                console.error("Status Poll Error", e);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 3000); // Poll every 3s
        return () => clearInterval(interval);
    }, [ethAddress]);

    return (
        <div className="fixed top-4 right-4 bg-black/80 text-green-400 p-4 rounded border border-green-800 font-mono text-sm z-50 shadow-xl backdrop-blur">
            <div className="mb-2">Block: <span className="text-white">{blockHeight}</span></div>
            {ethAddress && (
                <div className="space-y-1 border-t border-gray-700 pt-2">
                    <div className="flex justify-between gap-4">
                        <span>APT:</span> <span className="text-white">{balances.apt}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span>ETH:</span> <span className="text-white">{balances.fakeEth}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span>USD:</span> <span className="text-white">{balances.fakeUsd}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
