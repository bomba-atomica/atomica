// Test credentials — canonical values live in source/.env.test.
// Vite/Vitest loads that file automatically in test mode (envDir: '../').
// Non-Vite Node scripts call dotenv.config() at their entry point.
// Defaults here match .env.test so browser fallbacks stay consistent.

type EnvMap = Record<string, string | undefined>;

const nodeEnv: EnvMap =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as any).process !== "undefined" &&
  (globalThis as any).process.env
    ? (globalThis as any).process.env
    : {};

function env(key: string, fallback: string): string {
  const value = nodeEnv[key];
  if (!value) return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

// Aptos — root account (faucet / funder)
export const APTOS_ROOT_ACCOUNT_ADDRESS = env(
  "APTOS_ROOT_ACCOUNT_ADDRESS",
  "0x585dd6daddafb44af185ea1e1bb7ac94c1fd9314787ce2b64ddaa70a8c9baf0c",
);
export const APTOS_ROOT_ACCOUNT_PRIVATE_KEY = env(
  "APTOS_ROOT_ACCOUNT_PRIVATE_KEY",
  "0x970daae6672b68f76de3418f2f61cc469ff6659393b95c25fc72142c1433fa2d",
);

// Aptos — contract deployer
export const APTOS_DEPLOYER_ADDRESS = env(
  "APTOS_DEPLOYER_ADDRESS",
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa",
);
export const APTOS_DEPLOYER_PRIVATE_KEY = env(
  "APTOS_DEPLOYER_PRIVATE_KEY",
  "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717",
);
export const APTOS_ATOMICA_CONTRACT_ADDRESS = env(
  "APTOS_ATOMICA_CONTRACT_ADDRESS",
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa",
);

// Aptos — validators
export const APTOS_VALIDATOR_0_ACCOUNT_ADDRESS = env(
  "APTOS_VALIDATOR_0_ACCOUNT_ADDRESS",
  "0x4b528f365c42ab0fd718c789e327ada25d4e403d8dbd1039bb574b532cb9f599",
);
export const APTOS_VALIDATOR_0_ACCOUNT_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_0_ACCOUNT_PRIVATE_KEY",
  "0xea3e3bcabd4fb55e3749d1af2b70b7cc38276b33dd3e766c93675bb6cc4d6bff",
);
export const APTOS_VALIDATOR_0_CONSENSUS_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_0_CONSENSUS_PRIVATE_KEY",
  "0x69de736ab272df260835d8b06f1dd4572d7c9227c13519eecce695500b679501",
);
export const APTOS_VALIDATOR_0_FULL_NODE_NETWORK_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_0_FULL_NODE_NETWORK_PRIVATE_KEY",
  "0x18ba900926e137039d371c80dfa3c492e4b14add92a706d08d5a7d88b47e2662",
);
export const APTOS_VALIDATOR_0_VALIDATOR_NETWORK_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_0_VALIDATOR_NETWORK_PRIVATE_KEY",
  "0x681b61b59d0078a5352f50b1d6833adbc9ef8e916405d145a6d429da8e784878",
);

export const APTOS_VALIDATOR_1_ACCOUNT_ADDRESS = env(
  "APTOS_VALIDATOR_1_ACCOUNT_ADDRESS",
  "0xc7b8086a882a595406b47f492c30f0eb733b4676db28d0b5a8c9833c6280bab9",
);
export const APTOS_VALIDATOR_1_ACCOUNT_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_1_ACCOUNT_PRIVATE_KEY",
  "0x81a3d6e70ba5e43ee034abfa328fb90650e52d364c02fac7b1dd2cd6cca2a55d",
);
export const APTOS_VALIDATOR_1_CONSENSUS_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_1_CONSENSUS_PRIVATE_KEY",
  "0x2ae5ee0bad99f80669c4269fb9d65e79e16dba56b6b38ad82f26ad942d5029f4",
);
export const APTOS_VALIDATOR_1_FULL_NODE_NETWORK_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_1_FULL_NODE_NETWORK_PRIVATE_KEY",
  "0x10a93ccab29211df0b034891f0e60255b2a4f1212a2cbd0f3a8ae5ab096bc265",
);
export const APTOS_VALIDATOR_1_VALIDATOR_NETWORK_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_1_VALIDATOR_NETWORK_PRIVATE_KEY",
  "0xa8d3db3adff2008c3580aac2e2b2dab4b6aec75334a9d5f015a9111ea7eab248",
);

export const APTOS_VALIDATOR_2_ACCOUNT_ADDRESS = env(
  "APTOS_VALIDATOR_2_ACCOUNT_ADDRESS",
  "0xb7bf7fcfc274b7325c0da82d6e9cbc0f6e1e19870af5baf8d6dce7145bb314a7",
);
export const APTOS_VALIDATOR_2_ACCOUNT_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_2_ACCOUNT_PRIVATE_KEY",
  "0x38fa9b714141f5651d4d85ab9aa79b0629968086b6fd0e91f9762a58307aa84d",
);
export const APTOS_VALIDATOR_2_CONSENSUS_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_2_CONSENSUS_PRIVATE_KEY",
  "0x0bc0e6b1df9af25809a77af4a5a8dd166735ab3a3ca604b40432b4f370e8cd3e",
);
export const APTOS_VALIDATOR_2_FULL_NODE_NETWORK_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_2_FULL_NODE_NETWORK_PRIVATE_KEY",
  "0xb85fa658e863a70f83b9c6f16ddca51ad991b6c02278816880ea85c2b48b0857",
);
export const APTOS_VALIDATOR_2_VALIDATOR_NETWORK_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_2_VALIDATOR_NETWORK_PRIVATE_KEY",
  "0x58844356cb153d27282de8d32d676407ffe27812fd72431c8feb23a376070273",
);

export const APTOS_VALIDATOR_3_ACCOUNT_ADDRESS = env(
  "APTOS_VALIDATOR_3_ACCOUNT_ADDRESS",
  "0x64cefbcbfbce5ed5c946561e67dbb99db9638974f0dc195c380e8c9d1f2d0ee4",
);
export const APTOS_VALIDATOR_3_ACCOUNT_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_3_ACCOUNT_PRIVATE_KEY",
  "0xd08124b8efd85954fd2851030b49be958996a6fd2dd91573b0658d22d0fdb1ff",
);
export const APTOS_VALIDATOR_3_CONSENSUS_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_3_CONSENSUS_PRIVATE_KEY",
  "0x06968e19835d820246428c7e47dc1a71eecc7915c409ece37b1c334358d6e3c6",
);
export const APTOS_VALIDATOR_3_FULL_NODE_NETWORK_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_3_FULL_NODE_NETWORK_PRIVATE_KEY",
  "0xf8219f1f100c65dd57d73cea2554b04b3ce5776830c08f00309b595a9288d363",
);
export const APTOS_VALIDATOR_3_VALIDATOR_NETWORK_PRIVATE_KEY = env(
  "APTOS_VALIDATOR_3_VALIDATOR_NETWORK_PRIVATE_KEY",
  "0x181f66ebd0defba6b5cd670008ffec739bf34dcfd71495efa17d0ebf06c32b53",
);

// Ethereum — deployer
export const ETHEREUM_DEPLOYER_ADDRESS = env(
  "ETHEREUM_DEPLOYER_ADDRESS",
  "0x8943545177806ED17B9F23F0a21ee5948eCaa776",
);
export const ETHEREUM_DEPLOYER_PRIVATE_KEY = env(
  "ETHEREUM_DEPLOYER_PRIVATE_KEY",
  "0xbcdf20249abf0ed6d944c0288fad489e33f66b3960d9e6229c1cd214ed3bbe31",
);
export const ETHEREUM_DEPLOYER_MNEMONIC = env(
  "ETHEREUM_DEPLOYER_MNEMONIC",
  "giant issue aisle success illegal bike spike question tent bar rely arctic volcano long crawl hungry vocal artwork sniff fantasy very lucky have athlete",
);

// Ethereum — account 0 (Hardhat default)
export const ETHEREUM_ACCOUNT_0_ADDRESS = env(
  "ETHEREUM_ACCOUNT_0_ADDRESS",
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
);
export const ETHEREUM_ACCOUNT_0_PRIVATE_KEY = env(
  "ETHEREUM_ACCOUNT_0_PRIVATE_KEY",
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
