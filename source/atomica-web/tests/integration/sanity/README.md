# Sanity Test Suite

## Overview

This directory contains **clean room tests** of the underlying Aptos platform features. These tests serve as:

1. **Reference implementations** - Examples of how to interact with core Aptos functionality
2. **Sanity checks** - Verification that the local testnet and platform features work correctly
3. **Documentation** - Living documentation of expected behavior and gas costs

## Philosophy

These tests follow **clean room testing** principles:

- **Isolated**: Each test runs independently with its own localnet instance
- **No side effects**: Tests avoid operations that create implicit state changes
- **Reproducible**: Starting from zero state, tests produce consistent results
- **Well-documented**: Each test explains what it does, why, and what to expect

## Test Files

### 1. `localnet.test.ts`
**Purpose**: Localnet health check
**What it tests**: Verifies the local testnet starts correctly and has the expected configuration

**Key assertions**:
- Chain ID is 4 (local testnet identifier)
- Ledger info is accessible

**Use this test to**:
- Verify your development environment is set up correctly
- Debug localnet startup issues
- Confirm network connectivity

---

### 2. `faucet-ed25519.test.ts`
**Purpose**: Account funding via faucet
**What it tests**: The faucet can fund newly generated Ed25519 accounts

**Key assertions**:
- New accounts start with 0 balance
- Faucet successfully funds accounts with requested amount
- Funded amount appears correctly in account balance

**Platform behaviors documented**:
- New accounts return balance 0 (not an error)
- Faucet transactions follow standard transaction lifecycle
- Default funding: 100,000,000 octas (1 APT)

**Use this test to**:
- Learn how to generate new accounts
- Understand the faucet funding flow
- Reference account balance queries

---

### 3. `transfer.test.ts`
**Purpose**: Simple APT transfer between accounts
**What it tests**: Basic token transfers using `0x1::aptos_account::transfer`

**Key assertions**:
- Sender account can transfer APT to recipient
- Recipient receives exact transfer amount
- Sender pays gas fees
- Transaction succeeds

**Platform behaviors documented**:
- Transfer automatically creates recipient account if it doesn't exist
- Account creation increases gas cost (~103,400 octas vs ~1,000 for existing accounts)
- Gas fees are deducted from sender's balance
- Transaction lifecycle: build → sign → submit → wait for confirmation

**Use this test to**:
- Learn the basic transaction flow
- Understand gas fee mechanics
- Reference transfer implementation

---

### 4. `deploy-contract.test.ts`
**Purpose**: Move smart contract deployment
**What it tests**: Compiling and deploying Move modules to the blockchain

**Key assertions**:
- Move modules can be compiled and published
- Published modules are queryable on-chain
- Module ABIs contain expected functions
- Deployment costs gas

**Platform behaviors documented**:
- No `aptos init` needed (uses direct CLI flags for clean room testing)
- Named addresses are resolved at publish time
- Modules are deployed to the publisher's address
- Deployment gas cost: ~167,900 octas for simple modules
- Modules are immutable once deployed

**Use this test to**:
- Learn the contract deployment workflow
- Understand named address resolution
- Reference clean room deployment (no side effects)
- Estimate deployment gas costs

---

## Running the Tests

**IMPORTANT**: These tests run **sequentially** (one at a time), not in parallel. This is enforced by the vitest configuration (`fileParallelism: false`). Each test starts its own localnet instance on ports 8080/8081, so running multiple tests simultaneously would cause port conflicts.

### Run all sanity tests
```bash
npm test -- sanity/
```

The tests will run sequentially in this order:
1. `deploy-contract.test.ts` - Contract deployment test (~75s)
2. `faucet-ed25519.test.ts` - Faucet funding test (~30s)
3. `localnet.test.ts` - Health check test (~30s)
4. `transfer.test.ts` - APT transfer test (~30s)

**Total runtime**: ~3-4 minutes

### Run individual test
```bash
npm test -- sanity/localnet.test.ts
npm test -- sanity/faucet-ed25519.test.ts
npm test -- sanity/transfer.test.ts
npm test -- sanity/deploy-contract.test.ts
```

### Debug a specific test
```bash
npm test -- sanity/transfer.test.ts --reporter=verbose
```

### Why sequential execution?
Each test spins up a complete localnet instance that binds to specific ports (8080 for the API, 8081 for the faucet). Running tests in parallel would cause port conflicts. All sanity tests use `describe.sequential()` to enforce sequential execution within the suite.

## Test Isolation

Each test:
- Starts its own localnet instance in `beforeAll()`
- Tears down the localnet in `afterAll()`
- Uses fresh, randomly generated accounts
- Logs detailed output for debugging

## Expected Gas Costs

Based on the sanity tests, here are typical gas costs for reference:

| Operation | Gas Cost (octas) | Notes |
|-----------|------------------|-------|
| Faucet funding | N/A | Free operation |
| Transfer to new account | ~103,400 | Includes account creation |
| Transfer to existing account | ~1,000 | Estimated (not tested) |
| Deploy simple contract | ~167,900 | For noop module (677 bytes) |

**Note**: Gas costs may vary based on:
- Network congestion
- Transaction complexity
- Account state
- Module size (for deployments)

## Common Patterns

### 1. Generating accounts
```typescript
const account = Account.generate();
```

### 2. Funding accounts
```typescript
await fundAccount(account.accountAddress.toString(), 1_000_000_000);
```

### 3. Checking balance
```typescript
const balance = await aptos.getAccountAPTAmount({
    accountAddress: account.accountAddress
});
```

### 4. Building transactions
```typescript
const txn = await aptos.transaction.build.simple({
    sender: sender.accountAddress,
    data: {
        function: "0x1::aptos_account::transfer",
        functionArguments: [recipient.accountAddress, amount],
    },
});
```

### 5. Signing and submitting
```typescript
const pendingTxn = await aptos.signAndSubmitTransaction({
    signer: sender,
    transaction: txn,
});
```

### 6. Waiting for confirmation
```typescript
const response = await aptos.waitForTransaction({
    transactionHash: pendingTxn.hash
});
```

## Troubleshooting

### Localnet won't start
- Check if port 8080 or 8081 is already in use
- Kill zombie processes: `pkill -f 'aptos node run-local-testnet'`
- Check logs at `~/.aptos/testnet/validator.log`

### Test timeout
- Increase timeout in test: `it('test name', async () => { ... }, 120000)`
- Check network connectivity
- Verify Aptos CLI is installed and accessible

### Balance mismatch
- Remember to account for gas fees in assertions
- Use ranges instead of exact values for sender's final balance
- Gas costs can vary slightly between runs

## Contributing

When adding new sanity tests:

1. **Follow clean room principles** - No side effects, isolated state
2. **Document thoroughly** - Explain what, why, and expected behavior
3. **Log key information** - Help future developers debug
4. **Test one thing** - Keep tests focused and simple
5. **Update this README** - Add your test to the documentation

## See Also

- [Aptos TypeScript SDK Documentation](https://aptos.dev/sdks/ts-sdk/index)
- [Move Language Documentation](https://move-language.github.io/move/)
- [Aptos CLI Reference](https://aptos.dev/tools/aptos-cli/use-cli/use-aptos-cli)
