import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
import { useContractStatuses } from "../hooks/useContractStatuses";
const ContractStatusContext = createContext({
    evmAlive: null,
    aptosAlive: null,
    evmStatus: "loading",
    aptosStatus: "loading",
});
export function ContractStatusProvider({ children, }) {
    const statuses = useContractStatuses();
    return (_jsx(ContractStatusContext.Provider, { value: statuses, children: children }));
}
export const useContractStatus = () => useContext(ContractStatusContext);
//# sourceMappingURL=ContractStatusContext.js.map