import { writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { getDockerTestnetConfigDir } from "../test-utils/aptos-keys";

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

const FILE_NAME = "atomica-web.yaml";

export function writeChainConfig(payload: ChainConfigPayload): string {
  const configDir = getDockerTestnetConfigDir();
  const filePath = pathResolve(configDir, FILE_NAME);
  const yaml = [
    "ethereum:",
    `  rpcUrl: ${payload.ethereum.rpcUrl}`,
    `  fakeETH: ${payload.ethereum.fakeETH}`,
    `  fakeUSD: ${payload.ethereum.fakeUSD}`,
    `  lockBox: ${payload.ethereum.lockBox}`,
    "aptos:",
    `  contractAddress: ${payload.aptos.contractAddress}`,
  ].join("\n");
  writeFileSync(filePath, yaml, { encoding: "utf-8" });
  return filePath;
}
