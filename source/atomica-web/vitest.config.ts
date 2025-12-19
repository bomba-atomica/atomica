/**
 * Vitest Configuration - Browser Tests
 *
 * This is the DEFAULT configuration for running tests with `npm test`.
 *
 * WHAT IT DOES:
 * - Runs tests in a REAL BROWSER (Chromium via Playwright)
 * - Includes unit, integration, and UI component tests
 * - Excludes meta tests (which run in Node.js via vitest.config.nodejs.ts)
 * - Provides browser commands to interact with localnet from browser context
 *
 * WHEN TO USE THIS CONFIG:
 * ✅ Unit tests (tests/unit/)
 * ✅ Integration tests (tests/integration/)
 * ✅ UI component tests (tests/ui-component/)
 * ❌ Meta/infrastructure tests (use vitest.config.nodejs.ts instead)
 *
 * RUN COMMAND:
 *   npm test                                    # All browser tests
 *   npm test -- tests/unit/ibe.test.ts         # Specific test
 *   npm test -- --watch                        # Watch mode
 *
 * IMPORTANT NOTES FOR AI AGENTS:
 *
 * 1. SEQUENTIAL EXECUTION (fileParallelism: false, maxConcurrency: 1)
 *    - Tests run ONE AT A TIME, never in parallel
 *    - Why? Tests using localnet bind to fixed ports (8080, 8081)
 *    - Running in parallel = port conflicts = test failures
 *    - Always use `describe.sequential()` for tests using localnet
 *
 * 2. BROWSER COMMANDS (commands object)
 *    - Browser tests can call Node.js functions via `commands` API
 *    - Example: `import { commands } from 'vitest/browser'; await commands.setupLocalnet();`
 *    - These commands run on Node.js side but are callable from browser
 *    - Use these for localnet operations in browser tests
 *
 * 3. EXCLUDED TESTS (exclude: ["tests/meta/**"])
 *    - Meta tests are INTENTIONALLY excluded from this config
 *    - They run in Node.js environment via vitest.config.nodejs.ts
 *    - Don't try to run meta tests with `npm test` - use the Node.js config instead
 *
 * 4. TEST FILE PATTERN (include: ["tests/**/*.test.{ts,tsx}"])
 *    - All files matching *.test.ts or *.test.tsx
 *    - Except those in tests/meta/ and test-utils/
 *
 * SEE ALSO:
 * - tests/README.md - Complete test infrastructure documentation
 * - vitest.config.nodejs.ts - Node.js config for meta tests
 * - test-utils/browser-commands.ts - Browser command implementations
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import {
  setupLocalnetCommand,
  teardownLocalnetCommand,
  deployContractsCommand,
  fundAccountCommand,
  runAptosCmdCommand,
} from "./test-utils/browser-commands";

export default defineConfig({
  plugins: [react()],
  test: {
    /**
     * SEQUENTIAL EXECUTION: Tests run one at a time
     *
     * WHY? Tests using localnet bind to ports 8080/8081. Running in parallel
     * would cause port conflicts.
     *
     * IMPORTANT: Always use `describe.sequential()` in tests that use localnet!
     *
     * See: tests/README.md#sequential-execution-required
     */
    fileParallelism: false,
    maxConcurrency: 1,

    /**
     * BROWSER ENVIRONMENT: All tests run in real Chromium browser
     *
     * Tests run in an actual browser environment (not jsdom/happy-dom simulation).
     * This provides the most accurate testing environment for web applications.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * BROWSER COMMANDS: Critical Bridge Between Browser Tests and Node.js
     * ═══════════════════════════════════════════════════════════════════════
     *
     * THE PROBLEM:
     * Browser tests run in a browser context (Chromium), but some operations
     * MUST run in Node.js:
     *   - Starting/stopping localnet (requires spawning child processes)
     *   - Running Aptos CLI commands (requires filesystem and process access)
     *   - Funding accounts via faucet (requires HTTP server requests)
     *   - Deploying contracts (requires executing CLI commands)
     *
     * THE SOLUTION:
     * Vitest's browser mode provides a "commands" mechanism that allows browser
     * tests to call Node.js functions. This is a Remote Procedure Call (RPC)
     * system:
     *
     *   1. Test code runs in browser (Chromium)
     *   2. Test calls `commands.setupLocalnet()`
     *   3. Vitest sends RPC from browser to Node.js server
     *   4. Node.js executes setupLocalnetCommand() function
     *   5. Result is sent back to browser
     *   6. Test continues with result
     *
     * USAGE IN BROWSER TESTS:
     *
     *   import { commands } from 'vitest/browser';
     *
     *   describe.sequential("My Browser Test", () => {
     *     beforeAll(async () => {
     *       // This code runs in browser, but setupLocalnet() executes in Node.js
     *       await commands.setupLocalnet();
     *     }, 120000);
     *
     *     it("should test something", async () => {
     *       // Fund an account - this also executes in Node.js
     *       await commands.fundAccount("0x123...", 1_000_000_000);
     *
     *       // Now the browser test can interact with the funded account
     *       // using browser-side code (wallet provider, SDK, etc.)
     *     });
     *   });
     *
     * AVAILABLE COMMANDS:
     *
     *   commands.setupLocalnet()
     *     - Starts Aptos localnet on ports 8080 (API) and 8081 (faucet)
     *     - Kills zombie processes, waits for readiness
     *     - Executes in Node.js (browser can't spawn processes)
     *
     *   commands.fundAccount(address: string, amount?: number)
     *     - Funds an account via faucet HTTP endpoint
     *     - Executes in Node.js (browser can't make server-side HTTP requests)
     *
     *   commands.deployContracts()
     *     - Deploys Atomica contracts using Aptos CLI
     *     - Executes in Node.js (browser can't run CLI commands)
     *
     *   commands.runAptosCmd(args: string[], cwd?: string)
     *     - Runs arbitrary Aptos CLI commands
     *     - Executes in Node.js (browser can't access CLI)
     *
     * HOW IT WORKS UNDER THE HOOD:
     *
     *   Browser Test Code          Node.js Server
     *   ================          ===============
     *
     *   commands.setupLocalnet()  →  setupLocalnetCommand()
     *                                    ↓
     *                                 killZombies()
     *                                    ↓
     *                                 spawn("aptos node run-local-testnet")
     *                                    ↓
     *                                 wait for ports 8080/8081
     *                             ←  return { success: true }
     *   await result
     *   continue testing...
     *
     * WHY NOT RUN EVERYTHING IN NODE.JS?
     *
     * Browser tests NEED to run in a real browser because:
     *   - Testing React components requires DOM
     *   - Testing wallet integration requires window.ethereum
     *   - Testing UI interactions requires real browser events
     *   - Testing browser-side SDK usage requires browser APIs
     *
     * But certain infrastructure operations (localnet, CLI) CANNOT run in
     * a browser. Browser commands solve this by allowing the test flow
     * control to stay in the browser while delegating specific operations
     * to Node.js.
     *
     * COMPARISON WITH META TESTS:
     *
     * Meta tests (vitest.config.nodejs.ts) run ENTIRELY in Node.js:
     *   - Import from test-utils/localnet.ts directly
     *   - No browser context at all
     *   - No browser commands needed
     *   - Used for infrastructure validation only
     *
     * Browser tests (this config) run in browser with Node.js helpers:
     *   - Test code runs in browser
     *   - Browser commands proxy to Node.js
     *   - Used for application code testing
     *
     * IMPLEMENTATION DETAILS:
     *
     * Each command is defined in test-utils/browser-commands.ts:
     *
     *   export const setupLocalnetCommand: BrowserCommand<[]> = async () => {
     *     await setupLocalnet();  // Imported from test-utils/localnet.ts
     *     return { success: true };
     *   };
     *
     * The BrowserCommand type tells Vitest this function should be exposed
     * to browser tests via the commands API.
     *
     * See: test-utils/browser-commands.ts for command implementations
     * See: tests/README.md#localnet-infrastructure for usage patterns
     */
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: "chromium",
        },
      ],
      commands: {
        setupLocalnet: setupLocalnetCommand,
        teardownLocalnet: teardownLocalnetCommand,
        deployContracts: deployContractsCommand,
        fundAccount: fundAccountCommand,
        runAptosCmd: runAptosCmdCommand,
      },
    },

    /**
     * INCLUDED TESTS: All tests except meta tests
     *
     * Pattern: tests/ ** /*.test.{ts,tsx} (without spaces)
     * Includes:
     *   - tests/unit/ ** /*.test.ts
     *   - tests/integration/ ** /*.test.{ts,tsx}
     *   - tests/ui-component/ ** /*.test.tsx
     *
     * See: tests/README.md#test-categories
     */
    include: ["tests/**/*.test.{ts,tsx}"],

    /**
     * EXCLUDED TESTS: Meta tests run separately with Node.js config
     *
     * tests/meta/ ** tests are INTENTIONALLY excluded because they:
     *   - Run in Node.js environment (not browser)
     *   - Test infrastructure (not application code)
     *   - Need direct filesystem/process access
     *   - Use different config: vitest.config.nodejs.ts
     *
     * To run meta tests:
     *   npx vitest run --config vitest.config.nodejs.ts tests/meta/
     *
     * See: tests/README.md#meta-tests and tests/meta/README.md
     */
    exclude: ["tests/meta/**", "test-utils/**", "**/node_modules/**"],
  },
});
