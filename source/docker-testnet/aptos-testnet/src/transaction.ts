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

export interface SimulateResult {
    gas_used: string;
    success: boolean;
    vm_status: string;
    hash: string;
}

export interface SubmitResult {
    hash: string;
}

export async function prepareNativeTransaction(
    ethAddress: string,
    payload: InputGenerateTransactionPayloadData,
): Promise<PreparedTransaction> {
    return sdkPrepare(aptos, ethAddress, payload);
}

export async function simulateNativeTransaction(preparedTx: PreparedTransaction): Promise<SimulateResult> {
    return sdkSimulate(aptos, preparedTx) as Promise<SimulateResult>;
}

export async function submitPreparedTransaction(preparedTx: PreparedTransaction): Promise<SubmitResult> {
    return sdkSubmitPrepared(aptos, preparedTx) as Promise<SubmitResult>;
}

export async function submitNativeTransaction(
    ethAddress: string,
    payload: InputGenerateTransactionPayloadData | PreparedTransaction,
): Promise<SubmitResult> {
    return sdkSubmit(aptos, ethAddress, payload) as Promise<SubmitResult>;
}
