# Production-Like Faucet for Aptos Docker Testnet

This testnet implements a **production-like faucet** that avoids magic accounts and minting privileges during normal operation.

## How It Works

### Genesis Phase
- Validators are created with **staked funds only** (locked for consensus)
- Root account (0xA550C18) exists but is ONLY for bootstrap

### Bootstrap Phase (One-Time Setup)
- Root account transfers unlocked funds to validators
- This simulates validators earning rewards in production
- After this, the root account is **never used again**

### Runtime (Production-Like)
- Validators have unlocked funds
- New accounts are funded by **validator transfers** (not minting)
- This exactly mimics production behavior

## API Usage

```typescript
import { DockerTestnet } from "@atomica/docker-testnet";

// 1. Start the testnet
const testnet = await DockerTestnet.new(4); // 4 validators

// 2. Bootstrap validators with unlocked funds (ONE TIME)
await testnet.bootstrapValidators(); // Gives 1,000,000 APT to each validator

// 3. Use the production-like faucet
const newAccount = new AptosAccount();
await testnet.faucet(newAccount.address(), 100_000_000n); // Fund with 1 APT

// That's it! The account is now funded and ready to use.
```

## Why This Approach?

### ❌ What We Avoid
- Using Core Resources (0xA550C18) for every transaction
- Calling privileged minting functions repeatedly
- Relying on magic accounts that don't exist in production

### ✅ What We Achieve
- **Production parity**: Existing accounts fund new ones via transfers
- **Realistic testing**: Code behaves identically to mainnet
- **Clean separation**: Root account only for initial bootstrap

## Comparison to Production

| Aspect | Production Mainnet | Our Testnet |
|--------|-------------------|-------------|
| Initial funds source | Foundation treasury / early investors | Root account (bootstrap only) |
| Validator funds | Staking rewards (unlocked) | Bootstrap transfer (unlocked) |
| New account funding | Transfer from existing account | Transfer from validator |
| Minting | None (after genesis) | None (after bootstrap) |
| Magic accounts | Don't exist | Only used at bootstrap |

## Methods

### `bootstrapValidators(amountPerValidator?)`
One-time setup to give validators unlocked funds.

```typescript
// Default: 100,000 APT per validator
await testnet.bootstrapValidators();

// Custom amount (in octas)
await testnet.bootstrapValidators(1_000_000_000_000n); // 10,000 APT
```

**When to call**: Once, after starting the testnet.

### `faucet(address, amount?)`
Fund a new account using validator transfers.

```typescript
// Default: 0.1 APT
await testnet.faucet(accountAddress);

// Custom amount (in octas)
await testnet.faucet(accountAddress, 500_000_000n); // 5 APT
```

**How it works**:
- Randomly selects a validator
- Transfers funds from that validator
- Auto-creates the account if it doesn't exist (via `aptos_account::transfer`)

### `getRootAccount()`
Get the root account for manual operations (use sparingly).

```typescript
const rootAccount = testnet.getRootAccount();
```

**WARNING**: Only use for bootstrap or debugging. Not production-like!

### `getValidatorAccount(index)`
Get a specific validator account.

```typescript
const validator0 = await testnet.getValidatorAccount(0);
```

**Use case**: Direct validator operations or manual testing.

## Advanced: Manual Faucet

If you need more control, you can implement your own faucet:

```typescript
import { AptosClient, CoinClient } from "aptos";

const validator = await testnet.getValidatorAccount(0);
const client = new AptosClient(testnet.validatorApiUrl(0));
const coinClient = new CoinClient(client);

// Fund a new account
const newAccount = new AptosAccount();
const txn = await coinClient.transfer(
    validator,
    newAccount.address(),
    100_000_000n // 1 APT
);
await client.waitForTransaction(txn);
```

This is exactly what the `faucet()` method does internally.

## Testing

See `test/faucet.test.ts` for complete examples:

```typescript
describe("Production-Like Faucet", () => {
    beforeAll(async () => {
        testnet = await DockerTestnet.new(2);
        await testnet.bootstrapValidators();
    });

    test("fund new account", async () => {
        const account = new AptosAccount();
        await testnet.faucet(account.address(), 100_000_000n);

        const balance = await coinClient.checkBalance(account.address());
        expect(balance).toBe(100_000_000n);
    });
});
```

## Key Insight

In production Aptos:
- No magic accounts with minting privileges
- All transfers are account-to-account
- Validators have unlocked funds (from rewards)

Our testnet:
- Uses root account ONCE for bootstrap (simulates foundation treasury)
- Validators have unlocked funds (simulates earned rewards)
- All subsequent operations are account-to-account transfers

**Result**: Your test code works identically on mainnet! 🎉
