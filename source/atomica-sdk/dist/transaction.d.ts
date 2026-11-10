import { AccountAuthenticator, AccountAddress, Aptos } from "@aptos-labs/ts-sdk";
export type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
/**
 * A transaction that has been built and authenticated with a SIWE signature,
 * ready for simulation or submission.
 *
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
export interface PreparedTransaction {
    transaction: any;
    /** BCS-encoded SIWE abstract account authenticator. */
    auth: AccountAuthenticator;
    /** The derived Aptos address of the Ethereum signer. */
    senderAddress: AccountAddress;
    /** Diagnostic data included in submission errors. */
    debugState: any;
    payload: InputGenerateTransactionPayloadData;
}
/**
 * Build an Aptos transaction and authenticate it with a SIWE signature from MetaMask.
 *
 * Derives the Aptos address from `ethAddress`, builds the transaction payload,
 * constructs the SIWE message for the user to sign, and returns a
 * {@link PreparedTransaction} ready for {@link simulateNativeTransaction} or
 * {@link submitPreparedTransaction}.
 *
 * Requires `window.ethereum` (MetaMask or compatible injected provider).
 *
 * @param aptos - Configured Aptos client instance
 * @param ethAddress - Ethereum hex address of the signer (any case; lowercased internally)
 * @param payload - Aptos entry function payload
 * @returns Prepared transaction with SIWE authenticator
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
export declare function prepareNativeTransaction(aptos: Aptos, ethAddress: string, payload: InputGenerateTransactionPayloadData): Promise<PreparedTransaction>;
/**
 * Pre-flight simulate a prepared transaction.
 *
 * Logs the simulation result and VM status. Does not throw on failed simulation
 * unless the RPC call itself errors — the caller is responsible for checking
 * `simulationResult.success`.
 *
 * @param aptos - Configured Aptos client instance
 * @param preparedTx - Transaction prepared by {@link prepareNativeTransaction}
 * @returns The first simulation result object from the Aptos node
 */
export declare function simulateNativeTransaction(aptos: Aptos, preparedTx: PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").UserTransactionResponse>;
/**
 * Submit a prepared transaction and wait for on-chain execution.
 *
 * Throws if the transaction is rejected by the node or if `executedTx.success`
 * is `false`. On failure, the error message includes the VM status and the
 * full debug state from {@link PreparedTransaction.debugState}.
 *
 * @param aptos - Configured Aptos client instance
 * @param preparedTx - Transaction prepared by {@link prepareNativeTransaction}
 * @returns The pending transaction object (includes `hash`)
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
export declare function submitPreparedTransaction(aptos: Aptos, preparedTx: PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
/**
 * All-in-one convenience: prepare → simulate → submit.
 *
 * If `payload` is already a {@link PreparedTransaction} (i.e. contains `auth`
 * and `transaction`), skips preparation and delegates directly to
 * {@link submitPreparedTransaction}.
 *
 * Simulation errors are logged but do not block submission (backward
 * compatibility).
 *
 * @param aptos - Configured Aptos client instance
 * @param ethAddress - Ethereum hex address of the signer
 * @param payload - Entry function payload or an already-prepared transaction
 * @returns The pending transaction object (includes `hash`)
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
export declare function submitNativeTransaction(aptos: Aptos, ethAddress: string, payload: InputGenerateTransactionPayloadData | PreparedTransaction): Promise<import("@aptos-labs/ts-sdk").PendingTransactionResponse>;
