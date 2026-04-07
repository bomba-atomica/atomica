import { useContractStatus } from "../context/ContractStatusContext";
import type { ContractDeploymentStatus } from "../hooks/useContractStatuses";

const STATUS_COLORS: Record<ContractDeploymentStatus, string> = {
  loading: "text-amber-400",
  ready: "text-emerald-400",
  missing: "text-rose-400",
};

const STATUS_LABELS: Record<ContractDeploymentStatus, string> = {
  ready: "deployed",
  loading: "checking…",
  missing: "unavailable",
};

function ChainStatus({
  chain,
  status,
}: {
  chain: string;
  status: ContractDeploymentStatus;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-zinc-600">{chain}</span>
      <span className={`font-mono text-xs ${STATUS_COLORS[status]}`}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  );
}

export function ContractStatus() {
  const { evmStatus, aptosStatus } = useContractStatus();

  return (
    <div className="text-zinc-500 font-mono text-sm border border-zinc-900 rounded px-3 py-2 bg-zinc-900/50 flex items-center gap-4">
      <ChainStatus chain="ETH" status={evmStatus} />
      <div className="w-px h-3 bg-zinc-800" />
      <ChainStatus chain="APT" status={aptosStatus} />
    </div>
  );
}
