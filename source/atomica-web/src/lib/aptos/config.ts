import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { buildAptosFullnodeUrl, getStoredHost } from "../network-host";
import { APTOS_DEFAULT_DEPLOYER_ADDRESS } from "./constants";

// Use safer env access that works in Node (test/ts-node) and Vite
const env =
  (import.meta as { env?: Record<string, string> }).env || process.env || {};
export const CONTRACT_ADDR =
  env.VITE_CONTRACT_ADDRESS || APTOS_DEFAULT_DEPLOYER_ADDRESS;

const config = new AptosConfig({
  network: Network.LOCAL,
  fullnode: buildAptosFullnodeUrl(getStoredHost()),
});
export let aptos = new Aptos(config);

export function setAptosInstance(instance: Aptos) {
  aptos = instance;
}
