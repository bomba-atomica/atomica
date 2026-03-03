import {
  CORE_RESOURCES_ADDRESS,
  CORE_RESOURCES_PRIVATE_KEY,
  APTOS_DEPLOYER_ADDRESS,
  APTOS_DEPLOYER_PRIVATE_KEY,
} from "../../shared/test-constants";

export type AptosKeyPair = {
  address: string;
  privateKey: string;
  source: string;
};

export function getFunderCredentials(): AptosKeyPair {
  return {
    address: CORE_RESOURCES_ADDRESS,
    privateKey: CORE_RESOURCES_PRIVATE_KEY,
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
