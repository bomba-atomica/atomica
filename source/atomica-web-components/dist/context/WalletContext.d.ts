interface WalletContextValue {
    account: string | null;
    connect: () => Promise<void>;
}
export declare const WalletContext: import("react").Context<WalletContextValue>;
export declare function WalletProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare const useWallet: () => WalletContextValue;
export {};
//# sourceMappingURL=WalletContext.d.ts.map