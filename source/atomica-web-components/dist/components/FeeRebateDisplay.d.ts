/**
 * Props for {@link FeeRebateDisplay}.
 *
 * @see docs/specifications/prd.md
 */
interface Props {
    /** Rebate amount in USD micro-units (6 decimals). Positive = rebate. */
    rebateAmount?: bigint;
    /** Fee amount in USD micro-units (6 decimals). Positive = fee charged. */
    feeAmount?: bigint;
}
/**
 * Displays the post-settlement fee and rebate for the connected bidder.
 *
 * Renders two rows — Rebate and Fee — using amounts in USD micro-units
 * (6 decimals). Omits a row when its value is `undefined`. In the Demo
 * phase the fee is always 0; the rebate is `bidPrice - clearingPrice`.
 *
 * Driven by {@link useFeeRebate} in the parent component.
 *
 * @see docs/specifications/prd.md
 */
export declare function FeeRebateDisplay({ rebateAmount, feeAmount }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=FeeRebateDisplay.d.ts.map