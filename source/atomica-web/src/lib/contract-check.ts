import { areContractsDeployed as areEVMContractsDeployed } from "./ethereum/contracts";
import { areContractsDeployed as areAptosContractsDeployed } from "./aptos/payloads";

export async function checkEVMContracts(): Promise<boolean> {
  try {
    return await areEVMContractsDeployed();
  } catch (error) {
    console.warn("checkEVMContracts failed", error);
    return false;
  }
}

export async function checkAptosContracts(): Promise<boolean> {
  try {
    return await areAptosContractsDeployed();
  } catch (error) {
    console.warn("checkAptosContracts failed", error);
    return false;
  }
}
