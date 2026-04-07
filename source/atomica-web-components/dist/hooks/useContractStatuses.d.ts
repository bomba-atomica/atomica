export type ContractDeploymentStatus = "loading" | "ready" | "missing";
export declare function useContractStatuses(): {
    evmAlive: boolean | null;
    aptosAlive: boolean | null;
    evmStatus: ContractDeploymentStatus;
    aptosStatus: ContractDeploymentStatus;
};
//# sourceMappingURL=useContractStatuses.d.ts.map