# Root Account Implementation for TypeScript SDK

## Overview

This document explains how to use the root account in our testnet to create accounts and mint tokens without running the faucet binary, using only REST API transactions.

## How Aptos Forge/Smoke Tests Do It

### 1. Root Account Setup (Genesis)

**Root Account Address**: `0x00000000000000000000000000000000000000000000000000000000A550C18`

The root private key is generated during genesis and stored in:
- `root_key` (hex format)
- `root_key.bin` (BCS binary format)

From `crates/aptos-genesis/src/builder.rs:533-535`:
```rust
let mut keygen = KeyGen::from_seed(rng.r#gen());
let root_key = keygen.generate_ed25519_private_key();
```

### 2. Account Creation Pattern

From `testsuite/forge/src/interface/aptos.rs:160-171`:
```rust
pub async fn create_user_account(&mut self, pubkey: &Ed25519PublicKey) -> Result<()> {
    let auth_key = AuthenticationKey::ed25519(pubkey);
    let create_account_txn =
        self.root_account
            .sign_with_transaction_builder(self.transaction_factory().payload(
                aptos_stdlib::aptos_account_create_account(auth_key.account_address()),
            ));
    self.rest_client
        .submit_and_wait(&create_account_txn)
        .await?;
    Ok(())
}
```

**Key Transaction**: `0x1::aptos_account::create_account(address)`

### 3. Minting Pattern

From `testsuite/forge/src/interface/aptos.rs:189-196`:
```rust
pub async fn mint(&mut self, addr: AccountAddress, amount: u64) -> Result<()> {
    let mint_txn = self.root_account.sign_with_transaction_builder(
        self.transaction_factory()
            .payload(aptos_stdlib::aptos_coin_mint(addr, amount)),
    );
    self.rest_client.submit_and_wait(&mint_txn).await?;
    Ok(())
}
```

**Key Transaction**: `0x1::aptos_coin::mint(address, u64)`

### 4. Combined Pattern (Create + Fund)

From `testsuite/forge/src/interface/aptos.rs:284-289`:
```rust
pub async fn create_and_fund_user_account(&mut self, amount: u64) -> Result<LocalAccount> {
    let account = self.random_account();
    self.create_user_account(account.public_key()).await?;
    self.mint(account.address(), amount).await?;
    Ok(account)
}
```

### 5. The Faucet's Approach (Single Transaction)

The faucet uses a Move script that combines both operations:

**Location**: `aptos-move/move-examples/scripts/minter/sources/minter.move`

```move
script {
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin;
    use aptos_framework::coin;

    fun main(minter: &signer, dst_addr: address, amount: u64) {
        let minter_addr = signer::address_of(minter);

        // Mint coins to minter first
        let balance = coin::balance<aptos_coin::AptosCoin>(minter_addr);
        if (balance < U64_MAX - amount - GAS_BUFFER) {
            aptos_coin::mint(minter, minter_addr, amount + GAS_BUFFER);
        };

        // Transfer to destination (creates account if needed)
        aptos_account::transfer(minter, dst_addr, amount);
    }
}
```

**Key Insight**: `aptos_account::transfer` automatically creates the account if it doesn't exist!

## TypeScript Implementation

### Required Dependencies

```json
{
  "dependencies": {
    "aptos": "^1.x.x"
  }
}
```

### Root Account Class

```typescript
import {
    AptosAccount,
    AptosClient,
    TxnBuilderTypes,
    BCS,
    HexString
} from "aptos";

export class RootAccount {
    private account: AptosAccount;
    private client: AptosClient;
    private chainId: number;

    constructor(
        privateKeyHex: string,
        apiUrl: string,
        chainId: number = 4 // Default testnet chain ID
    ) {
        // Root account address is always 0xA550C18
        // IMPORTANT: privateKeyHex must match ROOT_KEY in generate-genesis.sh
        const rootAddress = "0x00000000000000000000000000000000000000000000000000000000A550C18";

        const privateKey = new HexString(privateKeyHex);
        this.account = new AptosAccount(privateKey.toUint8Array(), rootAddress);
        this.client = new AptosClient(apiUrl);
        this.chainId = chainId;
    }

    /**
     * Create a new account on-chain
     */
    async createAccount(address: string): Promise<string> {
        const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
            function: "0x1::aptos_account::create_account",
            type_arguments: [],
            arguments: [BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(address))],
        };

        const rawTxn = await this.client.generateTransaction(
            this.account.address(),
            payload
        );

        const signedTxn = await this.client.signTransaction(this.account, rawTxn);
        const txnHash = await this.client.submitTransaction(signedTxn);
        
        await this.client.waitForTransaction(txnHash);
        return txnHash;
    }

    /**
     * Mint tokens to an existing account
     */
    async mint(address: string, amount: bigint | number): Promise<string> {
        const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
            function: "0x1::aptos_coin::mint",
            type_arguments: ["0x1::aptos_coin::AptosCoin"],
            arguments: [
                BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(address)),
                BCS.bcsSerializeUint64(BigInt(amount))
            ],
        };

        const rawTxn = await this.client.generateTransaction(
            this.account.address(),
            payload
        );

        const signedTxn = await this.client.signTransaction(this.account, rawTxn);
        const txnHash = await this.client.submitTransaction(signedTxn);
        
        await this.client.waitForTransaction(txnHash);
        return txnHash;
    }

    /**
     * Create account and mint tokens in two transactions
     */
    async createAndFund(address: string, amount: bigint | number): Promise<{
        createTxHash: string;
        mintTxHash: string;
    }> {
        const createTxHash = await this.createAccount(address);
        const mintTxHash = await this.mint(address, amount);
        
        return { createTxHash, mintTxHash };
    }

    /**
     * Transfer tokens (creates account if needed)
     * This is the simplest approach - mirrors what the faucet does
     */
    async transfer(toAddress: string, amount: bigint | number): Promise<string> {
        const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
            function: "0x1::aptos_account::transfer",
            type_arguments: [],
            arguments: [
                BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(toAddress)),
                BCS.bcsSerializeUint64(BigInt(amount))
            ],
        };

        const rawTxn = await this.client.generateTransaction(
            this.account.address(),
            payload
        );

        const signedTxn = await this.client.signTransaction(this.account, rawTxn);
        const txnHash = await this.client.submitTransaction(signedTxn);
        
        await this.client.waitForTransaction(txnHash);
        return txnHash;
    }

    /**
     * Get the root account balance
     */
    async getBalance(): Promise<bigint> {
        const resources = await this.client.getAccountResources(this.account.address());
        const coinResource = resources.find(
            r => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
        );
        
        if (!coinResource) {
            return BigInt(0);
        }
        
        return BigInt((coinResource.data as any).coin.value);
    }

    /**
     * Get account address
     */
    getAddress(): string {
        return this.account.address().hex();
    }
}
```

### Usage Examples

```typescript
// Initialize root account from genesis
// MUST match ROOT_KEY in generate-genesis.sh
const rootKey = "0x23B293DBCFAA0DBAEB3C7792F91DAE3C4CD94D28E772EF9CC83B805B484AC4F8";
const rootAccount = new RootAccount(
    rootKey,
    "http://localhost:8080",
    4 // chain ID
);

// Create a new user account
const newAccount = new AptosAccount();
await rootAccount.createAccount(newAccount.address().hex());

// Mint 1000 APT (1000 * 10^8 octas)
await rootAccount.mint(newAccount.address().hex(), 100_000_000_000);

// OR: Do both in one call
await rootAccount.createAndFund(newAccount.address().hex(), 100_000_000_000);

// OR: Use transfer (simplest - auto-creates account)
await rootAccount.transfer(newAccount.address().hex(), 100_000_000_000);
```

## Reading Root Key from Genesis

Our genesis script creates the root key. We need to expose it:

```typescript
// In DockerTestnet class, add:
async getRootKey(): Promise<string> {
    const rootKeyPath = pathResolve(this.composeDir, "../genesis-workspace/root_key");
    if (!existsSync(rootKeyPath)) {
        throw new Error("Root key not found. Was genesis generated?");
    }
    
    const rootKey = readFileSync(rootKeyPath, "utf-8").trim();
    return rootKey;
}
```

## Transaction Details

### Transaction Structure

```typescript
{
    sender: "0xA550C18",
    sequence_number: 0,  // Auto-increments
    max_gas_amount: 20000,
    gas_unit_price: 100,
    expiration_timestamp_secs: <current_time + 600>,
    payload: {
        type: "entry_function_payload",
        function: "0x1::module::function",
        type_arguments: [],
        arguments: [...]
    }
}
```

### REST API Endpoints

- **Submit**: `POST /transactions`
- **Wait**: `GET /transactions/by_hash/{txn_hash}`
- **Account Info**: `GET /accounts/{address}`
- **Account Resources**: `GET /accounts/{address}/resources`

## Important Constants

```typescript
const ROOT_ADDRESS = "0x00000000000000000000000000000000000000000000000000000000A550C18";
const APTOS_COIN_TYPE = "0x1::aptos_coin::AptosCoin";
const OCTAS_PER_APT = 100_000_000; // 10^8
```

## Testing

```typescript
describe("Root Account", () => {
    let rootAccount: RootAccount;
    
    beforeAll(async () => {
        const testnet = await DockerTestnet.new(2);
        const rootKey = await testnet.getRootKey();
        rootAccount = new RootAccount(
            rootKey,
            testnet.validatorApiUrl(0),
            4
        );
    });
    
    test("should create and fund account", async () => {
        const newAccount = new AptosAccount();
        await rootAccount.createAndFund(
            newAccount.address().hex(),
            1_000_000_000 // 10 APT
        );
        
        // Verify balance
        const balance = await rootAccount.client.getAccountResource(
            newAccount.address(),
            "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
        );
        
        expect(balance.data.coin.value).toBe("1000000000");
    });
});
```

## Next Steps

1. Add `aptos` TypeScript SDK to package.json
2. Implement `RootAccount` class in `src/root-account.ts`
3. Export root key from genesis generation
4. Add `getRootKey()` method to `DockerTestnet`
5. Add tests for account creation and minting
6. Document the API for users

## References

**Rust Code Locations**:
- Genesis builder: `crates/aptos-genesis/src/builder.rs:533-535`
- Forge interface: `testsuite/forge/src/interface/aptos.rs:160-196`
- Faucet minter: `crates/aptos-faucet/core/src/funder/mint.rs`
- Minter script: `aptos-move/move-examples/scripts/minter/sources/minter.move`

**Key Functions**:
- `aptos_account::create_account(address)` - Create account
- `aptos_coin::mint(address, amount)` - Mint tokens
- `aptos_account::transfer(address, amount)` - Transfer (auto-creates)
