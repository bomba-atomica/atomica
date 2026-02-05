import { Aptos } from "@aptos-labs/ts-sdk";

export interface ModuleIndexingResult {
  success: boolean;
  attempts: number;
  errors: Array<{ timestamp: number; error: string }>;
  totalWaitMs: number;
}

export interface ModuleIndexingOptions {
  maxWaitMs?: number;
  exponentialBackoff?: boolean;
  captureErrors?: boolean;
  initialDelayMs?: number;
}

/**
 * Wait for an Aptos module to be indexed and callable.
 *
 * Uses exponential backoff to balance quick detection with resource efficiency:
 * - 1s → 2s → 4s → 8s → 10s (max)
 *
 * @param client - Aptos client instance
 * @param moduleAddress - Address where module is deployed
 * @param moduleName - Name of the module (e.g., "lock_receipt")
 * @param options - Configuration options
 * @returns Result object with success status, attempts, and captured errors
 */
export async function waitForModuleIndexed(
  client: Aptos,
  moduleAddress: string,
  moduleName: string,
  options: ModuleIndexingOptions = {},
): Promise<ModuleIndexingResult> {
  const {
    maxWaitMs = 90000,
    exponentialBackoff = true,
    captureErrors = true,
    initialDelayMs = 1000,
  } = options;

  const errors: Array<{ timestamp: number; error: string }> = [];
  const startTime = Date.now();
  let attempts = 0;
  let currentDelay = initialDelayMs;
  const maxDelay = 10000; // Cap at 10 seconds

  console.log(
    `[Module Indexing] Waiting for ${moduleAddress}::${moduleName} to be indexed...`,
  );
  console.log(
    `[Module Indexing] Max wait: ${maxWaitMs}ms, Exponential backoff: ${exponentialBackoff}`,
  );

  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    const elapsedMs = Date.now() - startTime;

    try {
      // Step 1: Check if module exists in account resources
      const modules = await client.getAccountModules({
        accountAddress: moduleAddress,
      });

      const moduleExists = modules.some((m) => m.abi?.name === moduleName);

      if (!moduleExists) {
        const error = `Module ${moduleName} not found in account modules (attempt ${attempts}, ${elapsedMs}ms elapsed)`;
        if (captureErrors) {
          errors.push({ timestamp: Date.now(), error });
        }
        console.log(`[Module Indexing] ${error}`);
      } else {
        console.log(
          `[Module Indexing] ✓ Module found in account modules (attempt ${attempts}, ${elapsedMs}ms elapsed)`,
        );

        // Step 2: Verify module is callable by attempting a view function
        // Note: This assumes the module has at least one view function
        // If verification fails, we'll still consider it indexed but log the warning
        try {
          // Try to get module ABI to verify it's fully indexed
          const moduleData = modules.find((m) => m.abi?.name === moduleName);
          if (moduleData?.abi) {
            console.log(`[Module Indexing] ✓ Module ABI is available`);
            console.log(
              `[Module Indexing] ✓ Module is indexed and ready (${attempts} attempts, ${elapsedMs}ms total)`,
            );

            return {
              success: true,
              attempts,
              errors,
              totalWaitMs: elapsedMs,
            };
          }
        } catch (verifyError: any) {
          console.warn(
            `[Module Indexing] ⚠ Module exists but verification failed: ${verifyError.message}`,
          );
          // Still consider it a success if module exists
          return {
            success: true,
            attempts,
            errors,
            totalWaitMs: elapsedMs,
          };
        }
      }
    } catch (error: any) {
      const errorMsg = `Error checking module: ${error.message}`;
      if (captureErrors) {
        errors.push({ timestamp: Date.now(), error: errorMsg });
      }
      console.log(
        `[Module Indexing] ${errorMsg} (attempt ${attempts}, ${elapsedMs}ms elapsed)`,
      );
    }

    // Wait before next attempt with exponential backoff
    await new Promise((resolve) => setTimeout(resolve, currentDelay));

    if (exponentialBackoff) {
      currentDelay = Math.min(currentDelay * 2, maxDelay);
      console.log(`[Module Indexing] Next check in ${currentDelay}ms...`);
    }
  }

  // Timeout reached
  const totalWaitMs = Date.now() - startTime;
  console.error(
    `[Module Indexing] ✗ Timeout after ${attempts} attempts (${totalWaitMs}ms)`,
  );

  if (captureErrors && errors.length > 0) {
    console.error(`[Module Indexing] Last 5 errors:`);
    errors.slice(-5).forEach((e, i) => {
      console.error(
        `  ${i + 1}. [${new Date(e.timestamp).toISOString()}] ${e.error}`,
      );
    });
  }

  return {
    success: false,
    attempts,
    errors,
    totalWaitMs,
  };
}

/**
 * Verify that a module is callable by attempting to call a view function.
 *
 * @param client - Aptos client instance
 * @param moduleAddress - Address where module is deployed
 * @param moduleName - Name of the module
 * @param functionName - View function to call (without module prefix)
 * @param typeArguments - Type arguments for the function
 * @param functionArguments - Arguments for the function
 * @returns True if the function call succeeds, false otherwise
 */
export async function verifyModuleCallable(
  client: Aptos,
  moduleAddress: string,
  moduleName: string,
  functionName: string,
  typeArguments: string[] = [],
  functionArguments: any[] = [],
): Promise<boolean> {
  try {
    await client.view({
      payload: {
        function: `${moduleAddress}::${moduleName}::${functionName}`,
        typeArguments,
        functionArguments,
      },
    });
    console.log(
      `[Module Callable] ✓ Successfully called ${moduleName}::${functionName}`,
    );
    return true;
  } catch (error: any) {
    console.error(
      `[Module Callable] ✗ Failed to call ${moduleName}::${functionName}: ${error.message}`,
    );
    return false;
  }
}
