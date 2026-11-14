import { useEffect, useState } from "react";
import {
  AuctionRevealer,
  ReleaseButton,
  SettleButton,
} from "@atomica/atomica-web-components";
import { getWindowSchedule } from "@atomica/sdk/aptos";
import { currentWindowId } from "@atomica/sdk/ethereum";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

function nowSecs(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/**
 * The trade after a window closes, for any wallet: open its bids, settle it,
 * then release its locks on Ethereum. The window is one of the launch pair.
 * It starts at the current window id (from the chain's window schedule once
 * read) and can be changed.
 */
export function TradePanel() {
  const [windowId, setWindowId] = useState(() =>
    currentWindowId(nowSecs()).toString(),
  );

  useEffect(() => {
    let cancelled = false;
    getWindowSchedule()
      .then((schedule) => {
        if (!cancelled) {
          setWindowId(currentWindowId(nowSecs(), schedule).toString());
        }
      })
      .catch(() => {
        // Keep the production schedule's window id.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parsed = /^\d+$/.test(windowId) ? BigInt(windowId) : null;

  return (
    <div
      data-testid="trade-panel"
      className="bg-zinc-900 p-5 rounded-lg border border-zinc-800 flex flex-col gap-4"
    >
      <h2 className="text-base font-semibold text-zinc-300">
        Open, settle, release
      </h2>
      <label className="flex flex-col gap-1 text-sm text-zinc-500">
        Window ID
        <input
          data-testid="trade-window-id-input"
          type="number"
          min="0"
          value={windowId}
          onChange={(e) => setWindowId(e.target.value)}
          className="bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
        />
      </label>
      {parsed !== null && (
        <div className="flex flex-col gap-4">
          <AuctionRevealer
            key={`open-${parsed}`}
            windowId={parsed}
            pairBcs={LAUNCH_PAIR_BCS}
          />
          <SettleButton windowId={parsed} pairBcs={LAUNCH_PAIR_BCS} />
          <ReleaseButton windowId={parsed} pairBcs={LAUNCH_PAIR_BCS} />
        </div>
      )}
    </div>
  );
}
