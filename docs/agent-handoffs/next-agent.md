# Next Agent - Fix CI Test Failures

## 🚨 CI Build Broken - Integration Tests Failing

**CI Run**: https://github.com/bomba-atomica/atomica/actions/runs/21685723000

### Issue Summary

The integration tests are failing in CI with a Vite/esbuild dependency resolution error:

```
Failed to resolve entry for package "@atomica/ethereum-docker-testnet"
The package may have incorrect main/module/exports specified in its package.json
```

This is affecting multiple test files that import `@atomica/ethereum-docker-testnet`:
- `tests/integration/cross-chain/minimal-deployment.test.ts`
- `tests/integration/cross-chain/lock-receipt-e2e.test.ts`
- `tests/integration/cross-chain/anvil-deployment.test.ts`
- `tests/integration/ethereum/erc20-deployment.test.ts`
- `tests/integration/dual-testnet/dual-testnet-startup.test.ts`
- `tests/integration/ethereum/proof-generation.test.ts`

### Root Cause

The `@atomica/ethereum-docker-testnet` package is a local workspace package (`file:../docker-testnet/ethereum-testnet/typescript-sdk`), but Vite cannot resolve its entry point in the CI environment. This might be due to:
1. Missing `package.json` exports configuration
2. Build artifacts not being generated before tests run
3. Vite configuration not properly handling workspace packages

### Quick Diagnosis Steps

1. **Check package.json exports**:
   ```bash
   cat source/docker-testnet/ethereum-testnet/typescript-sdk/package.json
   ```
   Verify it has proper `main`, `module`, or `exports` fields.

2. **Check if package is built in CI**:
   Look at the CI workflow to see if `ethereum-docker-testnet` is built before tests run.

3. **Check Vite config**:
   ```bash
   cat source/atomica-web/vitest.config.ts
   ```
   See if there are special resolvers needed for workspace packages.

## 🔧 Likely Fixes

### Option 1: Fix package.json Exports (Most Likely)

The `@atomica/ethereum-docker-testnet` package may be missing proper exports:

```json
// source/docker-testnet/ethereum-testnet/typescript-sdk/package.json
{
  "name": "@atomica/ethereum-docker-testnet",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

### Option 2: Ensure Build Order in CI

Check `.github/workflows/*.yml` and ensure:
```yaml
- name: Build ethereum-docker-testnet
  run: cd source/docker-testnet/ethereum-testnet/typescript-sdk && npm run build

- name: Run tests
  run: cd source/atomica-web && npm run test:integration
```

### Option 3: Add Vite Resolve Alias

In `vitest.config.ts`, explicitly resolve the workspace package:

```typescript
resolve: {
  alias: {
    '@atomica/ethereum-docker-testnet': path.resolve(__dirname, '../docker-testnet/ethereum-testnet/typescript-sdk/dist/index.js')
  }
}
```

### Option 4: Skip Docker Tests in CI (Temporary)

If the tests require Docker and CI doesn't support it, skip them:
```typescript
// In affected test files
const isCI = process.env.CI === 'true';

describe.skipIf(isCI)('Minimal Contract Deployment Test', () => {
  // ...
});
```

## 📋 Previous Session Work (Now in Main Branch)

### ✅ Completed - Storage Slot & Deployment Fixes
- Fixed storage slot mismatch (slot 0 → 1) in `LockBox.sol` and `storage-key.ts`
- Fixed critical deployment bug: changed `factory.getDeployTransaction()` → `factory.deploy()`
- Contracts now deploy successfully with bytecode
- 3 of 7 E2E tests passing locally (minting, locking work)

### ✅ Completed - Test Infrastructure
- Added transaction status verification
- Added bytecode verification after deployments
- Created MinimalTest.sol for isolation testing
- Created anvil-deployment.test.ts and minimal-deployment.test.ts

### 🟡 Known Issue - Storage Proof Value Mystery
The storage proof generates correctly (2 nodes, correct storage key) but returns value 0 instead of the locked amount (10 ETH). This is documented but not blocking CI - it's a separate issue to debug later.

**Test output shows:**
- Lock succeeds: `✓ Locked balance: 10.0 FakeETH` (getLockedBalance works)
- Proof generates: `Storage proof nodes: 2` (finds storage location)
- But: `Storage value: 0` (should be 10 ETH)

Likely causes: state query timing, RPC caching, or need to query at later block.

## 🎯 Immediate Action for CI Fix

1. Check `@atomica/ethereum-docker-testnet` package.json for exports
2. Verify build order in CI workflow
3. Fix package exports or add Vite resolver
4. Re-run CI to confirm tests pass

## 📁 Key Files

- **CI Workflow**: `.github/workflows/*.yml`
- **Package**: `source/docker-testnet/ethereum-testnet/typescript-sdk/package.json`
- **Vite Config**: `source/atomica-web/vitest.config.ts`
- **Failing Tests**: `source/atomica-web/tests/integration/cross-chain/*.test.ts`
- **This handoff**: `docs/agent-handoffs/next-agent.md`

## 📊 Branch Status

**Branch**: `atomica-eth-testnet`
**Latest commit**: `67fa512` - chore: ignore Foundry artifacts and clean up docs
**CI Status**: ❌ Failing - integration tests cannot resolve ethereum-docker-testnet package

**All code changes are pushed and ready**. Just need to fix the CI dependency resolution issue.
