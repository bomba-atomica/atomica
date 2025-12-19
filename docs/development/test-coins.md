# Test Coins Specification

## Overview

Atomica provides test fungible tokens (fake_eth and fake_usd) for development and testing purposes. These tokens simulate ETH and USD assets on the Aptos blockchain and can be freely minted by users within defined limits.

## Token Types

### FAKEETH (Fake Ethereum)
- **Symbol**: `FAKEETH`
- **Name**: Fake Ethereum
- **Decimals**: 8
- **Module**: `atomica::fake_eth`
- **Decimal Rationale**: Uses 8 decimals to match Bitcoin and common exchange representations of ETH. While Ethereum natively uses 18 decimals, 8 decimals provides sufficient precision for testing without excessive granularity.

### FAKEUSD (Fake USD)
- **Symbol**: `FAKEUSD`
- **Name**: Fake USD
- **Decimals**: 6
- **Module**: `atomica::fake_usd`
- **Decimal Rationale**: Uses 6 decimals to match the industry standard for USD stablecoins (USDC, USDT). This is the standard precision for representing USD on-chain.

## Minting Mechanism

### Self-Service Faucet Design
- **Open Access**: Any user can call the `mint` function
- **Self-Minting**: Users mint tokens directly to their own address
- **No Authorization Required**: No admin approval or privileged access needed

### Function Signature
```move
public entry fun mint(account: &signer, amount: u64)
```

### Parameters
- `account: &signer` - The transaction signer who will receive the minted tokens
- `amount: u64` - The amount to mint (in base units)

### Minting Rules
1. **Self-Minting Only**: Users mint tokens directly to themselves. The signer's address is automatically used as the recipient.
2. **Per-Mint Cap**: Maximum of **10,000** tokens (in human-readable units) per mint transaction
   - FAKEETH: 10,000 * 10^8 = 1,000,000,000,000 base units (enforced by `MAX_MINT_AMOUNT` constant)
   - FAKEUSD: 10,000 * 10^6 = 10,000,000,000 base units (enforced by `MAX_MINT_AMOUNT` constant)
3. **Unlimited Mints**: Users can call mint multiple times (no global cap per user)
4. **Unlimited Supply**: No maximum total supply enforced

### Cap Enforcement
The 10,000 token cap per mint is enforced **in the Move smart contract** via assertion:
```move
assert!(amount <= MAX_MINT_AMOUNT, E_EXCEEDS_MAX_MINT);
```

Attempting to mint more than 10,000 tokens in a single transaction will result in the transaction failing with error code.

## Contract Deployment

### Initialization
Each token module must be initialized once after deployment:

```bash
# Initialize FAKEETH
aptos move run --function-id '<deployer>::fake_eth::initialize'

# Initialize FAKEUSD
aptos move run --function-id '<deployer>::fake_usd::initialize'
```

The `initialize` function:
- Creates the fungible asset metadata
- Generates mint, transfer, and burn refs
- Stores refs at the contract address (`@atomica`)
- Can only be called once per module

### Contract Address
- Tokens are deployed under the `atomica` named address
- In production: Set via `--named-addresses atomica=<deployer_address>`
- In tests: Defaults to `0xcafe` (dev-addresses)

## Usage Examples

### Web App Integration
```typescript
// Mint 10 FAKEETH to yourself (from atomica-web/src/lib/aptos/payloads.ts)
const amountEth = BigInt(10) * BigInt(100_000_000); // 10 ETH with 8 decimals

await submitNativeTransaction(ethAddress, {
    function: `${CONTRACT_ADDR}::fake_eth::mint`,
    functionArguments: [amountEth], // Only amount, signer receives tokens
});

// Mint 10,000 FAKEUSD to yourself
const amountUsd = BigInt(10000) * BigInt(1_000_000); // 10,000 USD with 6 decimals

await submitNativeTransaction(ethAddress, {
    function: `${CONTRACT_ADDR}::fake_usd::mint`,
    functionArguments: [amountUsd], // Only amount, signer receives tokens
});
```

### Direct CLI Usage
```bash
# Mint 10 FAKEETH to yourself (the signer)
aptos move run \
  --function-id 'default::fake_eth::mint' \
  --args u64:1000000000

# Mint 10,000 FAKEUSD to yourself (the signer)
aptos move run \
  --function-id 'default::fake_usd::mint' \
  --args u64:10000000000
```

## Design Rationale

### Why Self-Minting?
1. **Simplicity**: No faucet server or admin key management required
2. **Decentralization**: Users control their own test token acquisition
3. **Testing**: Simulates realistic on-chain token acquisition patterns

### Why 10,000 Cap?
1. **Prevent Abuse**: Limits excessive minting in single transactions
2. **Realistic Testing**: Encourages realistic test scenarios with reasonable amounts
3. **Resource Protection**: Prevents state bloat from extremely large mint operations

### Why No Global Supply Cap?
Since these are test tokens with no real value:
- **Development Flexibility**: Developers can mint as needed
- **No Resource Constraints**: Test environments don't need economic scarcity
- **Simplified Testing**: No need to manage shared faucet resources

### Why Different Decimals?
The tokens use different decimal precision to simulate real-world asset standards:

- **FAKEETH (8 decimals)**: Matches Bitcoin and common exchange representations. While native Ethereum uses 18 decimals, 8 decimals provides sufficient precision for testing trading scenarios without unnecessary complexity. This precision level is widely used in cryptocurrency exchanges and trading systems.

- **FAKEUSD (6 decimals)**: Follows the industry standard established by major USD stablecoins (USDC, USDT, etc.). This 6-decimal standard represents the smallest unit as $0.000001 (one millionth of a dollar), which is adequate for all practical financial applications while keeping numbers manageable.

Using different decimals makes the test environment more realistic for simulating actual auction scenarios where users trade between different asset types with varying precision requirements.

## Security Considerations

### Intentional Lack of Access Control
⚠️ **Warning**: The `mint` function is intentionally permissionless for testing purposes. This design is **NOT suitable for production tokens** with real value.

### No Rate Limiting
The smart contract does not implement:
- Time-based rate limits
- Address-based quotas
- Global supply caps

Applications building on these test tokens should implement their own rate limiting if needed.

## Implementation Files

### Move Smart Contracts
- **`source/atomica-move-contracts/sources/fake_eth.move`**
  - Module `atomica::fake_eth`
  - Constants: `MAX_MINT_AMOUNT = 1_000_000_000_000` (10,000 with 8 decimals)
  - Functions: `initialize()`, `mint(account: &signer, amount: u64)`, `get_metadata()`, `balance(owner: address): u64`

- **`source/atomica-move-contracts/sources/fake_usd.move`**
  - Module `atomica::fake_usd`
  - Constants: `MAX_MINT_AMOUNT = 10_000_000_000` (10,000 with 6 decimals)
  - Functions: `initialize()`, `mint(account: &signer, amount: u64)`, `get_metadata()`, `balance(owner: address): u64`

### TypeScript/Web Integration
- **`source/atomica-web/src/lib/aptos/payloads.ts`**
  - `getMintFakeEthPayload()` - Creates mint transaction for 10 FAKEETH
  - `getMintFakeUsdPayload()` - Creates mint transaction for 10,000 FAKEUSD
  - `mintFakeEth()` - Wrapper for minting FAKEETH
  - `mintFakeUsd()` - Wrapper for minting FAKEUSD
  - `areContractsDeployed()` - Verifies contracts are deployed

### Deployment & Initialization
- **`source/atomica-web/scripts/orchestrator.ts`**
  - Deploys contracts to local testnet
  - Calls `fake_eth::initialize` and `fake_usd::initialize`

- **`source/atomica-web/tests/setup/localnet.ts`**
  - `deployContracts()` - Deploys and initializes contracts for tests

### Tests
- **`source/atomica-web/tests/integration/fake-minting/FakeEth.integration.test.ts`**
  - Tests Ed25519 signing for FAKEETH minting

- **`source/atomica-web/tests/integration/fake-minting/FakeUSD.integration.test.ts`**
  - Tests Ed25519 signing for FAKEUSD minting

- **`source/atomica-web/tests/integration/sanity/deploy-atomica-contracts.test.ts`**
  - Tests contract deployment and module verification
