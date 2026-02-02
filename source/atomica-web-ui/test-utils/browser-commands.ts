/**
 * Browser Commands for UI Component Tests
 *
 * Re-exports browser commands from aptos-testnet package for use in vitest config.
 * This wrapper avoids ESM import issues in vitest.config.ts bundling.
 */

export {
  setupLocalnetCommand,
  teardownLocalnetCommand,
  deployContractsCommand,
  fundAccountCommand,
} from "@atomica/aptos-docker-testnet/browser-commands";
