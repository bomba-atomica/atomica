import { createContext, useContext } from "react";
export const NetworkConfigContext = createContext({
    host: "localhost",
    setHost: () => { },
});
export function useNetworkConfig() {
    return useContext(NetworkConfigContext);
}
//# sourceMappingURL=network-config-state.js.map