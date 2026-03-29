import { existsSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

function getEnv(key: string, fallback: string): string {
    const value = process.env[key];
    if (!value || value.trim().length === 0) return fallback;
    return value.trim();
}

const APTOS_ROOT_ACCOUNT_ADDRESS = getEnv(
    "APTOS_ROOT_ACCOUNT_ADDRESS",
    "0x585dd6daddafb44af185ea1e1bb7ac94c1fd9314787ce2b64ddaa70a8c9baf0c",
);
const APTOS_ROOT_ACCOUNT_PRIVATE_KEY = getEnv(
    "APTOS_ROOT_ACCOUNT_PRIVATE_KEY",
    "0x970daae6672b68f76de3418f2f61cc469ff6659393b95c25fc72142c1433fa2d",
);
const APTOS_DEPLOYER_ADDRESS = getEnv(
    "APTOS_DEPLOYER_ADDRESS",
    "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa",
);
const APTOS_DEPLOYER_PRIVATE_KEY = getEnv(
    "APTOS_DEPLOYER_PRIVATE_KEY",
    "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717",
);

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
