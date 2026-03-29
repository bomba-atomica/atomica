import { areContractsDeployed as areEVMContractsDeployed } from "./ethereum/contracts";
import { areCoreContractsDeployed as areAptosCoreContractsDeployed } from "./aptos/payloads";
export async function checkAptosAlive() {
    try {
        const res = await fetch("/aptos-api/v1");
        return res.ok;
    }
    catch {
        return false;
    }
}
export async function checkEthereumAlive() {
    try {
        const res = await fetch("/eth-api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_blockNumber",
                params: [],
                id: 1,
            }),
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
export async function checkEVMContracts() {
    try {
        return await areEVMContractsDeployed();
    }
    catch {
        return false;
    }
}
export async function checkAptosContracts() {
    try {
        return await areAptosCoreContractsDeployed();
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=contract-check.js.map