import { createContext, useContext } from "react";

export type NetworkConfigValue = {
  host: string;
  setHost: (host: string) => void;
};

export const NetworkConfigContext = createContext<NetworkConfigValue>({
  host: "localhost",
  setHost: () => {},
});

export function useNetworkConfig() {
  return useContext(NetworkConfigContext);
}
