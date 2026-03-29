import { AccountAuthenticator, AccountAddress, Aptos } from "@aptos-labs/ts-sdk";
export type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
export interface PreparedTransaction {
    transaction: any;
    auth: AccountAuthenticator;
    senderAddress: AccountAddress;
    debugState: any;
    payload: InputGenerateTransactionPayloadData;
}
export declare function prepareNativeTransaction(aptos: Aptos, ethAddress: string, payload: InputGenerateTransactionPayloadData): Promise<PreparedTransaction>;
export declare function simulateNativeTransaction(aptos: Aptos, preparedTx: PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").UserTransactionResponse>;
export declare function submitPreparedTransaction(aptos: Aptos, preparedTx: PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
export declare function submitNativeTransaction(aptos: Aptos, ethAddress: string, payload: InputGenerateTransactionPayloadData | PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
