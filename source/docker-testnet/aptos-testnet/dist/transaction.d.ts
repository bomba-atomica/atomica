import { type PreparedTransaction, type InputGenerateTransactionPayloadData } from "@atomica/sdk";
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
export declare function prepareNativeTransaction(ethAddress: string, payload: InputGenerateTransactionPayloadData): Promise<PreparedTransaction>;
export declare function simulateNativeTransaction(preparedTx: PreparedTransaction): Promise<SimulateResult>;
export declare function submitPreparedTransaction(preparedTx: PreparedTransaction): Promise<SubmitResult>;
export declare function submitNativeTransaction(ethAddress: string, payload: InputGenerateTransactionPayloadData | PreparedTransaction): Promise<SubmitResult>;
