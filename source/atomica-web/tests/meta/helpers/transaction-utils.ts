import type {
  TransactionResponse,
  TransactionReceipt,
  Signer,
  Contract,
} from "ethers";

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
  timeout = 30000,
): Promise<TransactionReceipt> {
  const tx = await txPromise;
  const receipt = await tx.wait(confirmations, timeout);

  if (!receipt) {
    throw new Error(
      `Transaction ${tx.hash} confirmation timeout after ${timeout}ms`,
    );
  }

  if (receipt.status === 0) {
    throw new Error(`Transaction ${tx.hash} reverted`);
  }

  return receipt;
}

/**
 * Polls a contract function until it returns the expected value or times out.
 * Useful for waiting until state is indexed on PoS testnets.
 *
 * @param contract - The contract to query
 * @param method - The method name to call
 * @param args - Arguments to pass to the method
 * @param expectedValue - The value to wait for
 * @param options - Polling options
 * @returns The actual value once it matches expected
 * @throws Error if timeout is reached
 */
export async function pollForValue<T>(
  contract: Contract,
  method: string,
  args: any[],
  expectedValue: T,
  options: {
    interval?: number;
    timeout?: number;
    description?: string;
  } = {},
): Promise<T> {
  const { interval = 500, timeout = 30000, description = "value" } = options;
  const startTime = Date.now();

  while (true) {
    const value = await contract[method](...args);

    if (
      value === expectedValue ||
      (typeof value === "bigint" &&
        typeof expectedValue === "bigint" &&
        value === expectedValue)
    ) {
      return value;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= timeout) {
      throw new Error(
        `Timeout waiting for ${description} after ${elapsed}ms. Expected ${expectedValue}, got ${value}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
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
  txFactories: Array<(nonce: number) => Promise<TransactionResponse>>,
): Promise<TransactionReceipt[]> {
  let nonce = await signer.getNonce();
  const receipts: TransactionReceipt[] = [];

  for (const factory of txFactories) {
    const receipt = await sendAndWaitForTx(factory(nonce++), 1);
    receipts.push(receipt);
  }

  return receipts;
}

/**
 * Polls an async function until it returns a value that passes a condition.
 * Useful for waiting until state trie is indexed and proofs are available.
 *
 * @param fn - Async function to poll
 * @param condition - Function that returns true when result is acceptable
 * @param options - Polling options
 * @returns The result once condition passes
 * @throws Error if timeout is reached or last error if all attempts fail
 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    interval?: number;
    timeout?: number;
    description?: string;
  } = {},
): Promise<T> {
  const {
    interval = 500,
    timeout = 30000,
    description = "condition",
  } = options;
  const startTime = Date.now();
  let lastError: Error | undefined;

  while (true) {
    try {
      const result = await fn();

      if (condition(result)) {
        return result;
      }
    } catch (error) {
      // Store error but keep polling - state might not be ready yet
      lastError = error as Error;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= timeout) {
      const errorMsg = lastError
        ? `Timeout waiting for ${description} after ${elapsed}ms. Last error: ${lastError.message}`
        : `Timeout waiting for ${description} after ${elapsed}ms`;
      throw new Error(errorMsg);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
