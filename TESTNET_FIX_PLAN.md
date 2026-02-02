# Aptos Testnet Test Infrastructure Fix Plan

## Executive Summary

**Status**: Partial fix complete. CI still failing on aptos-testnet integration tests.

**What's Fixed**:
- ✅ Replaced jsdom with Playwright browser mode for all web packages
- ✅ Migrated test imports from `bun:test` to `vitest`
- ✅ Fixed workflow to use `bunx vitest` instead of bare `vitest`
- ✅ Applied strict ESLint rules across all TypeScript packages
- ✅ All lint and format checks passing

**What's Broken**:
- ❌ Aptos testnet integration tests failing in CI
- ❌ 4 test files importing from non-existent helper functions
- ❌ Docker container cleanup issues causing conflicts

---

## Current CI Status

### Passing:
- State Proof Verifier ✅
- Lint Web Packages ✅
- EVM Contracts CI ✅
- Web Demo unit tests (local) ✅
- Web Demo component tests (local) ✅

### Failing:
- Aptos Testnet SDK Tests ❌
- Web Demo UI tests (references non-existent AccountConnection.test.tsx) ❌

---

## Root Cause Analysis

### Issue 1: Non-Existent Helper Functions

**Location**: `source/docker-testnet/aptos-testnet/test/helpers/testnet-lifecycle.ts`

**Problem**:
This helper file imports functions that don't exist in the codebase:
```typescript
import { startTestnet, stopTestnet } from "../src/index";
```

But `src/index.ts` does NOT export `startTestnet` or `stopTestnet`.

**Affected Test Files** (4 total):
1. `test/block-production.test.ts`
2. `test/faucet.test.ts`
3. `test/validator-connectivity.test.ts`
4. `test/validator-sync.test.ts`

These tests import non-existent functions from the helper:
```typescript
import {
    registerCleanupHandlers,
    setGlobalTestnet,
    initializeTestnet,
    performCleanup,
    waitForNetworkStabilization,
} from "./helpers/testnet-lifecycle";
```

**Reality**: The helper only exports `setupTestnet()` and `teardownTestnet()`, both of which call non-existent functions.

### Issue 2: Docker Container Conflicts

**Error**: `Container name "/atomica-validator-2" is already in use`

**Cause**: Tests not properly cleaning up Docker resources between runs.

**Impact**: Tests fail in CI when multiple test files run sequentially, or when re-running failed tests.

### Issue 3: Genesis Generation Failures

**Error**: `mkdir: cannot create directory 'genesis-repo': No such file or directory`

**Cause**: Working directory issues or race conditions in genesis script.

**Impact**: Tests fail during setup phase before they can even run assertions.

---

## What Actually Works

### Working Tests:
- `test/localnet.test.ts` ✅ - Uses correct imports from `../src/localnet`
- `test/deploy-atomica-contracts.test.ts` ✅ - Uses `setupLocalnet`, `fundAccount` from `../src/localnet`
- `test/deploy-contract.test.ts` ✅ - Uses correct imports
- `test/docker-testnet.test.ts` ✅ - Uses `DockerTestnet` class directly
- `test/faucet-ed25519.test.ts` ✅ - Uses `setupLocalnet`, `fundAccount`
- `test/faucet-secp256k1.test.ts` ✅ - Uses correct imports
- `test/secp256k1-account.test.ts` ✅ - Uses correct imports
- `test/transfer.test.ts` ✅ - Uses correct imports

### Correct Import Pattern:
```typescript
import { setupLocalnet, fundAccount, getTestnet } from "../src/localnet";
import { DockerTestnet } from "../src/index";
```

### What's Exported from `src/localnet.ts`:
```typescript
export function getTestnet(): DockerTestnet
export async function setupLocalnet(numValidators: number = 4): Promise<DockerTestnet>
export async function fundAccount(address: string, amount: number): Promise<void>
```

---

## Fix Plan

### Phase 1: Delete Broken Helper and Fix Imports

**Goal**: Remove the broken helper file and update the 4 failing test files to use correct imports.

**Steps**:

1. **Delete the broken helper**:
   ```bash
   rm source/docker-testnet/aptos-testnet/test/helpers/testnet-lifecycle.ts
   ```

2. **Fix `test/faucet.test.ts`**:
   - Remove imports from `./helpers/testnet-lifecycle`
   - Add correct imports:
     ```typescript
     import { setupLocalnet, fundAccount, getTestnet } from "../src/localnet";
     ```
   - Replace:
     - `initializeTestnet(NUM_VALIDATORS)` → `setupLocalnet(NUM_VALIDATORS)`
     - `registerCleanupHandlers()` → Remove (not needed)
     - `setGlobalTestnet(undefined)` → Remove (not needed)
     - `performCleanup()` → `await testnet.teardown()`
     - `waitForNetworkStabilization()` → Remove or implement simple wait

3. **Fix `test/block-production.test.ts`**:
   - Same pattern as above
   - Use `setupLocalnet()` and `testnet.teardown()`

4. **Fix `test/validator-connectivity.test.ts`**:
   - Same pattern as above

5. **Fix `test/validator-sync.test.ts`**:
   - Same pattern as above

**Reference Working Pattern** (from `test/deploy-atomica-contracts.test.ts`):
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet, fundAccount, getTestnet } from "../src/localnet";

describe.sequential("Deploy Atomica Contracts", () => {
  beforeAll(async () => {
    await setupLocalnet(4);
  }, 180000);

  afterAll(async () => {
    const testnet = getTestnet();
    await testnet.teardown();
  });

  it("should deploy and initialize contracts", async () => {
    const testnet = getTestnet();
    // ... test code ...
  });
});
```

### Phase 2: Fix Docker Cleanup Issues

**Goal**: Ensure Docker containers are properly cleaned up between test runs.

**Investigation Needed**:
1. Check if `testnet.teardown()` is being called in all `afterAll` hooks
2. Verify `teardown()` actually removes containers (not just stops them)
3. Add error handling in teardown to prevent cleanup failures from masking test failures

**Potential Fix** (in `src/index.ts` or `src/localnet.ts`):
```typescript
export async function cleanupAllTestnets(): Promise<void> {
  // Force remove all atomica-* containers and networks
  await exec("docker rm -f $(docker ps -a -q --filter 'name=atomica-') 2>/dev/null || true");
  await exec("docker network rm $(docker network ls -q --filter 'name=atomica-') 2>/dev/null || true");
  await exec("docker volume rm $(docker volume ls -q --filter 'name=atomica-') 2>/dev/null || true");
}
```

Add to `beforeAll` in tests:
```typescript
beforeAll(async () => {
  await cleanupAllTestnets(); // Clean slate
  await setupLocalnet(4);
}, 180000);
```

### Phase 3: Fix Genesis Generation Issues

**Goal**: Ensure genesis script can create directories reliably.

**Investigation**:
1. Check if working directory is set correctly when genesis script runs
2. Verify Docker volume mounts are correct
3. Add better error messages to genesis script

**Potential Fix** (in `src/genesis.ts`):
- Add explicit working directory check before running genesis
- Ensure genesis runs in a clean temp directory
- Add retry logic for directory creation

### Phase 4: Fix Web Demo UI Tests

**Goal**: Remove or fix reference to non-existent `AccountConnection.test.tsx`

**Steps**:

1. **Check if file exists**:
   ```bash
   ls source/atomica-web-ui/tests/AccountConnection.test.tsx*
   ```

2. **Option A** (if file exists with `.skip` extension):
   - Remove the `.skip` extension
   - Fix the test to not import non-existent `App` component
   - Or delete it if it's fundamentally broken

3. **Option B** (if file doesn't exist):
   - Update workflow to remove this test from the UI test list:
     ```yaml
     bunx vitest run tests/AccountStatus.test.tsx tests/TxButton.skip-submit.test.tsx
     ```

---

## Testing Strategy

### Local Testing Sequence:
```bash
# 1. Test individual fixed files
cd source/docker-testnet/aptos-testnet
bunx vitest run test/faucet.test.ts --reporter=verbose

# 2. Test all aptos-testnet tests
bun run test

# 3. Test web demo
cd ../atomica-web-demo
bunx vitest run tests/simple.test.ts tests/app-component.test.tsx
```

### CI Validation:
- Push changes and check CI run
- All test jobs should pass:
  - Aptos Testnet SDK Tests ✅
  - Web Demo Tests (unit) ✅
  - Web Demo Tests (ui) ✅
  - State Proofs Tests ✅

---

## Acceptance Criteria

- [ ] All 4 broken test files (`faucet`, `block-production`, `validator-connectivity`, `validator-sync`) fixed
- [ ] `testnet-lifecycle.ts` helper deleted (no longer needed)
- [ ] All aptos-testnet tests pass locally
- [ ] No Docker container conflicts between test runs
- [ ] CI passes for "Test Web (TypeScript/Vitest)" workflow
- [ ] No import errors for non-existent functions
- [ ] Docker cleanup working reliably

---

## Agent Prompt

**Task**: Fix the 4 failing aptos-testnet integration tests that import from a broken helper file.

**Context**:
- The helper `test/helpers/testnet-lifecycle.ts` imports non-existent functions `startTestnet` and `stopTestnet`
- Four test files import from this helper and use functions that don't exist
- Working tests show the correct pattern: import from `../src/localnet` and use `setupLocalnet()`, `getTestnet()`, `testnet.teardown()`

**Steps**:
1. Delete `source/docker-testnet/aptos-testnet/test/helpers/testnet-lifecycle.ts`
2. Fix the 4 test files to import from `../src/localnet` instead
3. Replace non-existent function calls with correct equivalents:
   - `initializeTestnet(n)` → `setupLocalnet(n)`
   - `performCleanup()` → `await testnet.teardown()`
   - Remove: `registerCleanupHandlers()`, `setGlobalTestnet()`, `waitForNetworkStabilization()`
4. Use `test/deploy-atomica-contracts.test.ts` as the reference pattern
5. Test each file individually with `bunx vitest run test/<file>.test.ts`
6. Run full test suite with `bun run test`
7. Commit with message: "Fix: Replace broken testnet-lifecycle helper with correct localnet imports"

**Files to modify**:
- `test/faucet.test.ts`
- `test/block-production.test.ts`
- `test/validator-connectivity.test.ts`
- `test/validator-sync.test.ts`

**Expected outcome**: All aptos-testnet tests pass locally and in CI.

---

## Additional Notes

### Why This Happened:
- The `testnet-lifecycle.ts` helper was likely created as a template/placeholder
- It was never implemented with actual working function calls
- Some tests followed the working pattern (importing from `localnet.ts`)
- Others tried to use the broken helper
- The migration to Vitest exposed these latent bugs

### Prevention:
- Add CI check that runs aptos-testnet tests (already exists, just currently failing)
- Ensure all tests pass before merging refactors
- Consider adding a "no dead code" lint rule to catch unused helpers

### Related Work:
- All other test infrastructure has been fixed
- jsdom → Playwright migration complete
- ESLint strict mode enforced
- This is the last remaining blocker for full CI green status

---

## Success Metrics

**Before Fix**:
- ❌ Test Web CI: 4 jobs failing
- ❌ 29 test files with broken imports
- ❌ Docker cleanup failing

**After Fix**:
- ✅ Test Web CI: All jobs passing
- ✅ 0 import errors
- ✅ Docker cleanup working
- ✅ All local tests passing
- ✅ Full CI pipeline green

---

*Document created*: 2026-01-29
*Last updated*: 2026-01-29
*Priority*: HIGH - Blocking CI
*Estimated effort*: 2-3 hours
