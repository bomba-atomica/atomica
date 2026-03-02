/**
 * TestnetSelector
 *
 * Lets the user pick "Local" (localhost) or enter a custom IP / hostname for a
 * remote testnet. The selection is persisted to localStorage and applied
 * immediately — no page reload required.
 */

import { useState, useRef, useEffect } from "react";
import { useNetworkConfig } from "../lib/network-config-context";

export function TestnetSelector() {
  const { host, setHost } = useNetworkConfig();
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState(
    host === "localhost" ? "" : host,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  const isLocal = host === "localhost";

  // Close panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const applyCustom = () => {
    const h = customInput.trim();
    if (h) {
      setHost(h);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-mono border border-zinc-800 rounded px-2 py-1.5 bg-zinc-900/60 hover:border-zinc-700 transition-colors"
        title="Testnet host"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${isLocal ? "bg-emerald-500" : "bg-amber-400"}`}
        />
        <span className="text-zinc-400">{host}</span>
        <svg
          className={`w-3 h-3 text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 p-3 flex flex-col gap-2">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-1">
            Testnet Host
          </p>

          {/* Local preset */}
          <button
            onClick={() => {
              setHost("localhost");
              setCustomInput("");
              setOpen(false);
            }}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded transition-colors w-full text-left ${
              isLocal
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800/60"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            Local (localhost)
          </button>

          {/* Custom IP */}
          <div className="flex gap-1.5 mt-1">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyCustom()}
              placeholder="192.168.1.100"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={applyCustom}
              disabled={!customInput.trim()}
              className="px-2 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 rounded transition-colors"
            >
              Use
            </button>
          </div>

          <p className="text-xs text-zinc-600 mt-1">
            Ports used: ETH :8545, Aptos :8080
          </p>
        </div>
      )}
    </div>
  );
}
