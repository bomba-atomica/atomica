/**
 * A single auction entry in the bid history table.
 *
 * Populated by {@link useBidHistory} and stored in localStorage so it
 * survives page reloads.
 */
export interface BidHistoryEntry {
  /** Seller address used as the auction identifier. */
  auctionId: string;
  /** Clearing price in USD micro-units (6 decimals). */
  clearingPrice: bigint;
  /** Unix timestamp (seconds) when the auction was settled. */
  settledAt: number;
  /** Optional per-bid breakdown (address, price, won flag). */
  bids?: Array<{
    address: string;
    price: bigint;
    won: boolean;
  }>;
}

/**
 * Props for {@link BidHistory}.
 *
 * @see docs/specifications/prd.md
 */
interface Props {
  /** Sorted (newest-first) bid history entries to render. */
  entries?: BidHistoryEntry[];
}

function formatUsd(amount: bigint): string {
  return (Number(amount) / 1e6).toFixed(2);
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

/**
 * Table displaying the user's settled auction history.
 *
 * Renders one row per {@link BidHistoryEntry} with auction ID, clearing
 * price (formatted as USD), and settlement timestamp. Shows an empty-state
 * message when `entries` is empty.
 *
 * @see docs/specifications/prd.md
 */
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
