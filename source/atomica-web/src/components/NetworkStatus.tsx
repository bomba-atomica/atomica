import { useState, useEffect } from "react";
import { aptos } from "../lib/aptos";
import { getEthereumProvider } from "../lib/ethereum/config";

export function NetworkStatus() {
  const [aptosBlock, setAptosBlock] = useState<string>("0");
  const [ethBlock, setEthBlock] = useState<string>("0");

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const ledger = await aptos.getLedgerInfo();
        setAptosBlock(ledger.block_height);
      } catch {
        // Suppress polling errors
      }

      try {
        const blockNumber = await getEthereumProvider().getBlockNumber();
        setEthBlock(String(blockNumber));
      } catch {
        // Suppress polling errors
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-zinc-500 font-mono text-sm border border-zinc-900 rounded px-3 py-2 bg-zinc-900/50 flex items-center gap-4">
      <div>
        <span className="text-zinc-600 mr-1">ETH</span>
        <span className="text-zinc-300">{ethBlock}</span>
      </div>
      <div className="w-px h-3 bg-zinc-800" />
      <div>
        <span className="text-zinc-600 mr-1">APT</span>
        <span className="text-zinc-300">{aptosBlock}</span>
      </div>
    </div>
  );
}
