# atomica-sdk

Status: `live`

## Purpose

Headless TypeScript SDK for building Aptos applications with Ethereum account abstraction. Provides SIWE (Sign-In with Ethereum) authentication, Aptos address derivation from Ethereum addresses, transaction preparation/simulation/submission, and chain configuration helpers. Contains zero React imports — enforced by CI pre-push hook — making it safe to import in both browser and Node.js contexts.

## Public API surface

Sub-path exports are available via the `"exports"` field in `package.json`.

### Root — `@atomica/sdk`

| Export | Description |
|---|---|
| `constructSIWEMessage` | Build a SIWE message string for MetaMask signing |
| `getDerivedAddress` | Derive the Aptos address for a given Ethereum address |
| `calculateAbstractDigest` | SHA-3 digest used by Move's abstract-auth scheme |
| `serializeSIWEAbstractSignature` | BCS-serialize a SIWE abstract signature |
| `serializeSIWEAbstractPublicKey` | BCS-serialize a SIWE abstract public key |
| `SIWEAccountAuthenticator` | `AccountAuthenticator` subclass for SIWE-signed Aptos transactions |
| `PreparedTransaction` | Interface returned by `prepareNativeTransaction` |
| `prepareNativeTransaction` | Build + authenticate an Aptos transaction using MetaMask |
| `simulateNativeTransaction` | Pre-flight simulate a prepared transaction |
| `submitPreparedTransaction` | Submit a prepared transaction and wait for execution |
| `submitNativeTransaction` | All-in-one: prepare → simulate → submit |

### `@atomica/sdk/aptos`

Aptos contract interaction helpers.

| Export | File |
|---|---|
| `aptos`, `setAptosInstance`, `CONTRACT_ADDR` | `src/aptos/config.ts` |
| `*` (payloads) | `src/aptos/payloads.ts` |

### `@atomica/sdk/ethereum`

Ethereum contract interaction helpers.

| Export | File |
|---|---|
| `*` (config, ABIs, contracts, transactions, balances, lockbox) | `src/ethereum/index.ts` |

> Note: `@atomica/sdk/ethereum/proofs` is intentionally NOT re-exported from the ethereum sub-path because it transitively imports heavy Node.js dependencies. Import it directly when needed.

### `@atomica/sdk/chain-config`

| Export | Description |
|---|---|
| `ChainConfig` | Type for dual-chain RPC and contract address configuration |
| `DEFAULT_CHAIN_CONFIG` | Config resolved from `VITE_*` env vars or hardcoded defaults |
| `getChainConfig` | Runtime accessor; reads `globalThis.__ATOMICA_CHAIN_CONFIG__` or default |

### `@atomica/sdk/contract-check`

Contract deployment status helpers.

### `@atomica/sdk/network-host`

Network host resolution helpers.

## Dependents

- `source/atomica-web-components` — imports SIWE and transaction utilities via root export
- `source/atomica-demo` — imports via sub-path exports for Aptos and Ethereum interactions
- `source/atomica-crosschain-testing` — imports Ethereum helpers for cross-chain test setup

## See also

- `docs/architecture/v0-architecture.md` §1 — package layout and no-React constraint
- `docs/architecture/v0-architecture.md` §2 — auction mechanism the SDK transactions invoke
