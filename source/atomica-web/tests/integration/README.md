# Integration Tests

This directory contains integration tests for the Atomica web application and the underlying Aptos platform.

## Directory Structure

```
tests/integration/
├── README.md                    # This file
├── sanity/                      # Platform sanity tests (clean room)
│   ├── README.md               # Detailed sanity test documentation
│   ├── localnet.test.ts        # Localnet health check
│   ├── faucet-ed25519.test.ts  # Faucet funding test
│   ├── transfer.test.ts        # APT transfer test
│   └── deploy-contract.test.ts # Contract deployment test
├── flow.test.ts                # Application flow test
└── fixtures/                   # Test data and contracts
    └── noop/                   # Simple test contract
```

## Test Categories

### Sanity Tests (`sanity/`)
Clean room tests of the underlying Aptos platform features. These tests serve as:
- **Reference implementations** - Examples of how to use core Aptos functionality
- **Platform verification** - Ensures the localnet and platform features work correctly
- **Documentation** - Living examples of expected behavior and gas costs

See [`sanity/README.md`](./sanity/README.md) for detailed documentation.

### Application Tests
Tests for application-specific functionality:
- `flow.test.ts` - End-to-end auction flow test

## Runtime Environment

**All integration tests run in Node.js environment** (not browser/happy-dom).

Every integration test file includes:
```typescript
// @vitest-environment node
```

This is required because integration tests:
- Spawn child processes (`aptos` CLI)
- Use Node.js HTTP/networking APIs
- Access the file system
- Manage system resources (ports, processes)

Unit tests and component tests use the default `happy-dom` environment (simulated browser) configured in `vitest.config.ts`.

**See [`tests/RUNTIME_ENVIRONMENTS.md`](../RUNTIME_ENVIRONMENTS.md) for detailed explanation of test environments.**

## Sequential Execution

**ALL integration tests run sequentially, never in parallel.** This is enforced using Vitest's `describe.sequential()`:

```typescript
// Each integration test uses describe.sequential()
describe.sequential('Test Name', () => {
  beforeAll(async () => {
    await setupLocalnet();
  }, 120000);

  // ... tests
});
```

### Why Sequential?

Integration tests start their own localnet instances that bind to fixed ports:
- **Port 8080** - Aptos node API
- **Port 8081** - Faucet API
- **Port 8070** - Readiness endpoint

Running tests in parallel would cause port conflicts and test failures.

### Performance Impact

Sequential execution means longer total test runtime:
- Each test must wait for the previous test to complete
- Each test starts/stops its own localnet instance (~25-30s overhead per test)
- Total sanity test suite: ~3-4 minutes

This trade-off ensures:
- Complete test isolation
- Clean room conditions
- Reproducible results
- No shared state between tests

## Running Tests

### Run all integration tests
```bash
npm test -- integration/
```

Tests will run sequentially in alphabetical order by filename.

### Run sanity tests only
```bash
npm test -- sanity/
```

### Run specific test
```bash
npm test -- flow.test.ts
npm test -- sanity/transfer.test.ts
```

### Run with verbose output
```bash
npm test -- integration/ --reporter=verbose
```

## Writing New Integration Tests

When adding new integration tests:

1. **Use `setupLocalnet()` and `teardownLocalnet()`** in `beforeAll`/`afterAll`
2. **Expect sequential execution** - Don't assume tests run in parallel
3. **Don't share state** - Each test should be completely independent
4. **Document your test** - Explain what it tests and why
5. **Consider test placement**:
   - Platform/reference tests → `sanity/`
   - Application-specific tests → root `integration/` directory

### Example Test Structure

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLocalnet, teardownLocalnet } from '../setup/localnet';

// IMPORTANT: Use describe.sequential() for integration tests
describe.sequential('My Integration Test', () => {
    beforeAll(async () => {
        await setupLocalnet();
    }, 120000); // 2 min timeout for localnet startup

    afterAll(async () => {
        await teardownLocalnet();
    });

    it('should test something', async () => {
        // Your test here
    });
});
```

## Troubleshooting

### Port already in use
If tests fail with port conflicts:
```bash
# Kill any zombie localnet processes
pkill -f 'aptos node run-local-testnet'

# Wait a moment for ports to be released
sleep 2

# Run tests again
npm test -- integration/
```

### Tests hanging
- Check the localnet logs: `~/.aptos/testnet/validator.log` or `.aptos/testnet/validator.log`
- Increase timeout if needed (especially for first-time git dependency downloads)
- Ensure you have enough system resources (localnet is resource-intensive)

### Tests failing intermittently
- May be related to timing/indexing delays
- Check if balance queries need more retry attempts
- Ensure you're using `waitForTransaction()` before checking results

## CI/CD Considerations

When running integration tests in CI/CD:

1. **Allocate sufficient resources** - Localnet needs reasonable CPU/memory
2. **Increase timeouts** - First run downloads git dependencies (~60-120s)
3. **Cache dependencies** - Cache `tests/fixtures/noop/.aptos` if possible
4. **Sequential execution** - Already enforced by vitest config
5. **Clean up** - Ensure `afterAll` hooks run even on failure

## See Also

- [Sanity Test Documentation](./sanity/README.md) - Detailed documentation of platform tests
- [Aptos TypeScript SDK](https://aptos.dev/sdks/ts-sdk/index)
- [Vitest Documentation](https://vitest.dev/)
