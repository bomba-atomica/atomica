export interface BidHistoryEntry {
  auctionId: string;
  clearingPrice: bigint;
  settledAt: number;
  bids?: Array<{
    address: string;
    price: bigint;
    won: boolean;
  }>;
}

interface Props {
  entries?: BidHistoryEntry[];
}

function formatUsd(amount: bigint): string {
  return (Number(amount) / 1e6).toFixed(2);
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function BidHistory({ entries = [] }: Props) {
  return (
    <div
      data-testid="bid-history-table"
      className="rounded border border-zinc-800 overflow-hidden"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900">
            <th className="text-left py-2 px-3 text-xs font-semibold text-zinc-500">
              Auction ID
            </th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-500">
              Clearing Price
            </th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-500">
              Settled At
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td
                colSpan={3}
                className="text-center py-4 text-xs text-zinc-600"
              >
                No auctions yet
              </td>
            </tr>
          )}
          {entries.map((entry) => (
            <tr
              key={entry.auctionId}
              data-testid="bid-history-row"
              className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
            >
              <td className="py-2 px-3 font-mono text-xs text-zinc-400 truncate max-w-[120px]">
                {entry.auctionId}
              </td>
              <td className="py-2 px-3 text-right font-mono text-xs text-zinc-200">
                ${formatUsd(entry.clearingPrice)}
              </td>
              <td className="py-2 px-3 text-right text-xs text-zinc-500">
                {formatTimestamp(entry.settledAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
