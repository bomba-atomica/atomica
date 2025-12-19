/**
 * Vitest Configuration - Node.js Meta Tests
 *
 * This configuration is for INFRASTRUCTURE VALIDATION tests that run in Node.js.
 *
 * WHAT IT DOES:
 * - Runs tests in Node.js environment (not browser)
 * - Includes ONLY tests in tests/meta/ directory
 * - Tests verify testing infrastructure, not application code
 * - Provides direct access to filesystem, child processes, and CLI tools
 *
 * WHEN TO USE THIS CONFIG:
 * ✅ Meta/infrastructure tests (tests/meta/)
 * ❌ Unit tests (use vitest.config.ts - browser)
 * ❌ Integration tests (use vitest.config.ts - browser)
 * ❌ UI component tests (use vitest.config.ts - browser)
 *
 * RUN COMMAND:
 *   npx vitest run --config vitest.config.nodejs.ts tests/meta/
 *   npx vitest run --config vitest.config.nodejs.ts tests/meta/localnet.test.ts
 *
 * IMPORTANT NOTES FOR AI AGENTS:
 *
 * 1. NODE.JS ENVIRONMENT (environment: "node")
 *    - Tests run in Node.js, NOT in a browser
 *    - Full access to Node.js APIs: fs, child_process, http, etc.
 *    - Can spawn and manage Aptos CLI commands
 *    - Can start/stop localnet instances
 *    - NO browser APIs (window, document, DOM, etc.)
 *
 * 2. SEQUENTIAL EXECUTION (fileParallelism: false, maxConcurrency: 1)
 *    - Tests run ONE AT A TIME, never in parallel
 *    - Why? Each test starts its own localnet on ports 8080/8081
 *    - Running in parallel = port conflicts = test failures
 *    - Total runtime: ~4-5 minutes for all meta tests
 *
 * 3. META TESTS PURPOSE
 *    - Verify localnet can start and respond
 *    - Test Aptos SDK basic operations
 *    - Document expected gas costs
 *    - Provide reference implementations
 *    - NOT testing application code
 *
 * 4. IMPORT PATHS IN META TESTS
 *    - Import from test-utils directly (not browser commands)
 *    - Example: `import { setupLocalnet, fundAccount } from "../../test-utils/localnet";`
 *    - These are Node.js functions, not browser commands
 *
 * 5. THIS IS NOT THE DEFAULT CONFIG
 *    - Running `npm test` will NOT run these tests
 *    - You must explicitly use --config flag
 *    - Don't try to run meta tests with default `npm test`
 *
 * WHAT META TESTS VERIFY:
 * - tests/meta/localnet.test.ts - Localnet health check
 * - tests/meta/faucet-ed25519.test.ts - Ed25519 account funding
 * - tests/meta/faucet-secp256k1.test.ts - SECP256k1 account funding
 * - tests/meta/transfer.test.ts - Basic APT transfers
 * - tests/meta/deploy-contract.test.ts - Simple contract deployment
 * - tests/meta/deploy-atomica-contracts.test.ts - Atomica contract deployment
 * - tests/meta/secp256k1-account.test.ts - SECP256k1 account operations
 *
 * SEE ALSO:
 * - tests/README.md#meta-tests - Overview of meta test infrastructure
 * - tests/meta/README.md - Detailed meta test documentation
 * - vitest.config.ts - Browser config for application tests
 * - test-utils/localnet.ts - Localnet management utilities
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * SEQUENTIAL EXECUTION: Tests run one at a time
     *
     * WHY? Each meta test starts its own localnet instance that binds to
     * ports 8080 (API) and 8081 (faucet). Running tests in parallel would
     * cause port conflicts.
     *
     * PERFORMANCE: This means longer total runtime (~4-5 minutes for all
     * meta tests), but ensures complete test isolation and reproducibility.
     *
     * See: tests/README.md#sequential-execution-required
     */
    fileParallelism: false,
    maxConcurrency: 1,

    /**
     * NODE.JS ENVIRONMENT: Tests run in Node.js (not browser)
     *
     * This provides:
     *   - Direct filesystem access for reading/writing files
     *   - child_process for spawning Aptos CLI commands
     *   - http/https for making network requests
     *   - System resource management (ports, processes)
     *
     * Meta tests need Node.js because they:
     *   - Start/stop localnet instances
     *   - Run Aptos CLI commands (compile, deploy, etc.)
     *   - Manage system processes and ports
     *   - Test infrastructure, not application code
     *
     * See: tests/meta/README.md#why-nodejs-tests
     */
    environment: "node",

    /**
     * INCLUDED TESTS: Only meta tests (infrastructure validation)
     *
     * Pattern: tests/meta/ ** /*.test.{ts,tsx} (without spaces)
     *
     * These tests verify the testing infrastructure works correctly:
     *   - Localnet can start and respond
     *   - Faucet can fund accounts
     *   - Transactions can be submitted
     *   - Contracts can be deployed
     *
     * See: tests/meta/README.md for full list and documentation
     */
    include: ["tests/meta/**/*.test.{ts,tsx}"],

    /**
     * EXCLUDED TESTS: test-utils are not tests
     *
     * test-utils/ contains utility functions used by tests, not tests themselves.
     */
    exclude: ["test-utils/**", "**/node_modules/**"],
  },
});
