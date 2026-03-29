interface Props {
    onLock: (amount: bigint, minPrice: bigint) => Promise<void>;
    fakeEthBalance?: bigint;
    loading: boolean;
    error?: string;
}
export declare function Step2Lock({ onLock, fakeEthBalance, loading, error }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Step2Lock.d.ts.map