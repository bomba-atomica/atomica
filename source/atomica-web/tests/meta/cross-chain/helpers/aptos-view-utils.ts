import { Aptos } from "@aptos-labs/ts-sdk";

/**
 * Helper to call Aptos view functions.
 *
 * @param client - Aptos client instance
 * @param functionName - Full function name (e.g., "0xabc::module::function")
 * @param typeArguments - Type arguments for the function
 * @param functionArguments - Arguments for the function
 * @returns Result of the view function call
 */
export async function viewFunction(
  client: Aptos,
  functionName: string,
  typeArguments: string[],
  functionArguments: any[],
): Promise<any[]> {
  const payload = {
    function: functionName,
    typeArguments,
    functionArguments,
  };

  const result = await client.view({ payload });
  return result;
}
