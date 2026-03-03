import { useState, useEffect } from "react";
import { aptos } from "../lib/aptos";
import { getEthereumProvider } from "../lib/ethereum/config";
import { useNetworkConfig } from "../lib/network-config-state";

export function NetworkStatus() {
  const { host } = useNetworkConfig();
  const [aptosBlock, setAptosBlock] = useState<string>("0");
  const [ethBlock, setEthBlock] = useState<string>("0");

  useEffect(() => {
    const baseDelayMs = 3000;
    const maxDelayMs = 30000;
    let cancelled = false;
    let retryCount = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const fetchStatus = async () => {
      let failed = false;
      try {
        const ledger = await aptos.getLedgerInfo();
        setAptosBlock(ledger.block_height);
      } catch {
        failed = true;
      }

      try {
        const blockNumber = await getEthereumProvider().getBlockNumber();
        setEthBlock(String(blockNumber));
      } catch {
        failed = true;
      }

      retryCount = failed ? retryCount + 1 : 0;
      const nextDelay = failed
        ? Math.min(baseDelayMs * 2 ** retryCount, maxDelayMs)
        : baseDelayMs;
      if (!cancelled) {
        timeout = setTimeout(() => void fetchStatus(), nextDelay);
      }
    };

    void fetchStatus();
    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [host]);

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
