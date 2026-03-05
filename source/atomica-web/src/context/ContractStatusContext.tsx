import { createContext, useContext } from "react";
import { useContractStatuses } from "../hooks/useContractStatuses";
import type { ContractDeploymentStatus } from "../hooks/useContractStatuses";

interface ContractStatusContextValue {
  evmAlive: boolean | null;
  aptosAlive: boolean | null;
  evmStatus: ContractDeploymentStatus;
  aptosStatus: ContractDeploymentStatus;
}

const ContractStatusContext = createContext<ContractStatusContextValue>({
  evmAlive: null,
  aptosAlive: null,
  evmStatus: "loading",
  aptosStatus: "loading",
});

export function ContractStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const statuses = useContractStatuses();
  return (
    <ContractStatusContext.Provider value={statuses}>
      {children}
    </ContractStatusContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useContractStatus = () => useContext(ContractStatusContext);
