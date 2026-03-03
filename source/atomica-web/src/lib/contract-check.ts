import { areContractsDeployed as areEVMContractsDeployed } from "./ethereum/contracts";
import { areCoreContractsDeployed as areAptosCoreContractsDeployed } from "./aptos/payloads";

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
    return await areAptosCoreContractsDeployed();
  } catch (error) {
    console.warn("checkAptosContracts failed", error);
    return false;
  }
}
