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

### 5. `secp256k1-account.test.ts`
**Purpose**: SECP256k1 Ethereum-compatible account testing
**What it tests**: Creating and using SECP256k1 accounts (Ethereum-compatible) on Aptos

**Key assertions**:
- SECP256k1 accounts can be created using `SingleKeyAccount.generate({ scheme: SigningSchemeInput.Secp256k1Ecdsa })`
- Ed25519 accounts can transfer to SECP256k1 accounts (cross-key-type transfers)
- Transfers to non-existent SECP256k1 accounts automatically create them on-chain
- SECP256k1 accounts can sign and submit transactions
- Private keys are 32 bytes (same as Ed25519)
- Public keys are 65 bytes uncompressed (vs 32 bytes for Ed25519)
- Signatures are 64 bytes (same as Ed25519)
- Ethereum private keys can be used directly on Aptos

**Platform behaviors documented**:
- SECP256k1 and Ed25519 accounts are fully interoperable
- Both key types work identically from the user's perspective
- Aptos uses SHA3-256 for address derivation (different from Ethereum's Keccak-256)
- Same private key produces different addresses on Aptos vs Ethereum
- Account creation gas costs are the same regardless of key type (~103,400 octas)
- Transaction gas costs are the same for both key types

**SECP256k1 vs Ed25519 comparison**:
- **Ed25519**: Faster signature verification, smaller public keys (32 bytes), default on Aptos
- **SECP256k1**: Ethereum-compatible, same curve as Bitcoin, larger public keys (65 bytes)
- **Both**: Equal first-class citizens on Aptos, same transaction capabilities

**Use cases for SECP256k1**:
- Users with existing Ethereum private keys
- Cross-chain applications between Aptos and Ethereum
- Hardware wallets that support SECP256k1 but not Ed25519
- Integration with Ethereum wallet infrastructure

**Use this test to**:
- Learn how to create SECP256k1 accounts
- Understand cross-key-type transfers
- Reference Ethereum private key compatibility
- Verify SECP256k1 key properties and signature verification
- Understand differences between Aptos and Ethereum address derivation

**Note**: This test uses direct SECP256k1 accounts. For account abstraction that allows signing with MetaMask/Ethereum wallets using SIWE (Sign-In with Ethereum), see the `ethereum_derivable_account` module in the zapatos codebase.

**CRITICAL UX ISSUE - Address Mapping Requirement**:

When SECP256k1 accounts are created using Ethereum private keys, the Aptos address differs from the Ethereum address due to different hash functions (SHA3-256 vs Keccak-256). This creates a significant user experience problem.

**The Problem**:
- User has Ethereum address: `0xABC123...`
- Same private key on Aptos produces: `0xDEF456...` (completely different)
- User expects their address to be the same across chains
- Funds are NOT at the same address on both chains

**Required Solution - Address Mapping System**:

We need to implement a system to store, search, and identify the relationship between Ethereum addresses and their corresponding Aptos addresses:

1. **STORAGE** - Store bidirectional mappings:
   - Ethereum address (user's expected/familiar address)
   - Aptos address (actual on-chain location)
   - SECP256k1 public key
   - Account creation timestamp
   - Derivation method (direct SECP256k1 vs ethereum_derivable_account)

2. **SEARCH** - Enable bidirectional lookups:
   - ETH address → Aptos address (for user sending to Ethereum user)
   - Aptos address → ETH address (for displaying familiar address)
   - Public key → both addresses (for verification)

3. **IDENTIFICATION** - Display strategy for users:
   - Primary display: Ethereum address (what user recognizes)
   - Secondary display: Aptos address (where funds actually are)
   - Clear indication: "Your Ethereum wallet 0xABC... is mapped to Aptos address 0xDEF..."
   - Visual distinction between the two addresses

**Possible Implementation Approaches**:

a) **On-chain registry** (Move module):
   - Pros: Decentralized, persistent, verifiable
   - Cons: Gas costs, limited query flexibility
   - Structure: `Table<EthAddress, AptosAddress>` and reverse mapping

b) **Off-chain indexer** (Database):
   - Pros: Fast queries, rich search, no gas costs
   - Cons: Centralized, requires infrastructure
   - Tech: PostgreSQL with bidirectional indexes

c) **Client-side storage** (LocalStorage/IndexedDB):
   - Pros: No backend needed, privacy
   - Cons: Loses data across devices/browsers, not shareable

d) **Hybrid approach** (RECOMMENDED):
   - On-chain: Emit events when SECP256k1 accounts created
   - Off-chain: Indexer listens to events, builds searchable database
   - Client: Queries indexer for fast lookups, falls back to on-chain
   - Benefits: Best of both worlds - verifiable + performant

**Data Schema Example**:
```typescript
interface AddressMapping {
    ethereumAddress: string;      // 0xABC... (20 bytes, Keccak-256 derived)
    aptosAddress: string;          // 0xDEF... (32 bytes, SHA3-256 derived)
    publicKey: string;             // SECP256k1 public key (65 bytes uncompressed)
    derivationMethod: 'secp256k1' | 'ethereum_derivable_account';
    createdAt: number;             // Unix timestamp
    firstTransactionHash: string;  // First tx that created the account
}
```

**API Requirements**:
```typescript
// Query functions needed
getAptosByEthAddress(ethAddress: string): Promise<string>;
getEthByAptosAddress(aptosAddress: string): Promise<string>;
getMappingByPublicKey(publicKey: string): Promise<AddressMapping>;
getAllMappingsForUser(): Promise<AddressMapping[]>;
```

**UI/UX Recommendations**:
- Always show both addresses when relevant
- Use color coding or icons to distinguish ETH vs Aptos addresses
- Provide a "copy both addresses" button
- Show warning when user first connects: "Your Aptos address will be different"
- Include address mapping in account export/backup

**Integration Points**:
- Account creation flow (capture mapping immediately)
- Wallet connection (lookup existing mapping)
- Transaction display (show both sender/receiver addresses)
- Balance queries (translate between address formats)

This specification is critical for maintaining good UX when onboarding Ethereum users to Aptos with their existing wallets and private keys.

**Full Specification**: See `docs/technical/ethereum-address-mapping.md` for complete implementation details, code examples, and project roadmap.

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
4. `secp256k1-account.test.ts` - SECP256k1 account test (~35s)
5. `transfer.test.ts` - APT transfer test (~30s)

**Total runtime**: ~4-5 minutes

### Run individual test
```bash
npm test -- sanity/localnet.test.ts
npm test -- sanity/faucet-ed25519.test.ts
npm test -- sanity/transfer.test.ts
npm test -- sanity/deploy-contract.test.ts
npm test -- sanity/secp256k1-account.test.ts
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
// Ed25519 account (default)
const account = Account.generate();

// SECP256k1 account (Ethereum-compatible)
const secpAccount = SingleKeyAccount.generate({
    scheme: SigningSchemeInput.Secp256k1Ecdsa
});
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
