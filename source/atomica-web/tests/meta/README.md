# Meta Test Suite

## Overview

This directory contains **meta tests** that verify the testing infrastructure and platform dependencies. These tests run in a **Node.js environment** (not the browser) and serve as:

1. **Infrastructure validation** - Verification that localnet, Aptos CLI, and testing utilities work correctly
2. **Dependency checks** - Confirmation that core Aptos SDK features function as expected
3. **Reference implementations** - Clean examples of basic Aptos operations
4. **Documentation** - Living documentation of expected behavior and gas costs

## Why Node.js Tests?

These tests intentionally run in Node.js rather than the browser environment because:

- **They don't test production code** - These verify testing infrastructure, not application logic
- **They require Node.js APIs** - Direct access to filesystem, child processes, and system utilities
- **They manage localnet** - Starting/stopping Aptos localnet requires Node.js process control
- **They're faster** - No browser overhead for infrastructure validation
- **They're simpler** - No need for browser compatibility or DOM APIs

**Production web application tests** (unit, integration, UI component) run in the browser environment using Playwright. Meta tests are specifically for infrastructure validation only.

## Test Configuration

Meta tests use a dedicated Vitest configuration:

- **Config file**: `vitest.config.nodejs.ts`
- **Environment**: Node.js (not browser)
- **Execution**: Sequential (`fileParallelism: false`, `maxConcurrency: 1`)
- **Run command**: `npm run test:meta`

## Philosophy

These tests follow **clean room testing** principles:

- **Isolated**: Each test runs independently with its own localnet instance
- **No side effects**: Tests avoid operations that create implicit state changes
- **Reproducible**: Starting from zero state, tests produce consistent results
- **Well-documented**: Each test explains what it does, why, and what to expect

## Test Files

### 1. `localnet.test.ts`

**Purpose**: Localnet health check
**What it tests**: Verifies the localnet infrastructure can start and respond correctly

**Key assertions**:

- Aptos binary can be found and executed
- Localnet starts successfully on ports 8080 (API) and 8081 (faucet)
- Chain ID is 4 (local testnet identifier)
- Ledger is initialized and advancing
- API endpoints respond to basic queries
- Account resources can be queried

**Platform behaviors documented**:

- Localnet startup takes approximately 10-15 seconds
- API becomes available before faucet during startup
- Framework account (0x1) always exists with 50+ resources
- Ledger version advances from genesis

**Use this test to**:

- Verify development environment is set up correctly
- Debug localnet startup issues
- Confirm Aptos CLI binary is accessible
- Validate network connectivity
- Test basic infrastructure before running other tests

---

### 2. `docker-testnet.test.ts`

**Purpose**: Docker-based multi-validator testnet validation
**What it tests**: Verifies a 4-validator Docker testnet can start and make blockchain progress

**Key assertions**:

- Docker is installed and running
- Docker Compose can start zapatos validator images
- All 4 validators bind to expected ports (8080-8083)
- Validators serve API requests correctly
- Block height increments over time (blockchain making progress)
- Chain ID is 4 (local testnet)
- All validators stay in sync (within 10 blocks)
- Framework account exists with expected resources
- Epoch and timestamp progress correctly

**Platform behaviors documented**:

- First run: ~1-2 minutes (image download + startup) or ~10-20 minutes (local build)
- Subsequent runs: ~30 seconds (cached images)
- Validators auto-generate genesis
- Epoch duration: 30 seconds (fast testing)
- Block production rate: ~1-3 blocks/second
- Validators stay synced within few blocks

**Use this test to**:

- Verify Docker environment is set up correctly
- Test multi-validator consensus
- Validate production-like testnet setup
- Debug Docker networking issues
- Test blockchain progress

**Requirements**:

- Docker Desktop running
- Ports 8080-8083 available
- 8GB RAM minimum
- **Configuration**: See "Docker Testnet Setup" section below

**Run command**:

```bash
npm run test:docker
```

#### Docker Testnet Setup

The docker-testnet test requires configuration before first use. You have two options:

**Option 1: Use Locally-Built Images (Recommended for Development)**

1. Create your environment configuration:
   ```bash
   cd source/atomica-web
   cp .env.example .env
   ```

2. Build the Docker image (10-20 minutes first time):
   ```bash
   cd ../../docker-testnet
   ./build-local-image.sh
   ```

3. The `.env` file is already configured for local images (default)

4. Run the test:
   ```bash
   cd ../source/atomica-web
   npm run test:docker
   ```

**Option 2: Use Pre-Built Images from GitHub Container Registry (GHCR)**

If you have access to the private atomica repository:

1. Create a GitHub Personal Access Token (Classic):
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token" → "Generate new token (classic)"
   - Note: "GHCR access for atomica docker images"
   - Select scope: `read:packages` (and optionally `repo` if you need repo access)
   - Click "Generate token" and copy it
   - **Important**: Fine-grained tokens don't currently support package registry access

2. Update `source/atomica-web/.env`:
   ```bash
   # Uncomment and configure:
   VALIDATOR_IMAGE_REPO=ghcr.io/bomba-atomica/atomica/zapatos-bin
   IMAGE_TAG=5df0e6d1
   GHCR_USERNAME=your_github_username
   GHCR_TOKEN=ghp_YourPersonalAccessTokenHere
   ```

3. Run the test:
   ```bash
   npm run test:docker
   ```

   The test harness will automatically authenticate with GHCR using your credentials.

**Note**: The `.env` file is gitignored and will not be committed. Each developer manages their own configuration.

---

### 3. `faucet-ed25519.test.ts`

**Purpose**: Ed25519 account funding via faucet
**What it tests**: The faucet can fund newly generated Ed25519 accounts (traditional Aptos accounts)

**Key assertions**:

- New accounts start with 0 balance
- Faucet successfully funds accounts with requested amount
- Funded amount appears correctly in account balance

**Platform behaviors documented**:

- New accounts return balance 0 (not an error)
- Faucet transactions follow standard transaction lifecycle
- Default funding: 100,000,000 octas (1 APT)

**Use this test to**:

- Learn how to generate Ed25519 accounts
- Understand the faucet funding flow
- Reference account balance queries

---

### 4. `faucet-secp256k1.test.ts`

**Purpose**: SECP256k1 account funding via faucet
**What it tests**: The faucet can fund newly generated SECP256k1 accounts (Ethereum-compatible)

**Key assertions**:

- SECP256k1 accounts can be generated and funded via faucet
- Faucet is key-type agnostic (treats SECP256k1 same as Ed25519)
- Ethereum private keys can be imported and funded on Aptos
- Account creation happens automatically during faucet funding

**Platform behaviors documented**:

- SECP256k1 accounts work identically to Ed25519 for faucet funding
- New SECP256k1 accounts return balance 0 before funding
- Faucet automatically creates SECP256k1 accounts on-chain
- Ethereum private keys produce different addresses on Aptos (SHA3-256 vs Keccak-256)

**Test scenarios**:

1. **Generated SECP256k1 account**: Create new random SECP256k1 account and fund it
2. **Ethereum private key import**: Import Ethereum private key and fund the derived Aptos account

**Use this test to**:

- Verify SECP256k1 account support in the faucet
- Test Ethereum private key compatibility
- Confirm equal treatment of all key types
- Understand address derivation differences

---

### 5. `transfer.test.ts`

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

### 6. `deploy-contract.test.ts`

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

### 7. `deploy-atomica-contracts.test.ts`

**Purpose**: Atomica contract deployment
**What it tests**: Deploying the full Atomica contract suite

**Key assertions**:

- All Atomica modules deploy successfully
- Modules contain expected functions
- Deployment completes within gas budget

**Use this test to**:

- Verify contract compilation works
- Test contract deployment process
- Validate module structure

---

### 8. `secp256k1-account.test.ts`

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

**Note**: This test uses direct SECP256k1 accounts. For account abstraction that allows signing with MetaMask/Ethereum wallets using SIWE (Sign-In with Ethereum), see the `ethereum_derivable_account` module.

---

## Running the Tests

**IMPORTANT**: These tests run **sequentially** (one at a time), not in parallel. This is enforced by the vitest configuration (`fileParallelism: false`). Each test starts its own localnet instance on ports 8080/8081, so running multiple tests simultaneously would cause port conflicts.

### Run all meta tests

```bash
npm run test:meta
```

The tests will run sequentially with each test managing its own localnet instance.

**Total runtime**: ~4.5-5.5 minutes

### Run individual test

```bash
npm run test:meta tests/meta/localnet.test.ts
npm run test:meta tests/meta/faucet-ed25519.test.ts
npm run test:meta tests/meta/faucet-secp256k1.test.ts
npm run test:meta tests/meta/transfer.test.ts
npm run test:meta tests/meta/deploy-contract.test.ts
npm run test:meta tests/meta/deploy-atomica-contracts.test.ts
npm run test:meta tests/meta/secp256k1-account.test.ts
```

### Debug a specific test

```bash
npm run test:meta tests/meta/transfer.test.ts -- --reporter=verbose
```

### Why sequential execution?

Each test spins up a complete localnet instance that binds to specific ports (8080 for the API, 8081 for the faucet). Running tests in parallel would cause port conflicts. All meta tests use `describe.sequential()` to enforce sequential execution within the suite.

## Test Isolation

Each test:

- Starts its own localnet instance in `beforeAll()`
- No teardown in persistent mode (localnet stays running between tests)
- Uses fresh, randomly generated accounts
- Logs detailed output for debugging

## Expected Gas Costs

Based on the meta tests, here are typical gas costs for reference:

| Operation                    | Gas Cost (octas) | Notes                       |
| ---------------------------- | ---------------- | --------------------------- |
| Faucet funding               | N/A              | Free operation              |
| Transfer to new account      | ~103,400         | Includes account creation   |
| Transfer to existing account | ~1,000           | Estimated (not tested)      |
| Deploy simple contract       | ~167,900         | For noop module (677 bytes) |

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
  scheme: SigningSchemeInput.Secp256k1Ecdsa,
});
```

### 2. Funding accounts

```typescript
await fundAccount(account.accountAddress.toString(), 1_000_000_000);
```

### 3. Checking balance

```typescript
const balance = await aptos.getAccountAPTAmount({
  accountAddress: account.accountAddress,
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
  transactionHash: pendingTxn.hash,
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

When adding new meta tests:

1. **Follow clean room principles** - No side effects, isolated state
2. **Document thoroughly** - Explain what, why, and expected behavior
3. **Log key information** - Help future developers debug
4. **Test one thing** - Keep tests focused and simple
5. **Update this README** - Add your test to the documentation
6. **Run in Node.js** - Use the Node.js test configuration, not browser

## See Also

- [Aptos TypeScript SDK Documentation](https://aptos.dev/sdks/ts-sdk/index)
- [Move Language Documentation](https://move-language.github.io/move/)
- [Aptos CLI Reference](https://aptos.dev/tools/aptos-cli/use-cli/use-aptos-cli)
