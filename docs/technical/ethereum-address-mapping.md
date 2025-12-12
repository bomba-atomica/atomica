# Ethereum-Aptos Address Mapping Specification

## Problem Statement

When Ethereum users create SECP256k1 accounts on Aptos using their existing private keys, they encounter a critical UX issue: **their Aptos address differs from their Ethereum address**, even though they're using the same private key.

### Root Cause

The address derivation algorithms differ between chains:

| Chain | Hash Function | Derivation |
|-------|--------------|------------|
| **Ethereum** | Keccak-256 | Last 20 bytes of Keccak-256(public_key) |
| **Aptos** | SHA3-256 (NIST) | SHA3-256(public_key + scheme_id) |

### User Impact

```
User's Ethereum Private Key: 0x1234...abcd (32 bytes)
    ↓
    ├─→ Ethereum Address: 0xABC123... (using Keccak-256)
    └─→ Aptos Address:    0xDEF456... (using SHA3-256)
                          ^^^^^^^^^ DIFFERENT!
```

**Expected UX**: "I'll use my MetaMask wallet on Aptos at the same address"
**Actual UX**: "Why is my Aptos address different? Where are my funds?"

## Requirements

We need a system to:

1. **STORE** - Maintain bidirectional mappings between Ethereum and Aptos addresses
2. **SEARCH** - Enable fast lookups in both directions
3. **IDENTIFY** - Display address relationships clearly to users

## Solution Architecture

### Recommended Approach: Hybrid On-chain + Off-chain

```
┌─────────────────────────────────────────────────────────────┐
│                     Account Creation                         │
│  (User connects MetaMask or imports ETH private key)        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Derive Both Addresses                           │
│  ETH: Keccak-256(pubkey) → 0xABC123...                      │
│  APT: SHA3-256(pubkey)   → 0xDEF456...                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              On-Chain Registry (Move Module)                 │
│  Emit Event: AccountMapped { eth, apt, pubkey, timestamp }  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│           Off-Chain Indexer (Database)                       │
│  Listen to events → Build searchable database                │
│  Bidirectional indexes: ETH→APT and APT→ETH                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                 Client Application                           │
│  Query indexer for fast lookups                             │
│  Display both addresses to user                             │
│  "Your ETH wallet 0xABC... maps to Aptos 0xDEF..."         │
└─────────────────────────────────────────────────────────────┘
```

### Component 1: On-Chain Registry (Move Module)

**Location**: `source/zapatos/sources/address_registry.move`

**Purpose**: Immutable, verifiable record of address mappings

```move
module atomica::address_registry {
    use std::signer;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};

    /// Mapping from Ethereum address to Aptos address
    struct EthToAptosRegistry has key {
        mappings: Table<vector<u8>, address>,  // ETH addr (20 bytes) → Aptos addr
    }

    /// Mapping from Aptos address to Ethereum address (reverse lookup)
    struct AptosToEthRegistry has key {
        mappings: Table<address, vector<u8>>,  // Aptos addr → ETH addr (20 bytes)
    }

    /// Event emitted when a mapping is registered
    struct AccountMappedEvent has drop, store {
        ethereum_address: vector<u8>,    // 20 bytes (Keccak-256 derived)
        aptos_address: address,          // 32 bytes (SHA3-256 derived)
        public_key: vector<u8>,          // 65 bytes (uncompressed SECP256k1)
        derivation_method: u8,           // 0 = direct SECP256k1, 1 = ethereum_derivable_account
        timestamp: u64,
    }

    /// Register a new Ethereum-Aptos address mapping
    public entry fun register_mapping(
        account: &signer,
        ethereum_address: vector<u8>,
        public_key: vector<u8>,
        derivation_method: u8,
    ) {
        let aptos_address = signer::address_of(account);

        // Verify Ethereum address is 20 bytes
        assert!(vector::length(&ethereum_address) == 20, ERROR_INVALID_ETH_ADDRESS);

        // Verify public key is 65 bytes (uncompressed SECP256k1)
        assert!(vector::length(&public_key) == 65, ERROR_INVALID_PUBLIC_KEY);

        // Verify public key derives to both addresses
        // ... verification logic ...

        // Store bidirectional mappings
        if (!exists<EthToAptosRegistry>(@atomica)) {
            move_to(account, EthToAptosRegistry {
                mappings: table::new(),
            });
        };

        let registry = borrow_global_mut<EthToAptosRegistry>(@atomica);
        table::add(&mut registry.mappings, ethereum_address, aptos_address);

        // Emit event for indexer
        event::emit(AccountMappedEvent {
            ethereum_address,
            aptos_address,
            public_key,
            derivation_method,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Query Aptos address by Ethereum address
    public fun get_aptos_address(ethereum_address: vector<u8>): address acquires EthToAptosRegistry {
        let registry = borrow_global<EthToAptosRegistry>(@atomica);
        *table::borrow(&registry.mappings, ethereum_address)
    }

    /// Query Ethereum address by Aptos address
    public fun get_ethereum_address(aptos_address: address): vector<u8> acquires AptosToEthRegistry {
        let registry = borrow_global<AptosToEthRegistry>(@atomica);
        *table::borrow(&registry.mappings, aptos_address)
    }
}
```

### Component 2: Off-Chain Indexer (PostgreSQL)

**Location**: `source/atomica-indexer/`

**Purpose**: Fast, queryable database for address lookups

**Database Schema**:
```sql
CREATE TABLE address_mappings (
    id SERIAL PRIMARY KEY,
    ethereum_address VARCHAR(42) NOT NULL,     -- 0xABC... (20 bytes hex)
    aptos_address VARCHAR(66) NOT NULL,        -- 0xDEF... (32 bytes hex)
    public_key VARCHAR(130) NOT NULL,          -- Uncompressed SECP256k1 (65 bytes)
    derivation_method VARCHAR(30) NOT NULL,    -- 'secp256k1' or 'ethereum_derivable_account'
    created_at TIMESTAMP NOT NULL,
    first_transaction_hash VARCHAR(66),        -- Transaction that created the account
    block_height BIGINT NOT NULL,

    -- Indexes for fast lookups
    CONSTRAINT unique_ethereum_address UNIQUE (ethereum_address),
    CONSTRAINT unique_aptos_address UNIQUE (aptos_address)
);

-- Bidirectional indexes for O(1) lookups
CREATE INDEX idx_eth_to_aptos ON address_mappings(ethereum_address);
CREATE INDEX idx_aptos_to_eth ON address_mappings(aptos_address);
CREATE INDEX idx_public_key ON address_mappings(public_key);
CREATE INDEX idx_created_at ON address_mappings(created_at DESC);
```

**Indexer Service** (Node.js/TypeScript):
```typescript
// source/atomica-indexer/src/indexer.ts
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { Pool } from 'pg';

class AddressMappingIndexer {
    private aptos: Aptos;
    private db: Pool;

    async start() {
        // Listen to AccountMappedEvent from address_registry module
        const events = await this.aptos.getEventsByEventType({
            eventType: '0x1::atomica::address_registry::AccountMappedEvent',
        });

        for (const event of events) {
            await this.indexMapping(event);
        }
    }

    async indexMapping(event: any) {
        const { ethereum_address, aptos_address, public_key, derivation_method, timestamp } = event.data;

        await this.db.query(`
            INSERT INTO address_mappings
            (ethereum_address, aptos_address, public_key, derivation_method, created_at, block_height)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (ethereum_address) DO NOTHING
        `, [
            '0x' + Buffer.from(ethereum_address).toString('hex'),
            aptos_address,
            '0x' + Buffer.from(public_key).toString('hex'),
            derivation_method === 0 ? 'secp256k1' : 'ethereum_derivable_account',
            new Date(timestamp * 1000),
            event.version,
        ]);
    }
}
```

### Component 3: Client API (TypeScript SDK)

**Location**: `source/atomica-web/src/lib/addressMapping.ts`

```typescript
export interface AddressMapping {
    ethereumAddress: string;      // 0xABC... (20 bytes)
    aptosAddress: string;          // 0xDEF... (32 bytes)
    publicKey: string;             // SECP256k1 public key (65 bytes uncompressed)
    derivationMethod: 'secp256k1' | 'ethereum_derivable_account';
    createdAt: Date;
    firstTransactionHash?: string;
}

export class AddressMappingService {
    private indexerUrl: string;

    constructor(indexerUrl: string) {
        this.indexerUrl = indexerUrl;
    }

    /**
     * Get Aptos address from Ethereum address
     */
    async getAptosByEthAddress(ethAddress: string): Promise<string> {
        const response = await fetch(`${this.indexerUrl}/mapping/eth/${ethAddress}`);
        if (!response.ok) throw new Error('Mapping not found');
        const data = await response.json();
        return data.aptosAddress;
    }

    /**
     * Get Ethereum address from Aptos address
     */
    async getEthByAptosAddress(aptosAddress: string): Promise<string> {
        const response = await fetch(`${this.indexerUrl}/mapping/aptos/${aptosAddress}`);
        if (!response.ok) throw new Error('Mapping not found');
        const data = await response.json();
        return data.ethereumAddress;
    }

    /**
     * Get full mapping details by either address
     */
    async getMapping(address: string): Promise<AddressMapping> {
        const isEthAddress = address.length === 42;  // 0x + 40 hex chars
        const endpoint = isEthAddress
            ? `/mapping/eth/${address}`
            : `/mapping/aptos/${address}`;

        const response = await fetch(`${this.indexerUrl}${endpoint}`);
        if (!response.ok) throw new Error('Mapping not found');
        return await response.json();
    }

    /**
     * Register a new mapping (calls on-chain registry)
     */
    async registerMapping(
        account: Account,
        ethereumAddress: string,
        publicKey: Uint8Array,
        derivationMethod: 'secp256k1' | 'ethereum_derivable_account'
    ): Promise<string> {
        const txn = await aptos.transaction.build.simple({
            sender: account.accountAddress,
            data: {
                function: "0x1::atomica::address_registry::register_mapping",
                functionArguments: [
                    Array.from(ethers.getBytes(ethereumAddress)),
                    Array.from(publicKey),
                    derivationMethod === 'secp256k1' ? 0 : 1,
                ],
            },
        });

        const pendingTxn = await aptos.signAndSubmitTransaction({
            signer: account,
            transaction: txn,
        });

        await aptos.waitForTransaction({ transactionHash: pendingTxn.hash });
        return pendingTxn.hash;
    }
}
```

### Component 4: UI Components

**Location**: `source/atomica-web/src/components/AddressDisplay.tsx`

```typescript
import React from 'react';
import { AddressMapping } from '../lib/addressMapping';

interface AddressDisplayProps {
    mapping: AddressMapping;
    primaryFormat: 'ethereum' | 'aptos';
}

export function AddressDisplay({ mapping, primaryFormat }: AddressDisplayProps) {
    const [copied, setCopied] = React.useState<'eth' | 'aptos' | null>(null);

    const copyAddress = (address: string, type: 'eth' | 'aptos') => {
        navigator.clipboard.writeText(address);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="address-display">
            <div className="primary-address">
                <span className="label">
                    {primaryFormat === 'ethereum' ? 'Ethereum Address' : 'Aptos Address'}
                </span>
                <code className="address">
                    {primaryFormat === 'ethereum' ? mapping.ethereumAddress : mapping.aptosAddress}
                </code>
                <button onClick={() => copyAddress(
                    primaryFormat === 'ethereum' ? mapping.ethereumAddress : mapping.aptosAddress,
                    primaryFormat === 'ethereum' ? 'eth' : 'aptos'
                )}>
                    {copied === primaryFormat ? '✓ Copied' : 'Copy'}
                </button>
            </div>

            <div className="secondary-address">
                <span className="label">
                    Mapped {primaryFormat === 'ethereum' ? 'Aptos' : 'Ethereum'} Address
                </span>
                <code className="address secondary">
                    {primaryFormat === 'ethereum' ? mapping.aptosAddress : mapping.ethereumAddress}
                </code>
                <button onClick={() => copyAddress(
                    primaryFormat === 'ethereum' ? mapping.aptosAddress : mapping.ethereumAddress,
                    primaryFormat === 'ethereum' ? 'aptos' : 'eth'
                )}>
                    {copied === (primaryFormat === 'ethereum' ? 'aptos' : 'eth') ? '✓ Copied' : 'Copy'}
                </button>
            </div>

            <div className="mapping-info">
                <p>
                    ℹ️ Your {primaryFormat === 'ethereum' ? 'Ethereum' : 'Aptos'} wallet is mapped to a
                    {primaryFormat === 'ethereum' ? ' different Aptos' : 'n Ethereum'} address due to
                    different hash functions (SHA3-256 vs Keccak-256).
                </p>
                <p>Funds on Aptos are located at: <code>{mapping.aptosAddress}</code></p>
            </div>
        </div>
    );
}
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Create Move module `address_registry.move`
- [ ] Write unit tests for registry
- [ ] Deploy to localnet
- [ ] Test event emission

### Phase 2: Indexer (Week 2-3)
- [ ] Set up PostgreSQL database
- [ ] Create database schema with indexes
- [ ] Implement event listener service
- [ ] Build REST API for queries
- [ ] Add API tests

### Phase 3: Client SDK (Week 3-4)
- [ ] Implement `AddressMappingService` class
- [ ] Add to existing `aptos.ts` utilities
- [ ] Write TypeScript unit tests
- [ ] Integration tests with localnet

### Phase 4: UI Integration (Week 4-5)
- [ ] Create `AddressDisplay` component
- [ ] Update account creation flow
- [ ] Update wallet connection flow
- [ ] Add mapping to transaction displays
- [ ] User testing and feedback

### Phase 5: Production (Week 5-6)
- [ ] Deploy Move module to testnet
- [ ] Deploy indexer infrastructure
- [ ] Set up monitoring and alerts
- [ ] Performance testing
- [ ] Security audit
- [ ] Deploy to mainnet

## Testing Strategy

### Unit Tests
```typescript
// tests/unit/addressMapping.test.ts
describe('Address Mapping', () => {
    it('should derive Ethereum address from SECP256k1 public key', () => {
        const pubkey = '0x04...'; // 65 bytes
        const ethAddress = deriveEthereumAddress(pubkey);
        expect(ethAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should derive Aptos address from SECP256k1 public key', () => {
        const pubkey = '0x04...'; // 65 bytes
        const aptosAddress = deriveAptosAddress(pubkey);
        expect(aptosAddress).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should store and retrieve mapping bidirectionally', async () => {
        const service = new AddressMappingService(indexerUrl);

        const ethAddr = '0xABC...';
        const aptAddr = '0xDEF...';

        await service.registerMapping(account, ethAddr, pubkey, 'secp256k1');

        expect(await service.getAptosByEthAddress(ethAddr)).toBe(aptAddr);
        expect(await service.getEthByAptosAddress(aptAddr)).toBe(ethAddr);
    });
});
```

### Integration Tests
```typescript
// tests/integration/addressMapping.test.ts
describe('Address Mapping Integration', () => {
    it('should register mapping on-chain and index off-chain', async () => {
        // Create SECP256k1 account
        const account = SingleKeyAccount.generate({
            scheme: SigningSchemeInput.Secp256k1Ecdsa
        });

        // Derive Ethereum address
        const ethAddress = deriveEthereumAddress(account.publicKey);

        // Register mapping
        const txHash = await mappingService.registerMapping(
            account,
            ethAddress,
            account.publicKey.toUint8Array(),
            'secp256k1'
        );

        // Wait for indexer to process
        await sleep(2000);

        // Query via API
        const mapping = await mappingService.getMapping(ethAddress);
        expect(mapping.aptosAddress).toBe(account.accountAddress.toString());
        expect(mapping.ethereumAddress).toBe(ethAddress);
    });
});
```

## Security Considerations

1. **Verification**: Always verify that the public key derives to both addresses before accepting mapping
2. **Authorization**: Only the account owner can register their mapping
3. **Immutability**: Mappings cannot be changed once registered (prevents hijacking)
4. **Rate Limiting**: Protect indexer API from abuse
5. **Input Validation**: Validate all addresses and public keys before storage

## Performance Targets

- On-chain registration: < 2 seconds
- Indexer event processing: < 5 seconds
- API query response: < 100ms
- Database lookup: < 10ms
- Support 100,000+ mappings with sub-second queries

## Monitoring & Alerts

- Event emission rate from registry
- Indexer lag (time between event emission and indexing)
- API response times
- Database query performance
- Failed mapping registrations

## Future Enhancements

1. **Bulk Registration**: Register multiple mappings in one transaction
2. **Metadata**: Allow users to add labels/names to addresses
3. **Multi-chain**: Support mapping to other EVM chains (Polygon, BSC, etc.)
4. **ENS Integration**: Link ENS names to Aptos addresses
5. **Address Book**: User-managed address book with mappings
