import {
  Faucet,
  SanityTest,
  AuctionCreator,
  AuctionBidder,
  AccountStatus,
  NetworkStatus,
  WalletProvider,
  BalancesProvider,
  ContractStatusProvider,
  AppStateProvider,
  useWallet,
} from "@atomica/atomica-web-components";

function AppShell() {
  const { account, connect } = useWallet();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-400 font-sans selection:bg-zinc-800 selection:text-white">
      <header className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950/95 sticky top-0 z-50 backdrop-blur">
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
          Atomica Auction
        </h1>
        <div className="flex items-center gap-4">
          <NetworkStatus />
          {account ? (
            <span className="text-xs font-mono text-zinc-400">
              {account.substring(0, 6)}…{account.substring(38)}
            </span>
          ) : (
            <button
              onClick={connect}
              className="bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded transition font-medium text-sm"
            >
              Connect MetaMask
            </button>
          )}
        </div>
      </header>

      <main className="container mx-auto p-8 max-w-5xl">
        <AccountStatus />

        {!account ? (
          <div className="text-center mt-20">
            <h2 className="text-xl text-zinc-600 font-medium">
              Connect your wallet to participate
            </h2>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 mt-8">
            <Faucet />
            <SanityTest />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <AuctionCreator />
              <AuctionBidder />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <WalletProvider>
        <ContractStatusProvider>
          <BalancesProvider>
            <AppShell />
          </BalancesProvider>
        </ContractStatusProvider>
      </WalletProvider>
    </AppStateProvider>
  );
}
