import { useTokenBalances } from "../hooks/useTokenBalances";
interface AccountStatusProps {
    ethAddress: string | null;
    balances: ReturnType<typeof useTokenBalances>;
}
export declare function AccountStatus({ ethAddress, balances }: AccountStatusProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AccountStatus.d.ts.map