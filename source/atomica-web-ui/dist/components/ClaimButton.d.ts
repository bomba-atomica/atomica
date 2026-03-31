interface Props {
    sellerAddress: string;
}
/**
 * ClaimButton — Demo-phase winner payout via direct `fake_eth::mint`.
 *
 * On mount, queries `get_settlement(sellerAddress)` to determine the winner.
 * Compares the winner against the current user's derived Aptos address.
 * If the current user is the winner, enables the Claim button which calls
 * `fake_eth::mint` via SIWE to self-mint the clearing price as FakeETH.
 *
 * Reclaim is not applicable in Demo phase (no bidder collateral on Aptos side).
 */
export declare function ClaimButton({ sellerAddress }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ClaimButton.d.ts.map