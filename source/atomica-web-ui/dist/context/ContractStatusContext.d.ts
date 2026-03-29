import type { ContractDeploymentStatus } from "../hooks/useContractStatuses";
interface ContractStatusContextValue {
    evmAlive: boolean | null;
    aptosAlive: boolean | null;
    evmStatus: ContractDeploymentStatus;
    aptosStatus: ContractDeploymentStatus;
}
export declare function ContractStatusProvider({ children, }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare const useContractStatus: () => ContractStatusContextValue;
export {};
//# sourceMappingURL=ContractStatusContext.d.ts.map