# Atomica Web Test Infrastructure

## TL;DR - For AI Agents

**DO:**
- ✅ Run meta tests using: `npx vitest run --config vitest.config.nodejs.ts tests/meta/`
- ✅ Run browser tests using: `npm test` (default)
- ✅ Use `WEB_DIR = pathResolve(TEST_SETUP_DIR, "..")` to point to `atomica-web/` directory
- ✅ Test files use `.test.ts` or `.test.tsx` extension
- ✅ Keep tests sequential with `describe.sequential()` for anything using localnet
- ✅ Use browser commands from `test-utils/browser-commands.ts` for browser tests that need localnet
- ✅ Import from `../../test-utils/localnet` for Node.js meta tests
- ✅ Wait for transactions with `aptos.waitForTransaction()` before assertions
- ✅ Add 1-2 second delays after funding for indexing: `await new Promise(r => setTimeout(r, 1000))`

**DON'T:**
- ❌ Don't use `pathResolve(TEST_SETUP_DIR, "../..")` - this points to wrong directory!
- ❌ Don't run meta tests with default `npm test` - they're excluded from browser config
- ❌ Don't run tests in parallel if they use localnet - ports will conflict
- ❌ Don't forget to fund accounts before transactions
- ❌ Don't expect instant balance updates - allow time for indexing
- ❌ Don't create README.md files unless explicitly asked
- ❌ Don't use relative paths in `runAptosCmd` without understanding `cwd` parameter

---

## Overview

This directory contains all tests for the Atomica web application. Tests are organized into different categories based on what they test and how they run.

## Directory Structure

```
tests/
├── README.md                    # This file
├── meta/                        # Infrastructure validation tests (Node.js)
│   ├── README.md               # Detailed meta test documentation
│   ├── localnet.test.ts        # Localnet health check
│   ├── faucet-ed25519.test.ts  # Ed25519 faucet test
│   ├── faucet-secp256k1.test.ts # SECP256k1 faucet test
│   ├── transfer.test.ts        # Basic APT transfer
│   ├── deploy-contract.test.ts # Simple contract deployment
│   ├── deploy-atomica-contracts.test.ts # Atomica contract deployment
│   └── secp256k1-account.test.ts # SECP256k1 account operations
├── unit/                        # Unit tests (Browser/happy-dom)
│   ├── ibe.test.ts             # Identity-based encryption
│   ├── derived-address.test.ts # Address derivation
│   ├── siwe-signature.test.ts  # SIWE signature validation
│   └── ...
├── integration/                 # Integration tests (Browser + localnet)
│   ├── README.md               # Integration test documentation
│   ├── fake-minting/           # Fake token minting tests
│   └── wallet/                 # Wallet adapter tests
├── ui-component/                # UI component tests (Browser)
│   ├── AccountConnection.test.tsx
│   ├── AccountStatus.integration.test.tsx
│   ├── TxButton.*.test.tsx
│   └── ...
├── fixtures/                    # Test data and contracts
├── browser-utils/               # Browser-specific test utilities
└── utils/                       # Shared test utilities
```

## Test Categories

### 1. Meta Tests (`tests/meta/`)

**Environment**: Node.js
**Config**: `vitest.config.nodejs.ts`
**Run**: `npx vitest run --config vitest.config.nodejs.ts tests/meta/`

Infrastructure validation tests that verify the testing setup works correctly. These tests:

- Run in **Node.js environment** (not browser)
- Start their own localnet instances
- Test platform features, not application code
- Serve as reference implementations
- Document expected gas costs and behaviors

**Why Node.js?**
- Direct access to filesystem and child processes
- Can spawn and manage Aptos CLI commands
- Faster execution without browser overhead
- Can manage localnet lifecycle

See [meta/README.md](./meta/README.md) for detailed documentation.

### 2. Unit Tests (`tests/unit/`)

**Environment**: Browser (Chromium via Playwright)
**Config**: `vitest.config.ts`
**Run**: `npm test -- tests/unit/`

Pure logic tests that don't require DOM or network interaction:

- Cryptographic operations (IBE, signatures)
- Address derivation
- Data serialization/deserialization
- Utility functions

These tests run in a real browser environment but don't use browser-specific APIs.

### 3. Integration Tests (`tests/integration/`)

**Environment**: Browser (Chromium via Playwright)
**Config**: `vitest.config.ts`
**Run**: `npm test -- tests/integration/`

End-to-end tests that verify feature flows:

- Use real browser environment
- Call localnet via browser commands
- Test wallet integration
- Test contract interactions
- Test full user flows

**Browser commands** from `test-utils/browser-commands.ts`:
```typescript
import { commands } from 'vitest/browser';
await commands.setupLocalnet();
await commands.fundAccount(address, amount);
await commands.deployContracts();
```

See [integration/README.md](./integration/README.md) for details.

### 4. UI Component Tests (`tests/ui-component/`)

**Environment**: Browser (Chromium via Playwright)
**Config**: `vitest.config.ts`
**Run**: `npm test -- tests/ui-component/`

React component tests using React Testing Library:

- Component rendering
- User interactions
- State updates
- UI integration with wallet providers

## Test Configurations

### Browser Tests (Default)

**File**: `vitest.config.ts`

```typescript
{
  browser: {
    enabled: true,
    provider: playwright(),
    commands: { setupLocalnet, fundAccount, deployContracts, ... }
  },
  include: ["tests/**/*.test.{ts,tsx}"],
  exclude: ["tests/meta/**", "test-utils/**"]
}
```

**Includes**: All tests except `meta/`
**Environment**: Chromium browser via Playwright
**Run**: `npm test`

### Node.js Tests (Meta)

**File**: `vitest.config.nodejs.ts`

```typescript
{
  environment: "node",
  include: ["tests/meta/**/*.test.{ts,tsx}"],
  fileParallelism: false,
  maxConcurrency: 1
}
```

**Includes**: Only `tests/meta/`
**Environment**: Node.js
**Run**: `npx vitest run --config vitest.config.nodejs.ts tests/meta/`

## Running Tests

### All browser tests (default)
```bash
npm test
```

### Meta tests only
```bash
npx vitest run --config vitest.config.nodejs.ts tests/meta/
```

### Specific test file
```bash
npm test -- tests/unit/ibe.test.ts
npx vitest run --config vitest.config.nodejs.ts tests/meta/localnet.test.ts
```

### Watch mode
```bash
npm test -- --watch
```

### With verbose output
```bash
npm test -- --reporter=verbose
```

## Localnet Infrastructure

### Overview

Many tests require a local Aptos blockchain (localnet) running on:
- **Port 8080**: Aptos node API
- **Port 8081**: Faucet service

### Two Ways to Use Localnet

#### 1. Node.js Tests (Meta Tests)

Direct access to localnet utilities:

```typescript
import { setupLocalnet, fundAccount, runAptosCmd } from "../../test-utils/localnet";

describe.sequential("My Test", () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  it("should test something", async () => {
    const account = Account.generate();
    await fundAccount(account.accountAddress.toString(), 1_000_000_000);
    // ... test logic
  });
});
```

#### 2. Browser Tests (Integration/UI Tests)

Use browser commands that proxy to Node.js:

```typescript
import { commands } from 'vitest/browser';

describe.sequential("My Browser Test", () => {
  beforeAll(async () => {
    await commands.setupLocalnet();
  }, 120000);

  it("should test something", async () => {
    const address = "0x123...";
    await commands.fundAccount(address, 1_000_000_000);
    // ... browser test logic
  });
});
```

### Important Path Configuration

The `WEB_DIR` constant in `test-utils/localnet.ts` **must** point to the `atomica-web/` directory:

```typescript
// ✅ CORRECT
const TEST_SETUP_DIR = dirname(fileURLToPath(import.meta.url)); // test-utils/
const WEB_DIR = pathResolve(TEST_SETUP_DIR, ".."); // atomica-web/

// ❌ WRONG - points to parent of atomica-web!
const WEB_DIR = pathResolve(TEST_SETUP_DIR, "../..");
```

This is critical because:
- `runAptosCmd` uses `WEB_DIR` as default working directory
- Contract paths like `../atomica-move-contracts` are resolved relative to `WEB_DIR`
- Wrong path = "Unable to find package manifest" errors

### Sequential Execution Required

**ALL tests using localnet MUST run sequentially** using `describe.sequential()`:

```typescript
// ✅ CORRECT
describe.sequential("My Localnet Test", () => {
  // ... tests
});

// ❌ WRONG - will cause port conflicts!
describe("My Localnet Test", () => {
  // ... tests
});
```

**Why?** Localnet binds to fixed ports (8080, 8081). Running tests in parallel causes port conflicts.

## Test Utilities

### `test-utils/localnet.ts`

Core localnet management for Node.js tests:

- `setupLocalnet()` - Start localnet and wait for readiness
- `teardownLocalnet()` - Stop localnet (usually skipped in persistent mode)
- `killZombies()` - Clean up zombie processes and free ports
- `fundAccount(address, amount)` - Fund account via faucet
- `deployContracts()` - Deploy Atomica contracts
- `runAptosCmd(args, cwd?)` - Run Aptos CLI commands

### `test-utils/browser-commands.ts`

Browser command wrappers that proxy to Node.js:

- `setupLocalnetCommand` - Wraps `setupLocalnet()`
- `fundAccountCommand` - Wraps `fundAccount()`
- `deployContractsCommand` - Wraps `deployContracts()`
- `runAptosCmdCommand` - Wraps `runAptosCmd()`

These run on the Node.js side but can be called from browser tests via `commands.*`.

### `test-utils/findAptosBinary.ts`

Locates the Aptos CLI binary:

1. Checks `~/.cargo/bin/aptos` (global install)
2. Checks workspace target directory
3. Throws error if not found

### `tests/browser-utils/`

Browser-specific test utilities:

- `MockWallet.ts` - Mock Ethereum wallet provider for testing

## Common Patterns

### Creating and Funding Accounts

```typescript
// Generate account
const account = Account.generate();

// Fund it
await fundAccount(account.accountAddress.toString(), 1_000_000_000); // 10 APT

// Wait for indexing
await new Promise(r => setTimeout(r, 1000));

// Check balance
const balance = await aptos.getAccountAPTAmount({
  accountAddress: account.accountAddress
});
```

### Building Transactions

```typescript
const transaction = await aptos.transaction.build.simple({
  sender: sender.accountAddress,
  data: {
    function: "0x1::aptos_account::transfer",
    functionArguments: [recipient.accountAddress, amount],
  },
});

const pendingTxn = await aptos.signAndSubmitTransaction({
  signer: sender,
  transaction,
});

// ALWAYS wait for transaction before assertions
await aptos.waitForTransaction({
  transactionHash: pendingTxn.hash,
});
```

### Deploying Contracts

```typescript
await runAptosCmd([
  "move",
  "publish",
  "--package-dir",
  "../atomica-move-contracts", // Relative to WEB_DIR
  "--named-addresses",
  `atomica=${deployer.accountAddress.toString()}`,
  "--private-key",
  deployer.privateKey.toString(),
  "--url",
  "http://127.0.0.1:8080",
  "--assume-yes",
]);
```

## Common Pitfalls

### 1. Wrong Test Configuration

```bash
# ❌ WRONG - Meta tests excluded from default config
npm test -- tests/meta/localnet.test.ts

# ✅ CORRECT - Use Node.js config for meta tests
npx vitest run --config vitest.config.nodejs.ts tests/meta/localnet.test.ts
```

### 2. Wrong WEB_DIR Path

```typescript
// ❌ WRONG - Points to /source/ instead of /source/atomica-web/
const WEB_DIR = pathResolve(TEST_SETUP_DIR, "../..");

// ✅ CORRECT - Points to /source/atomica-web/
const WEB_DIR = pathResolve(TEST_SETUP_DIR, "..");
```

### 3. Parallel Execution

```typescript
// ❌ WRONG - Tests will conflict on ports
describe("Localnet Test", () => {
  beforeAll(async () => await setupLocalnet());
});

// ✅ CORRECT - Sequential execution
describe.sequential("Localnet Test", () => {
  beforeAll(async () => await setupLocalnet());
});
```

### 4. Missing Transaction Waits

```typescript
// ❌ WRONG - Balance won't be updated yet
const pendingTxn = await aptos.signAndSubmitTransaction(...);
const balance = await aptos.getAccountAPTAmount(...);

// ✅ CORRECT - Wait for transaction first
const pendingTxn = await aptos.signAndSubmitTransaction(...);
await aptos.waitForTransaction({ transactionHash: pendingTxn.hash });
await new Promise(r => setTimeout(r, 1000)); // Indexing delay
const balance = await aptos.getAccountAPTAmount(...);
```

### 5. Not Accounting for Gas Fees

```typescript
// ❌ WRONG - Sender paid gas!
expect(senderBalance).toBe(initialBalance - transferAmount);

// ✅ CORRECT - Account for gas
expect(senderBalance).toBeLessThan(initialBalance - transferAmount);
const gasUsed = initialBalance - senderBalance - transferAmount;
expect(gasUsed).toBeGreaterThan(0);
```

## Troubleshooting

### Port Conflicts

```bash
# Kill zombie processes
pkill -f 'aptos'

# Wait for ports to free
sleep 2

# Run tests again
npm test
```

### Tests Hanging

- Check localnet logs: `.aptos/testnet/validator.log`
- Increase timeout: `beforeAll(async () => {...}, 180000)` (3 min)
- Check system resources (localnet is CPU/memory intensive)

### Balance Mismatches

- Add delays after funding: `await new Promise(r => setTimeout(r, 1000))`
- Wait for transactions: `await aptos.waitForTransaction(...)`
- Account for gas fees in assertions
- Use ranges instead of exact values

### Contract Deployment Fails

- Verify `WEB_DIR` path is correct
- Check contract path is relative to `WEB_DIR`
- Ensure `Move.toml` exists in contract directory
- Check deployer has sufficient funds (>1 APT)

## Best Practices

### 1. Test Isolation

Each test should be completely independent:
- Generate new random accounts
- Don't rely on state from previous tests
- Clean up resources in `afterAll` (if needed)

### 2. Clear Logging

Help future developers debug:
```typescript
console.log(`Deployer address: ${deployer.accountAddress.toString()}`);
console.log(`Starting balance: ${balance}`);
console.log(`Gas used: ${gasUsed} octas`);
```

### 3. Document Behaviors

Explain what the test verifies and why:
```typescript
/**
 * Test: FakeEth Minting
 *
 * Verifies that users can mint FakeEth tokens using the fake_eth::mint function.
 * This is important because [reason].
 *
 * Expected behavior:
 * - User can mint any amount of FakeEth
 * - Balance updates correctly
 * - Gas cost is approximately X octas
 */
```

### 4. Use Sequential Execution

Always use `describe.sequential()` for tests using localnet:
```typescript
describe.sequential("My Test", () => {
  // ... tests
});
```

### 5. Handle Timing

Blockchain operations take time:
```typescript
// After funding
await new Promise(r => setTimeout(r, 1000));

// After transactions
await aptos.waitForTransaction({ transactionHash });
await new Promise(r => setTimeout(r, 1000));
```

## Contributing

When adding new tests:

1. **Choose the right category**:
   - Infrastructure validation → `tests/meta/`
   - Pure logic → `tests/unit/`
   - Feature flows → `tests/integration/`
   - React components → `tests/ui-component/`

2. **Use the right config**:
   - Node.js tests → `vitest.config.nodejs.ts`
   - Browser tests → `vitest.config.ts` (default)

3. **Follow patterns**:
   - Use `describe.sequential()` for localnet tests
   - Add delays for indexing
   - Wait for transactions
   - Account for gas fees
   - Log important information

4. **Document thoroughly**:
   - Explain what the test verifies
   - Document expected behaviors
   - Add inline comments for complex logic

5. **Update README**:
   - Add your test to the appropriate section
   - Document any new patterns or utilities
   - Update troubleshooting if needed

## See Also

- [Meta Tests Documentation](./meta/README.md)
- [Integration Tests Documentation](./integration/README.md)
- [Aptos TypeScript SDK](https://aptos.dev/sdks/ts-sdk/index)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
