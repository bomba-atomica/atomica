import { aptos } from "./config.js";
import {
    prepareNativeTransaction as sdkPrepare,
    submitNativeTransaction as sdkSubmit,
    simulateNativeTransaction as sdkSimulate,
    submitPreparedTransaction as sdkSubmitPrepared,
    type PreparedTransaction,
    type InputGenerateTransactionPayloadData,
} from "@atomica/sdk";

export type { PreparedTransaction };

export async function prepareNativeTransaction(
    ethAddress: string,
    payload: InputGenerateTransactionPayloadData,
): Promise<PreparedTransaction> {
    return sdkPrepare(aptos, ethAddress, payload);
}

export async function simulateNativeTransaction(preparedTx: PreparedTransaction) {
    return sdkSimulate(aptos, preparedTx);
}

export async function submitPreparedTransaction(preparedTx: PreparedTransaction) {
    return sdkSubmitPrepared(aptos, preparedTx);
}

export async function submitNativeTransaction(
    ethAddress: string,
    payload: InputGenerateTransactionPayloadData | PreparedTransaction,
) {
    return sdkSubmit(aptos, ethAddress, payload);
}
