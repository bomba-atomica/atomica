/**
 * useSellFlow — 7-step sell flow state machine
 *
 * Manages the full seller journey:
 *   connect → lock → confirming → generating-proof → submitting-proof
 *   → creating-auction → monitoring
 *
 * State is persisted to localStorage keyed by wallet address so the user
 * can resume after a page reload.
 */
import type { LockedBalanceProof } from "../lib/ethereum/proofs/generator";
export type SellFlowStep = "connect" | "lock" | "confirming" | "generating-proof" | "submitting-proof" | "creating-auction" | "monitoring";
export interface SellFlowState {
    step: SellFlowStep;
    txHash?: string;
    lockBlock?: number;
    blockConfirmed: boolean;
    proof?: LockedBalanceProof;
    lockId?: string;
    auctionEndTime?: number;
    minPrice?: bigint;
    amount?: bigint;
    unlockTime?: number;
    error?: string;
    loading: boolean;
}
export interface SellFlowActions {
    /** Step 2: approve + lock FakeETH. amount and minPrice in wei. */
    lockEth: (amount: bigint, minPrice: bigint) => Promise<void>;
    /** Step 4: generate storage proof for the confirmed lock block */
    generateProof: () => Promise<void>;
    /** Step 5: submit proof to Aptos → creates LockReceipt */
    submitProof: () => Promise<void>;
    /** Step 6: create auction on Aptos — consumes the LockReceipt */
    createAuction: () => Promise<void>;
    /** Cancel & unlock — only callable when unlockTime has passed */
    cancelAndUnlock: () => Promise<void>;
    /** Hard reset — clears localStorage and returns to connect step */
    reset: () => void;
}
export declare function useSellFlow(account: string | null): SellFlowState & SellFlowActions;
//# sourceMappingURL=useSellFlow.d.ts.map