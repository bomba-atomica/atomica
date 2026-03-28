import { existsSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APTOS_ROOT_ACCOUNT_ADDRESS,
  APTOS_ROOT_ACCOUNT_PRIVATE_KEY,
  APTOS_DEPLOYER_ADDRESS,
  APTOS_DEPLOYER_PRIVATE_KEY,
} from "../../../shared/test-constants";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_CANDIDATES = [
  pathResolve(THIS_DIR, "../../config"),
  pathResolve(THIS_DIR, "../../docker-testnet/config"),
  pathResolve(process.cwd(), "../docker-testnet/config"),
  pathResolve(process.cwd(), "source/docker-testnet/config"),
  pathResolve(process.cwd(), "docker-testnet/config"),
];

function findConfigDir(): string {
  for (const candidate of CONFIG_CANDIDATES) {
    const rootKey = pathResolve(
      candidate,
      "genesis-artifacts",
      "root-account-private-keys.yaml",
    );
    if (existsSync(rootKey)) {
      return candidate;
    }
  }
  throw new Error(
    [
      "Unable to locate docker-testnet config directory.",
      "Searched in:",
      ...CONFIG_CANDIDATES.map((candidate) => `  - ${candidate}`),
      "Make sure the docker-testnet repo is checked out next to atomica-web.",
    ].join("\n"),
  );
}

export function getDockerTestnetConfigDir(): string {
  return findConfigDir();
}

export type AptosKeyPair = {
  address: string;
  privateKey: string;
  source: string;
};

export function getFunderCredentials(): AptosKeyPair {
  return {
    address: APTOS_ROOT_ACCOUNT_ADDRESS,
    privateKey: APTOS_ROOT_ACCOUNT_PRIVATE_KEY,
    source: "test-constants",
  };
}

export function getDeployerCredentials(): AptosKeyPair {
  return {
    address: APTOS_DEPLOYER_ADDRESS,
    privateKey: APTOS_DEPLOYER_PRIVATE_KEY,
    source: "test-constants",
  };
}
