import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Faucet } from "./components/Faucet";
import { SanityTest } from "./components/SanityTest";
import { AuctionCreator } from "./components/AuctionCreator";
import { AuctionBidder } from "./components/AuctionBidder";
import { AccountStatus } from "./components/AccountStatus";
import { NetworkStatus } from "./components/NetworkStatus";
import { useTokenBalances } from "./hooks/useTokenBalances";

function App() {
  const [account, setAccount] = useState<string | null>(null);
  const balances = useTokenBalances(account);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setAccount(address);
      } catch (error) {
        console.error("Error connecting wallet:", error);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  useEffect(() => {
    // Check if already connected
    const checkConnection = async () => {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          setAccount(accounts[0].address);
        }
      }
    };
    checkConnection();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-400 font-sans selection:bg-zinc-800 selection:text-white">
      <header className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950/95 sticky top-0 z-50 backdrop-blur">
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Atomica Auction</h1>
        <div className="flex items-center gap-4">
          <NetworkStatus />
          {account ? (
            <AccountStatus ethAddress={account} balances={balances} />
          ) : (
            <div className="flex items-center gap-4">
              <AccountStatus ethAddress={null} balances={balances} />
              <button
                onClick={connectWallet}
                className="bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded transition font-medium text-sm"
              >
                Connect MetaMask
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto p-8 max-w-5xl">
        {!account ? (
          <div className="text-center mt-20">
            <h2 className="text-xl text-zinc-600 font-medium">
              Connect your wallet to participate
            </h2>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            <Faucet account={account} onMintSuccess={balances.refetch} />

            {/* Sanity Test - Discreet debug utility */}
            <SanityTest account={account} />

            {/* Show disabled state if user doesn't have test tokens */}
            {balances.fakeEth === 0 || balances.fakeUsd === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 opacity-40 grayscale">
                <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-zinc-500">
                      2. Create Auction
                    </h2>
                    <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-1 rounded border border-zinc-700">
                      Disabled
                    </span>
                  </div>
                  <p className="text-zinc-600 text-sm">
                    Complete step 1 to unlock auction creation.
                    You need FAKEETH and FAKEUSD tokens.
                  </p>
                </div>
                <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-zinc-500">
                      3. Bid on Auction
                    </h2>
                    <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-1 rounded border border-zinc-700">
                      Disabled
                    </span>
                  </div>
                  <p className="text-zinc-600 text-sm">
                    Complete step 1 to unlock bidding.
                    You need FAKEUSD tokens to bid.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <AuctionCreator account={account} />
                <AuctionBidder account={account} />
              </div>
            )}
          </div>
        )}

        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4 text-zinc-200">Active Auctions</h2>
          <div className="bg-zinc-900/50 border border-zinc-900 p-8 rounded text-center text-zinc-600">
            No active auctions found.
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
