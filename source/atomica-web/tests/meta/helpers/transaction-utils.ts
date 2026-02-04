import type { TransactionResponse, TransactionReceipt, Signer } from "ethers";

/**
 * Sends a transaction and waits for confirmation with explicit timeout and status checks.
 *
 * @param txPromise - Promise that resolves to a TransactionResponse
 * @param confirmations - Number of block confirmations to wait for (default: 1)
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns TransactionReceipt after confirmation
 * @throws Error if transaction times out, reverts, or receipt is null
 */
export async function sendAndWaitForTx(
  txPromise: Promise<TransactionResponse>,
  confirmations = 1,
  timeout = 30000
): Promise<TransactionReceipt> {
  const tx = await txPromise;
  const receipt = await tx.wait(confirmations, timeout);

  if (!receipt) {
    throw new Error(`Transaction ${tx.hash} confirmation timeout after ${timeout}ms`);
  }

  if (receipt.status === 0) {
    throw new Error(`Transaction ${tx.hash} reverted`);
  }

  return receipt;
}

/**
 * Sends multiple transactions sequentially with explicit nonce management.
 * Useful for rapid sequential operations that might otherwise cause REPLACEMENT_UNDERPRICED errors.
 *
 * @param signer - The signer to use for transactions
 * @param txFactories - Array of functions that take a nonce and return a transaction promise
 * @returns Array of TransactionReceipts in order
 */
export async function sendSequentialTxs(
  signer: Signer,
  txFactories: Array<(nonce: number) => Promise<TransactionResponse>>
): Promise<TransactionReceipt[]> {
  let nonce = await signer.getNonce();
  const receipts: TransactionReceipt[] = [];

  for (const factory of txFactories) {
    const receipt = await sendAndWaitForTx(factory(nonce++), 1);
    receipts.push(receipt);
  }

  return receipts;
}
