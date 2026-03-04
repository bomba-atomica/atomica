import { writeFileSync } from "node:fs";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type ChainConfigPayload = {
  ethereum: {
    rpcUrl: string;
    fakeETH: string;
    fakeUSD: string;
    lockBox: string;
  };
  aptos: {
    contractAddress: string;
  };
};

// Write to source/.env.local (the Vite envDir), so loadEnv() picks it up automatically.
const ENV_LOCAL_PATH = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.env.local",
);

export function writeChainConfig(payload: ChainConfigPayload): string {
  const lines = [
    `VITE_ETH_RPC_URL=${payload.ethereum.rpcUrl}`,
    `VITE_FAKE_ETH_ADDRESS=${payload.ethereum.fakeETH}`,
    `VITE_FAKE_USD_ADDRESS=${payload.ethereum.fakeUSD}`,
    `VITE_LOCK_BOX_ADDRESS=${payload.ethereum.lockBox}`,
    `VITE_CONTRACT_ADDRESS=${payload.aptos.contractAddress}`,
  ].join("\n");
  writeFileSync(ENV_LOCAL_PATH, lines, { encoding: "utf-8" });
  return ENV_LOCAL_PATH;
}
