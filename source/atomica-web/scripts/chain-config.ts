import { writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { fileURLToPath } from "url";

export type ChainConfigPayload = {
  ethereum: {
    rpcUrl: string;
    fakeETH: string;
    fakeUSD: string;
    lockBox: string;
  };
  aptos: {
    contractAddress: string;
    aptosUrl?: string;
  };
};

// envDir in vite.config.ts is "../" (source/), so .env.local goes there
const SOURCE_DIR = pathResolve(fileURLToPath(import.meta.url), "../../..");
const FILE_NAME = ".env.local";

export function writeChainConfig(payload: ChainConfigPayload): string {
  const filePath = pathResolve(SOURCE_DIR, FILE_NAME);
  const lines = [
    `VITE_ETH_RPC_URL=${payload.ethereum.rpcUrl}`,
    `VITE_FAKE_ETH_ADDRESS=${payload.ethereum.fakeETH}`,
    `VITE_FAKE_USD_ADDRESS=${payload.ethereum.fakeUSD}`,
    `VITE_LOCK_BOX_ADDRESS=${payload.ethereum.lockBox}`,
    `VITE_CONTRACT_ADDRESS=${payload.aptos.contractAddress}`,
    ...(payload.aptos.aptosUrl
      ? [`VITE_APTOS_URL=${payload.aptos.aptosUrl}`]
      : []),
  ];
  writeFileSync(filePath, lines.join("\n") + "\n", { encoding: "utf-8" });
  return filePath;
}
