interface Props {
    sellerAddress: string;
    auctionEndTime?: number;
    /** Called when a settlement is observed (either fresh or already settled). */
    onSettled?: (sellerAddress: string, clearingPrice: bigint) => void;
}
/**
 * SettleButton — calls `auction::settle` on-chain and displays the settlement
 * outcome (winner address + clearing price).
 *
 * The button is disabled when:
 * - the connected wallet is missing
 * - the auction has not yet ended (current time <= auctionEndTime)
 * - the auction is already settled on-chain
 * - a transaction is in flight
 */
export declare function SettleButton({ sellerAddress, auctionEndTime, onSettled, }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=SettleButton.d.ts.map