/**
 * Docker Testnet Wrapper for atomica-web Tests
 *
 * This module re-exports the official @atomica/docker-testnet SDK.
 * All new tests should use the SDK directly, but this wrapper maintains
 * backwards compatibility for existing test imports.
 *
 * NEW USAGE (Recommended):
 * ```typescript
 * import { DockerTestnet } from "@atomica/docker-testnet";
 *
 * const testnet = await DockerTestnet.new(4);
 * await testnet.bootstrapValidators();
 * await testnet.faucet(address, amount);
 * await testnet.teardown();
 * ```
 *
 * OLD USAGE (For backwards compatibility):
 * ```typescript
 * import { DockerTestnet } from "../../test-utils/docker-testnet";
 *
 * const testnet = await DockerTestnet.new(4);
 * // ... rest is the same
 * ```
 *
 * MIGRATION GUIDE:
 * - `DockerTestnet.new(n)` - Unchanged
 * - `testnet.teardown()` - Unchanged
 * - `testnet.validatorApiUrl(i)` - Unchanged
 * - `testnet.getLedgerInfo(i)` - Unchanged
 * - `testnet.getBlockHeight(i)` - Unchanged
 * - `testnet.waitForBlocks(n)` - Unchanged
 *
 * NEW FEATURES IN SDK:
 * - `testnet.bootstrapValidators(amount?)` - Fund validators for production-like testing
 * - `testnet.faucet(address, amount)` - Production-like account funding
 * - `testnet.getFaucetAccount()` - Get the test faucet account (Core Resources)
 * - `testnet.getValidatorAccount(i)` - Get validator account with private key
 *
 * See: ../docker-testnet/typescript-sdk/README.md
 */

export { DockerTestnet, type LedgerInfo } from "@atomica/docker-testnet";
