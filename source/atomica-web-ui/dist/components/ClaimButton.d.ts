interface Props {
    onClaim: () => Promise<void>;
    onReclaim: () => Promise<void>;
    isWinner?: boolean;
    disabled?: boolean;
}
export declare function ClaimButton({ onClaim, onReclaim, isWinner, disabled }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ClaimButton.d.ts.map