/**
 * @file AppSettings.tsx
 * @description Settings panel for network endpoints and polling configuration.
 *
 * Canonical doc: docs/architecture/v0-architecture.md §1 (package layout).
 *
 * Renders:
 *   - Ethereum RPC endpoint input (persists across reload via AppStateProvider).
 *   - Aptos RPC endpoint input (persists across reload via AppStateProvider).
 *   - Polling interval selector.
 *   - Reset-to-defaults button.
 *   - `TestnetSelector` origin indicator.
 *
 * All changes are dispatched to `AppStateProvider` which persists them via
 * `saveConfig` automatically. No local state is maintained here.
 */

import { useState } from "react";
import { useAppState } from "../state/app-state";
import { resetConfig } from "../state/app-config";
import { TestnetSelector } from "./TestnetSelector";

const POLLING_OPTIONS = [
  { label: "1 second", value: 1000 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
];

export function AppSettings() {
  const { state, dispatch } = useAppState();
  const { network, polling } = state;

  const [ethRpc, setEthRpc] = useState(network.ethereumRpc);
  const [aptosRpc, setAptosRpc] = useState(network.aptosRpc);

  const applyEthRpc = () => {
    dispatch({
      type: "NETWORK_CONFIG_UPDATED",
      patch: { ethereumRpc: ethRpc },
    });
  };

  const applyAptosRpc = () => {
    dispatch({
      type: "NETWORK_CONFIG_UPDATED",
      patch: { aptosRpc: aptosRpc },
    });
  };

  const handleReset = () => {
    const defaults = resetConfig();
    setEthRpc(defaults.ethereumRpc);
    setAptosRpc(defaults.aptosRpc);
    dispatch({
      type: "NETWORK_CONFIG_UPDATED",
      patch: {
        ethereumRpc: defaults.ethereumRpc,
        aptosRpc: defaults.aptosRpc,
      },
    });
    dispatch({
      type: "POLLING_SET_INTERVAL",
      interval: defaults.pollingInterval,
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-widest">
          Settings
        </h2>
        <TestnetSelector />
      </div>

      {/* Ethereum RPC */}
      <div className="space-y-1">
        <label className="block text-xs text-zinc-400 font-medium">
          Ethereum RPC endpoint
        </label>
        <div className="flex gap-2">
          <input
            data-testid="eth-rpc-input"
            type="text"
            value={ethRpc}
            onChange={(e) => setEthRpc(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
            placeholder="http://localhost:8545"
          />
          <button
            onClick={applyEthRpc}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded text-sm transition"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Aptos RPC */}
      <div className="space-y-1">
        <label className="block text-xs text-zinc-400 font-medium">
          Aptos RPC endpoint
        </label>
        <div className="flex gap-2">
          <input
            data-testid="aptos-rpc-input"
            type="text"
            value={aptosRpc}
            onChange={(e) => setAptosRpc(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
            placeholder="http://localhost:8080/v1"
          />
          <button
            onClick={applyAptosRpc}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded text-sm transition"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Polling interval */}
      <div className="space-y-1">
        <label className="block text-xs text-zinc-400 font-medium">
          Polling interval
        </label>
        <select
          data-testid="polling-interval-select"
          value={polling.interval}
          onChange={(e) =>
            dispatch({
              type: "POLLING_SET_INTERVAL",
              interval: Number(e.target.value),
            })
          }
          className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
        >
          {POLLING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Reset */}
      <div className="pt-2 border-t border-zinc-800">
        <button
          data-testid="reset-settings-btn"
          onClick={handleReset}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
