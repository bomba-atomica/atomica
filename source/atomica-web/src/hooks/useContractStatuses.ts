import { useEffect, useState } from "react";
import { useNetworkConfig } from "../lib/network-config-state";
import { checkAptosContracts, checkEVMContracts } from "../lib/contract-check";

export type ContractDeploymentStatus = "loading" | "ready" | "missing";

export function useContractStatuses() {
  const { host } = useNetworkConfig();
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
      try {
        const ready = await checkEVMContracts();
        if (cancelled) return;
        setEvmStatus(ready ? "ready" : "missing");
        if (!ready) {
          evmTimer = setTimeout(() => void pollEvm(), 5000);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("Ethereum contract check failed", error);
        setEvmStatus("missing");
        evmTimer = setTimeout(() => void pollEvm(), 5000);
      }
    };

    const pollAptos = async (initial = false) => {
      if (cancelled) return;
      if (initial) setAptosStatus("loading");
      try {
        const ready = await checkAptosContracts();
        if (cancelled) return;
        setAptosStatus(ready ? "ready" : "missing");
        if (!ready) {
          aptosTimer = setTimeout(() => void pollAptos(), 5000);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("Aptos contract check failed", error);
        setAptosStatus("missing");
        aptosTimer = setTimeout(() => void pollAptos(), 5000);
      }
    };

    void pollEvm(true);
    void pollAptos(true);

    return () => {
      cancelled = true;
      if (evmTimer) clearTimeout(evmTimer);
      if (aptosTimer) clearTimeout(aptosTimer);
    };
  }, [host]);

  return {
    evmStatus,
    aptosStatus,
  };
}
