import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { buildAptosFullnodeUrl, getStoredHost } from "../network-host.js";

// Use safer env access that works in Node (test/ts-node) and Vite
const env =
  (import.meta as { env?: Record<string, string> }).env || process.env || {};
export const CONTRACT_ADDR = env.VITE_CONTRACT_ADDRESS || "0x1";

// SCOUT(#235) EDIT: this one client is built from network-host, not from ChainConfig, and in a browser it is always the same-origin /aptos-api proxy.
const config = new AptosConfig({
  network: Network.LOCAL,
  fullnode: buildAptosFullnodeUrl(getStoredHost()),
});
export let aptos = new Aptos(config);

export function setAptosInstance(instance: Aptos) {
  aptos = instance;
}

// SCOUT(#235) ADD: Aptos clients for the extra endpoints of the chain configuration.
export function getExtraAptosClients(): Aptos[] {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#235) getExtraAptosClients");
}
