import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

const NODE_URL = "http://127.0.0.1:8080/v1";
// Use safer env access that works in Node (test/ts-node) and Vite
const env = (import.meta as any).env || process.env || {};
export const CONTRACT_ADDR = env.VITE_CONTRACT_ADDRESS || "0x1";

const config = new AptosConfig({ network: Network.LOCAL, fullnode: NODE_URL });
export let aptos = new Aptos(config);

export function setAptosInstance(instance: Aptos) {
    aptos = instance;
}
