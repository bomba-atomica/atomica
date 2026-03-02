import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AptosKeyPair = {
  address: string;
  privateKey: string;
  source: string;
};

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

const CONFIG_DIR = findConfigDir();

export function getDockerTestnetConfigDir(): string {
  return CONFIG_DIR;
}

function parseHexField(content: string, field: string): string | null {
  const regex = new RegExp(`${field}:\\s*"?0x?([a-fA-F0-9]+)"?`, "i");
  const match = content.match(regex);
  if (!match) {
    return null;
  }
  return `0x${match[1].toLowerCase()}`;
}

function readYamlKey(filePath: string): AptosKeyPair {
  const content = readFileSync(filePath, "utf-8");
  const address = parseHexField(content, "account_address");
  const privateKey = parseHexField(content, "account_private_key");
  if (!address || !privateKey) {
    throw new Error(`Failed to parse key material from ${filePath}`);
  }
  return { address, privateKey, source: filePath };
}

const GENESIS_KEYS_PATH = pathResolve(
  CONFIG_DIR,
  "genesis-artifacts",
  "root-account-private-keys.yaml",
);

let cachedFunder: AptosKeyPair | null = null;
export function getFunderCredentials(): AptosKeyPair {
  if (!cachedFunder) {
    cachedFunder = readYamlKey(GENESIS_KEYS_PATH);
  }
  return cachedFunder;
}

function findValidatorKeyPath(): string {
  const validatorsDir = pathResolve(CONFIG_DIR, "validators");
  if (!existsSync(validatorsDir)) {
    throw new Error(
      `Validators directory not found: ${validatorsDir}. Is the docker testnet initialized?`,
    );
  }

  const entries = readdirSync(validatorsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const directory of entries) {
    const candidate = pathResolve(
      validatorsDir,
      directory,
      "private-keys.yaml",
    );
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No validator private key file found under ${validatorsDir}`);
}

let cachedDeployer: AptosKeyPair | null = null;
export function getDeployerCredentials(): AptosKeyPair {
  if (!cachedDeployer) {
    cachedDeployer = readYamlKey(findValidatorKeyPath());
  }
  return cachedDeployer;
}
