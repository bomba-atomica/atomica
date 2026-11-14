import { useWallet } from "../../context/WalletContext";
import { useBalances } from "../../context/BalancesContext";
import { useSellFlow } from "../../hooks/useSellFlow";
import { StepIndicator } from "./StepIndicator";
import { Step1Connect } from "./steps/Step1Connect";
import { Step2Lock } from "./steps/Step2Lock";
import { Step3Confirm } from "./steps/Step3Confirm";
import { Step4Proof } from "./steps/Step4Proof";
import { Step5Submit } from "./steps/Step5Submit";
import { Step7Auction } from "./steps/Step7Auction";
import { Step8Monitor } from "./steps/Step8Monitor";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

/**
 * SellFlow — the seller's path: lock FakeETH, prove the lock on Aptos,
 * create the auction, then monitor it. The monitoring step carries the trade
 * to its end: open, settle and release.
 */
export function SellFlow() {
  const { account, connect } = useWallet();
  const { ethBalances } = useBalances();
  const flow = useSellFlow(account);

  return (
    <div className="bg-zinc-900 p-5 rounded-lg border border-zinc-800 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-300">Sell</h2>
        {account && flow.step !== "connect" && flow.step !== "lock" && (
          <button
            onClick={flow.reset}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Step indicator */}
      {account && <StepIndicator current={flow.step} />}

      {/* Active step panel */}
      {flow.step === "connect" || !account ? (
        <Step1Connect
          onConnect={connect}
          fakeEthBalance={ethBalances?.ethFakeETH}
          account={account}
        />
      ) : flow.step === "lock" ? (
        <Step2Lock
          onLock={flow.lockEth}
          fakeEthBalance={ethBalances?.ethFakeETH}
          loading={flow.loading}
          error={flow.error}
          minSellerLockAmount={flow.minSellerLockAmount}
        />
      ) : flow.step === "confirming" ? (
        <Step3Confirm txHash={flow.txHash} lockBlock={flow.lockBlock} />
      ) : flow.step === "generating-proof" ? (
        <Step4Proof
          proof={flow.proof}
          loading={flow.loading}
          error={flow.error}
          onGenerate={flow.generateProof}
        />
      ) : flow.step === "submitting-proof" ? (
        <Step5Submit
          loading={flow.loading}
          error={flow.error}
          onSubmit={flow.submitProof}
        />
      ) : flow.step === "creating-auction" ? (
        <Step7Auction
          loading={flow.loading}
          error={flow.error}
          amount={flow.amount}
          onCreateAuction={flow.createAuction}
          unlockTime={flow.unlockTime}
        />
      ) : (
        <Step8Monitor
          amount={flow.amount}
          auctionEndTime={flow.auctionEndTime}
          unlockTime={flow.unlockTime}
          windowId={flow.windowId ?? null}
          // useSellFlow binds every lock to the launch pair.
          pairBcs={LAUNCH_PAIR_BCS}
          sellerAddress={account}
          onCancelAndUnlock={flow.cancelAndUnlock}
          loading={flow.loading}
          error={flow.error}
        />
      )}

      {/* No pre-auction cancel: LockBox releases a lock only on an Aptos
          auction outcome, so a lock that never reached an auction stays
          frozen until a recovery path is decided (architecture §3.1). */}
    </div>
  );
}
