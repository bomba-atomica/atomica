import type { EthereumBalancesSnapshot } from "../hooks/useEthereumBalances";
import type { AptosBalancesSnapshot } from "../hooks/useAptosBalances";
interface BalancesContextValue {
    ethBalances: EthereumBalancesSnapshot;
    aptosBalances: AptosBalancesSnapshot;
    refresh: () => Promise<void>;
}
export declare function BalancesProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare const useBalances: () => BalancesContextValue;
export {};
//# sourceMappingURL=BalancesContext.d.ts.map