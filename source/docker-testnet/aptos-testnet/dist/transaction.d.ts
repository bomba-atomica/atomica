import { AccountAuthenticator, AccountAddress } from "@aptos-labs/ts-sdk";
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
export interface PreparedTransaction {
    transaction: any;
    auth: AccountAuthenticator;
    senderAddress: AccountAddress;
    debugState: any;
    payload: InputGenerateTransactionPayloadData;
}
export declare function prepareNativeTransaction(ethAddress: string, payload: InputGenerateTransactionPayloadData): Promise<PreparedTransaction>;
export declare function simulateNativeTransaction(preparedTx: PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").UserTransactionResponse>;
export declare function submitPreparedTransaction(preparedTx: PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
export declare function submitNativeTransaction(ethAddress: string, payload: InputGenerateTransactionPayloadData | PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
