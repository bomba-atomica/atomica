import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { getChainConfig } from "../chain-config.js";
import {
  buildAptosFullnodeUrl,
  buildExtraAptosFullnodeUrls,
  getStoredHost,
} from "../network-host.js";

// Use safer env access that works in Node (test/ts-node) and Vite
const env =
  (import.meta as { env?: Record<string, string> }).env || process.env || {};
export const CONTRACT_ADDR = env.VITE_CONTRACT_ADDRESS || "0x1";

// The primary client is built from network-host, not from ChainConfig. In a
// browser it is always the same-origin /aptos-api proxy.
const config = new AptosConfig({
  network: Network.LOCAL,
  fullnode: buildAptosFullnodeUrl(getStoredHost()),
});
export let aptos = new Aptos(config);

export function setAptosInstance(instance: Aptos) {
  aptos = instance;
}

/**
 * One Aptos client per extra fullnode URL of the chain configuration
 * (`ChainConfig.aptos.extraFullnodeUrls`), in list order. In a browser each
 * client goes through its own `/aptos-api-<n>` proxy path. Empty when no extra
 * endpoint is configured.
 */
export function getExtraAptosClients(): Aptos[] {
  const urls = getChainConfig().aptos.extraFullnodeUrls ?? [];
  return buildExtraAptosFullnodeUrls(urls).map(
    (fullnode) =>
      new Aptos(new AptosConfig({ network: Network.LOCAL, fullnode })),
  );
}
