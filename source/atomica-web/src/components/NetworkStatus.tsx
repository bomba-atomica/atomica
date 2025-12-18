import { useState, useEffect } from "react";
import { aptos } from "../lib/aptos";

export function NetworkStatus() {
  const [blockHeight, setBlockHeight] = useState<string>("0");

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const ledger = await aptos.getLedgerInfo();
        setBlockHeight(ledger.block_height);
      } catch (e) {
        // Suppress polling errors
        // console.error("Status Poll Error", e);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-zinc-500 font-mono text-sm border border-zinc-900 rounded px-3 py-2 bg-zinc-900/50 flex items-center">
      <div>
        Block: <span className="text-zinc-300 ml-2">{blockHeight}</span>
      </div>
    </div>
  );
}
