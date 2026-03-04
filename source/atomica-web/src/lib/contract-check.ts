import { areContractsDeployed as areEVMContractsDeployed } from "./ethereum/contracts";
import { areCoreContractsDeployed as areAptosCoreContractsDeployed } from "./aptos/payloads";
import { aptos } from "./aptos/config";
import { getEthereumProvider } from "./ethereum/config";

export async function checkAptosAlive(): Promise<boolean> {
  try {
    await aptos.getLedgerInfo();
    return true;
  } catch {
    return false;
  }
}

export async function checkEthereumAlive(): Promise<boolean> {
  try {
    await getEthereumProvider().getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

export async function checkEVMContracts(): Promise<boolean> {
  try {
    return await areEVMContractsDeployed();
  } catch {
    return false;
  }
}

export async function checkAptosContracts(): Promise<boolean> {
  try {
    return await areAptosCoreContractsDeployed();
  } catch {
    return false;
  }
}
