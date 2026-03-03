import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { buildAptosFullnodeUrl, getStoredHost } from "../network-host";
import { getChainConfig } from "../chain-config.ts";

const { aptos: chainConfig } = getChainConfig();
export const CONTRACT_ADDR = chainConfig.contractAddress;

const fullnodeUrl = chainConfig.aptosUrl.endsWith("/v1")
  ? chainConfig.aptosUrl
  : chainConfig.aptosUrl.replace(/\/?$/, "/v1");

const config = new AptosConfig({
  network: Network.LOCAL,
  fullnode: fullnodeUrl || buildAptosFullnodeUrl(getStoredHost()),
});
export let aptos = new Aptos(config);

export function setAptosInstance(instance: Aptos) {
  aptos = instance;
}
