interface Props {
  onConnect: () => Promise<void>;
  fakeEthBalance?: bigint;
  account?: string | null;
}

export function Step1Connect({ onConnect, fakeEthBalance, account }: Props) {
  const hasBalance = fakeEthBalance !== undefined && fakeEthBalance > 0n;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Connect your MetaMask wallet to begin. You'll need FakeETH to lock in
        the LockBox.
      </p>

      {account && (
        <div
          data-testid="connected-address"
          className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs font-mono text-zinc-300 truncate"
        >
          {account}
        </div>
      )}

      {fakeEthBalance !== undefined && (
        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
          <span className="text-zinc-500">FakeETH balance: </span>
          <span className={hasBalance ? "text-zinc-200" : "text-amber-400"}>
            {(Number(fakeEthBalance) / 1e18).toFixed(4)} FETH
          </span>
          {!hasBalance && (
            <span className="ml-2 text-xs text-zinc-600">
              — visit Settings to mint
            </span>
          )}
        </div>
      )}

      <button
        data-testid="connect-metamask-button"
        onClick={onConnect}
        className="w-full py-2 rounded bg-zinc-100 hover:bg-white text-zinc-900 font-semibold transition-colors"
      >
        Connect MetaMask
      </button>
    </div>
  );
}
