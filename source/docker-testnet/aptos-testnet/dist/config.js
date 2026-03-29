import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { buildAptosFullnodeUrl, getStoredHost } from "./network-host.js";
// Use safer env access that works in Node (test/ts-node) and Vite
const env = import.meta.env || process.env || {};
export const CONTRACT_ADDR = env.VITE_CONTRACT_ADDRESS || "0x1";
const config = new AptosConfig({
    network: Network.LOCAL,
    fullnode: buildAptosFullnodeUrl(getStoredHost()),
});
export let aptos = new Aptos(config);
export function setAptosInstance(instance) {
    aptos = instance;
}
