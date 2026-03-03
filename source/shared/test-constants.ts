type EnvMap = Record<string, string | undefined>;

const nodeEnv: EnvMap =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as any).process !== "undefined" &&
  (globalThis as any).process.env
    ? (globalThis as any).process.env
    : {};

function lookupEnv(key: string): string | undefined {
  const value = nodeEnv[key];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const defaults = {
  CORE_RESOURCES_ADDRESS:
    "0x00000000000000000000000000000000000000000000000000000000A550C18",
  CORE_RESOURCES_PRIVATE_KEY:
    "0x51bcebc3db26b1af5778ed86e9126c25759263adeb4fa149a0aea07425ec5caa",
  APTOS_DEPLOYER_ADDRESS:
    "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa",
  APTOS_DEPLOYER_PRIVATE_KEY:
    "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717",
  ETH_DEPLOYER_ADDRESS: "0x8943545177806ED17B9F23F0a21ee5948eCaa776",
  ETH_DEPLOYER_PRIVATE_KEY:
    "0xbcdf20249abf0ed6d944c0288fad489e33f66b3960d9e6229c1cd214ed3bbe31",
  ETH_DEPLOYER_MNEMONIC:
    "giant issue aisle success illegal bike spike question tent bar rely arctic volcano long crawl hungry vocal artwork sniff fantasy very lucky have athlete",
  ATOMICA_CONTRACT_ADDRESS:
    "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa",
  HARDHAT_ACCOUNT_0_ADDRESS: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  HARDHAT_ACCOUNT_0_PRIVATE_KEY:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};

function envOrDefault<T extends keyof typeof defaults>(key: T): string {
  return lookupEnv(key) ?? defaults[key];
}

export function getEnvOverride<T extends keyof typeof defaults>(
  key: T,
): string | undefined {
  return lookupEnv(key);
}

export const CORE_RESOURCES_ADDRESS = envOrDefault("CORE_RESOURCES_ADDRESS");
export const CORE_RESOURCES_PRIVATE_KEY = envOrDefault(
  "CORE_RESOURCES_PRIVATE_KEY",
);
export const APTOS_DEPLOYER_ADDRESS = envOrDefault("APTOS_DEPLOYER_ADDRESS");
export const APTOS_DEPLOYER_PRIVATE_KEY = envOrDefault(
  "APTOS_DEPLOYER_PRIVATE_KEY",
);
export const ETH_DEPLOYER_ADDRESS = envOrDefault("ETH_DEPLOYER_ADDRESS");
export const ETH_DEPLOYER_PRIVATE_KEY = envOrDefault(
  "ETH_DEPLOYER_PRIVATE_KEY",
);
export const ETH_DEPLOYER_MNEMONIC = envOrDefault("ETH_DEPLOYER_MNEMONIC");
export const ATOMICA_CONTRACT_ADDRESS = envOrDefault(
  "ATOMICA_CONTRACT_ADDRESS",
);
export const HARDHAT_ACCOUNT_0_ADDRESS = envOrDefault(
  "HARDHAT_ACCOUNT_0_ADDRESS",
);
export const HARDHAT_ACCOUNT_0_PRIVATE_KEY = envOrDefault(
  "HARDHAT_ACCOUNT_0_PRIVATE_KEY",
);

export const DEFAULT_CREDENTIALS = defaults;
