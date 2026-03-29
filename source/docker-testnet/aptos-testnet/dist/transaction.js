import { aptos } from "./config.js";
import { prepareNativeTransaction as sdkPrepare, submitNativeTransaction as sdkSubmit, simulateNativeTransaction as sdkSimulate, submitPreparedTransaction as sdkSubmitPrepared, } from "@atomica/sdk";
export async function prepareNativeTransaction(ethAddress, payload) {
    return sdkPrepare(aptos, ethAddress, payload);
}
export async function simulateNativeTransaction(preparedTx) {
    return sdkSimulate(aptos, preparedTx);
}
export async function submitPreparedTransaction(preparedTx) {
    return sdkSubmitPrepared(aptos, preparedTx);
}
export async function submitNativeTransaction(ethAddress, payload) {
    return sdkSubmit(aptos, ethAddress, payload);
}
