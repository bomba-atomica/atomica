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
    <div className="text-green-400 font-mono text-sm border border-green-800 rounded px-3 py-2 bg-black/50 flex items-center">
      <div>
        Block: <span className="text-white ml-2">{blockHeight}</span>
      </div>
    </div>
  );
}
