import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { buildAptosFullnodeUrl, getStoredHost } from "../network-host";
import { getChainConfig } from "./chain-config.ts";

const { aptos: chainConfig } = getChainConfig();
export const CONTRACT_ADDR = chainConfig.contractAddress;

const config = new AptosConfig({
  network: Network.LOCAL,
  fullnode: buildAptosFullnodeUrl(getStoredHost()),
});
export let aptos = new Aptos(config);

export function setAptosInstance(instance: Aptos) {
  aptos = instance;
}
