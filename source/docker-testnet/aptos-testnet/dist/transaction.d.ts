import { type PreparedTransaction, type InputGenerateTransactionPayloadData } from "@atomica/sdk";
export type { PreparedTransaction };
export declare function prepareNativeTransaction(ethAddress: string, payload: InputGenerateTransactionPayloadData): Promise<PreparedTransaction>;
export declare function simulateNativeTransaction(preparedTx: PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").UserTransactionResponse>;
export declare function submitPreparedTransaction(preparedTx: PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
export declare function submitNativeTransaction(ethAddress: string, payload: InputGenerateTransactionPayloadData | PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
