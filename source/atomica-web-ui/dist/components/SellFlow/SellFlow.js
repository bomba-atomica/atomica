import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
export function SellFlow() {
    const { account, connect } = useWallet();
    const { ethBalances } = useBalances();
    const flow = useSellFlow(account);
    const showCancelButton = flow.unlockTime !== undefined &&
        flow.unlockTime > 0 &&
        flow.step !== "connect" &&
        flow.step !== "monitoring";
    return (_jsxs("div", { className: "bg-zinc-900 p-5 rounded-lg border border-zinc-800 flex flex-col gap-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-base font-semibold text-zinc-300", children: "Sell" }), account && flow.step !== "connect" && flow.step !== "lock" && (_jsx("button", { onClick: flow.reset, className: "text-xs text-zinc-600 hover:text-zinc-400 transition-colors", children: "Reset" }))] }), account && _jsx(StepIndicator, { current: flow.step }), flow.step === "connect" || !account ? (_jsx(Step1Connect, { onConnect: connect, fakeEthBalance: ethBalances?.ethFakeETH, account: account })) : flow.step === "lock" ? (_jsx(Step2Lock, { onLock: flow.lockEth, fakeEthBalance: ethBalances?.ethFakeETH, loading: flow.loading, error: flow.error })) : flow.step === "confirming" ? (_jsx(Step3Confirm, { txHash: flow.txHash, lockBlock: flow.lockBlock })) : flow.step === "generating-proof" ? (_jsx(Step4Proof, { proof: flow.proof, loading: flow.loading, error: flow.error, onGenerate: flow.generateProof })) : flow.step === "submitting-proof" ? (_jsx(Step5Submit, { loading: flow.loading, error: flow.error, onSubmit: flow.submitProof })) : flow.step === "creating-auction" ? (_jsx(Step7Auction, { loading: flow.loading, error: flow.error, amount: flow.amount, minPrice: flow.minPrice, onCreateAuction: flow.createAuction, unlockTime: flow.unlockTime })) : (_jsx(Step8Monitor, { amount: flow.amount, minPrice: flow.minPrice, auctionEndTime: flow.auctionEndTime, unlockTime: flow.unlockTime, sellerAddress: account, onCancelAndUnlock: flow.cancelAndUnlock, loading: flow.loading, error: flow.error })), showCancelButton && flow.step !== "monitoring" && (_jsx("div", { className: "border-t border-zinc-800 pt-3", children: _jsx("button", { onClick: flow.cancelAndUnlock, disabled: flow.loading, className: "w-full py-1.5 rounded text-xs font-semibold border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors", children: "Cancel & Unlock Tokens" }) }))] }));
}
//# sourceMappingURL=SellFlow.js.map