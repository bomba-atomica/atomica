import { useEffect, useState } from "react";
import { useNetworkConfig } from "../network/network-config-state";
import {
  checkAptosAlive,
  checkAptosContracts,
  checkEthereumAlive,
  checkEVMContracts,
} from "@atomica/sdk/contract-check";

export type ContractDeploymentStatus = "loading" | "ready" | "missing";

export function useContractStatuses() {
  const { host } = useNetworkConfig();
  const [evmAlive, setEvmAlive] = useState<boolean | null>(null);
  const [aptosAlive, setAptosAlive] = useState<boolean | null>(null);
  const [evmStatus, setEvmStatus] =
    useState<ContractDeploymentStatus>("loading");
  const [aptosStatus, setAptosStatus] =
    useState<ContractDeploymentStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    let evmTimer: ReturnType<typeof setTimeout> | null = null;
    let aptosTimer: ReturnType<typeof setTimeout> | null = null;

    const pollEvm = async (initial = false) => {
      if (cancelled) return;
      if (initial) setEvmStatus("loading");

      const alive = await checkEthereumAlive();
      if (cancelled) return;
      setEvmAlive(alive);

      if (alive) {
        const ready = await checkEVMContracts();
        if (cancelled) return;
        setEvmStatus(ready ? "ready" : "missing");
      } else {
        setEvmStatus("missing");
      }

      evmTimer = setTimeout(() => void pollEvm(), 5000);
    };

    const pollAptos = async (initial = false) => {
      if (cancelled) return;
      if (initial) setAptosStatus("loading");

      const alive = await checkAptosAlive();
      if (cancelled) return;
      setAptosAlive(alive);

      if (alive) {
        const ready = await checkAptosContracts();
        if (cancelled) return;
        setAptosStatus(ready ? "ready" : "missing");
      } else {
        setAptosStatus("missing");
      }

      aptosTimer = setTimeout(() => void pollAptos(), 5000);
    };

    void pollEvm(true);
    void pollAptos(true);

    return () => {
      cancelled = true;
      if (evmTimer) clearTimeout(evmTimer);
      if (aptosTimer) clearTimeout(aptosTimer);
    };
  }, [host]);

  return { evmAlive, aptosAlive, evmStatus, aptosStatus };
}
