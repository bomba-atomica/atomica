# Atomica SDK

Core SDK for building Aptos blockchain applications with Ethereum account abstraction.

## Purpose

This package provides the fundamental utilities for account management and transaction handling on Aptos, enabling Ethereum wallets (like MetaMask) to interact with the Aptos blockchain through SIWE (Sign-In with Ethereum) authentication.

## What's Inside

### Account Management
- **SIWE Integration**: Sign-In with Ethereum message construction and verification
- **Address Derivation**: Derive Aptos addresses from Ethereum addresses
- **Abstract Authentication**: Support for Ethereum secp256k1 signatures on Aptos

### Transaction Utilities
- **Transaction Preparation**: Build transactions with proper authentication
- **Transaction Signing**: Sign transactions using MetaMask/Ethereum wallets
- **Transaction Submission**: Submit signed transactions to Aptos network
- **Simulation Support**: Pre-flight transaction simulation for gas estimation

## Key Functions

```typescript
// Prepare a transaction with Ethereum wallet signature
prepareNativeTransaction(aptos, ethAddress, payload)

// Simulate transaction before submission
simulateNativeTransaction(aptos, preparedTx)

// Submit signed transaction
submitPreparedTransaction(aptos, preparedTx)

// All-in-one: prepare, simulate, and submit
submitNativeTransaction(aptos, ethAddress, payload)
```

## Architecture

This SDK is **runtime-agnostic** and **network-agnostic**:
- Accepts an `Aptos` instance as a parameter (no hardcoded configuration)
- Works in browser environments (requires `window.ethereum` for wallet access)
- Pure account and transaction logic - no testnet/deployment concerns

## Dependencies

- `@aptos-labs/ts-sdk`: Official Aptos TypeScript SDK
- `ethers`: Ethereum wallet integration
- `@noble/hashes`: Cryptographic hashing utilities

## Testing

Unit tests are located in `tests/` and cover:
- SIWE message construction and signature verification
- Address derivation consistency
- Authenticator serialization (BCS encoding)
- Secp256k1 key handling

Run tests:
```bash
bun test
```

## Usage

```typescript
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { submitNativeTransaction } from "@atomica/sdk";

// Configure Aptos client
const config = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(config);

// Prepare transaction payload
const payload = {
  function: "0x1::aptos_account::transfer",
  functionArguments: [recipient, amount]
};

// Submit with Ethereum wallet (MetaMask)
const tx = await submitNativeTransaction(aptos, myEthAddress, payload);
```

## Related Packages

- `@atomica/aptos-docker-testnet`: Docker-based testnet for development
- `@atomica/atomica-web-ui`: React UI components for Aptos apps
- `@atomica/state-proof-verifier`: State proof verification and IBE crypto
