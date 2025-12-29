# Testnet Test Suite

This test suite verifies the Docker testnet functionality including production-like faucet operations and comprehensive cleanup handling.

## Test Files

### `faucet.test.ts` - Production-Like Faucet ⭐

Tests the production-like faucet system that mimics mainnet behavior:

**Test Coverage:**
- Validator bootstrap with unlocked funds
- Single account funding via faucet
- Multiple account funding (load test)
- Balance verification
- Production parity validation

**Key Feature:** Uses validator transfers (not minting) to fund new accounts, exactly like production.

See **[../FAUCET.md](../FAUCET.md)** for faucet documentation.

### `probe_validators.ts` / `probe_accounts.ts` - Network Probes

Debug utilities for checking validator connectivity and account states.

## Test Coverage

### 1. Testnet Setup ✅
- `beforeAll` hook initializes a fresh 4-validator testnet
- Genesis generation and validator configuration
- Docker compose orchestration
- Network connectivity verification
- 5-minute timeout to handle image pulls

### 2. Testnet Evaluation ✅
The test suite verifies:

**Basic Functionality:**
- Correct number of validators
- Validator API connectivity
- LedgerInfo responses

**Consensus Operation:**
- Block production (waits for 5 blocks)
- All validators in the same epoch
- Validators synchronized within 5 blocks

**Metrics Validated:**
- `chain_id` = 4 (testnet)
- `node_role` = "validator"
- `epoch` >= 1
- `block_height` > 0

### 3. Cleanup & Teardown ✅

**Critical Feature: Guaranteed Cleanup**

The `afterAll` hook ensures cleanup in ALL scenarios:

#### Success Path:
```typescript
if (testnet) {
    await testnet.teardown();  // Calls 'docker compose down -v'
}
```

#### Failure Path:
If setup fails (`testnet` is undefined), the hook:
1. Detects the failure condition
2. Attempts manual cleanup: `docker compose down -v --remove-orphans`
3. Provides manual cleanup instructions if automated cleanup fails
4. Never throws to avoid masking the original error

**Why This Matters:**
- Prevents orphaned containers consuming resources
- Prevents port conflicts in subsequent test runs
- Ensures clean state for CI/CD pipelines

## Running the Tests

```bash
# From typescript-sdk directory
npm run build
npm test

# Run specific test file
npx bun test test/faucet.test.ts

# With debug logging
DEBUG_TESTNET=1 npm test

# Verbose output
npm test -- --verbose
```

## Faucet Tests

The faucet test suite demonstrates production-like account funding:

```typescript
// test/faucet.test.ts

describe("Production-Like Faucet", () => {
    beforeAll(async () => {
        testnet = await DockerTestnet.new(2);

        // Bootstrap validators with unlocked funds (ONE TIME)
        await testnet.bootstrapValidators(1_000_000_000_000n);
    });

    test("fund new account via faucet", async () => {
        const newAccount = new AptosAccount();

        // Use production-like faucet (validator transfer)
        await testnet.faucet(newAccount.address(), 100_000_000n);

        // Verify balance
        const balance = await coinClient.checkBalance(newAccount.address());
        expect(balance).toBe(100_000_000n);
    });
});
```

**Why This Matters:** The faucet uses standard transfers from validators, not privileged minting. Your test code works identically on mainnet!

## Manual Cleanup

If tests are interrupted (Ctrl+C, crash, etc.):

```bash
cd ../config
docker compose down -v --remove-orphans
```

## Test Output Example

```
Initializing testnet...
Setting up fresh Docker testnet with 4 validators...
Generating genesis for 4 validators...
  1/6 Generating layout...
  ...
✓ Testnet initialized successfully

✓ should have correct number of validators
✓ should check validator connectivity and LedgerInfo
  Validator 0: http://127.0.0.1:8080
    Chain ID: 4
    Epoch: 2
    Block Height: 45
    ...
✓ should verify block production
  Initial Height: 45
  Waiting for 5 blocks...
  Final Height: 51
✓ should verify all validators are in sync
  Epochs: 2, 2, 2, 2
  Block heights: 52, 52, 52, 53 (diff: 1)

Tearing down testnet...
✓ Testnet torn down successfully

4 tests passed
```

## Troubleshooting

### Test Hangs During Setup
- Check Docker daemon is running: `docker info`
- Verify network ports are available: `lsof -i :8080-8083`
- Check for existing containers: `docker compose ps`

### Test Fails with "Connection Refused"
- Validators may need more time to start
- Check logs: `docker compose logs validator-0`
- Verify config has `listen_address` in `validator_network` section

### Cleanup Fails
- Manually run: `docker compose down -v --remove-orphans`
- Check for stuck containers: `docker ps -a | grep atomica`
- Force remove: `docker rm -f $(docker ps -aq --filter name=atomica)`

## CI/CD Integration

The test suite is designed for CI/CD with:
- Timeouts to prevent hung pipelines
- Guaranteed cleanup even on failures
- Exit codes (0 = success, non-zero = failure)
- Structured logging for debugging

```yaml
# Example GitHub Actions
- name: Run testnet tests
  run: |
    cd source/docker-testnet/typescript-sdk
    npm install
    npm run build
    npm test
  timeout-minutes: 10
```
