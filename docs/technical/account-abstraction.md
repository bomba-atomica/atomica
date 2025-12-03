# Account Abstraction: Current State of the Art

## Overview
Account abstraction transforms blockchain accounts from externally owned accounts (EOAs) to smart contract-based accounts, enabling programmable transaction validation and execution logic.

## Key Standards

### ERC-4337 (Ethereum)
**Status**: Live on Ethereum mainnet since March 1, 2023

The dominant standard avoiding consensus-layer changes. Introduces:
- **UserOperations**: Pseudo-transactions submitted to alternative mempool
- **Bundlers**: Aggregate UserOps into single transactions
- **EntryPoint Contract**: Singleton validation and execution coordinator (v0.6.0: `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`)
- **Paymasters**: Enable gas sponsorship and ERC-20 fee payments

**Cryptography**: Does not use ZK proofs natively; authentication relies on smart contract signature verification. However, smart contract wallets can implement ZK proof verification as a custom signature scheme.

### Native Implementations

#### Aptos (AIP-104)
**Status**: Testnet as of July 2025; AIP-113 (Derivable AA) passed November 2025

Aptos implements account abstraction natively at the consensus layer through Move modules:

**Architecture**:
- Custom Move modules define transaction authentication logic
- AptosVM executes authentication directly (no bundlers required)
- Gas limit: 60 gas units for authentication functions (configurable via `max_aa_gas`)

**Authentication Function Signature**:
```move
public fun authenticate(account: signer, auth_data: AbstractionAuthData): signer
```

**AbstractionAuthData**:
- `digest`: SHA3-256 hash of transaction (prevents replay attacks)
- `authenticator`: Custom bytes for authentication logic

**Cryptography**: Does not use ZK proofs for account abstraction mechanism. Authentication executes arbitrary Move code in the AptosVM. However, Move modules can implement ZK proof verification if desired.

**Comparison to Ethereum**: No separate mempool, bundlers, or EntryPoint contract needed. Authentication is integrated directly into consensus-layer transaction processing.

#### Other Chains
- **Starknet**: Account abstraction by default; all accounts are contracts
- **zkSync Era**: Native account abstraction with custom transaction types
- **Sui**: Resource-oriented model similar to Aptos

## ZK Proofs and Account Abstraction

**Key Distinction**: Neither ERC-4337 nor Aptos AA use ZK proofs as part of their core account abstraction protocol.

**Where ZK Proofs Can Be Used**:
- **Custom Authentication Schemes**: Smart contract accounts can validate ZK proofs as signatures
- **Privacy-Preserving Auth**: Prove credential knowledge without revealing secrets
- **Batch Verification**: Efficiently verify multiple signatures using ZK proofs
- **Paymaster Privacy**: Prove sponsorship eligibility without revealing user data
- **Cross-Chain State**: Aptos uses ZK proofs for cross-chain light clients and bridge verification (separate from AA mechanism)

**Layer 2 Context**: zkSync Era and Starknet use ZK proofs for rollup state transitions, not for the account abstraction logic itself.

## Signature Verification in ERC-4337

ERC-4337 wallets implement `validateUserOp()` with custom signature validation logic. The signature field is **not protocol-defined**, enabling any cryptographic scheme to be implemented in the smart contract wallet.

### Active Signature Schemes on Mainnet

#### 1. ECDSA (secp256k1) - Standard Ethereum
- **Usage**: Most common, default for basic wallets
- **Gas Cost**: ~3,000 gas (native `ecrecover` precompile at address `0x01`)
- **Support**: Native EVM support, lowest cost option
- **Use Cases**: Standard EOA-style signatures, single-key wallets

#### 2. P256/secp256r1 (Passkeys/WebAuthn)
- **Usage**: Powers passkeys, Face ID, Touch ID, YubiKey, Android Keystore
- **Gas Cost**:
  - **Without precompile**: ~300k-400k gas (contract-based verification)
  - **With EIP-7951 (Fusaka, Dec 3 2025)**: ~3,450 gas (100x reduction!)
- **Status**:
  - **RIP-7212**: Live on Polygon PoS (March 2024), Optimism, Arbitrum, zkSync (L2 rollups)
  - **EIP-7951**: LIVE on Ethereum mainnet (Fusaka upgrade, December 3, 2025)
- **Production Implementations**:
  - **Coinbase Smart Wallet**: P256 passkey support (deployed on Base at `0x000100abaad02f1cfC8Bbe32bD5a564817339E72`)
  - **Trust Wallet Barz**: Audited P256 passkey wallet
  - **Daimo p256-verifier**: Available at `0xc2b78104907F722DABAc4C69f826a522B2754De4`
  - **Safe**: Passkey support via EIP-7212/7951 precompile

#### 3. Multi-Signature Schemes
- **Usage**: Enterprise and DAO treasury management
- **Gas Cost**: Scales with number of signers (N × 3,000 gas + contract logic)
- **Implementations**:
  - **Safe (Gnosis Safe)**: M-of-N threshold signatures with ECDSA
  - Custom validation logic in smart contract
- **Use Cases**: Shared custody, organizational accounts, high-security applications

#### 4. ERC-1271: Standard Signature Validation
- **Interface**: `isValidSignature(bytes32 hash, bytes signature) → bytes4`
- **Purpose**: Allows smart contracts to validate signatures for dApp compatibility
- **Adoption**: Required by all ERC-4337 wallets for ecosystem interoperability
- **Use Cases**: Sign-in with Ethereum, off-chain message signing, dApp authentication

#### 5. ERC-6492: Pre-Deploy Signature Validation
- **Purpose**: Validate signatures for **counterfactual/undeployed** contracts
- **Magic Bytes**: `0x6492649264926492649264926492649264926492649264926492649264926492`
- **UX Benefit**: Users can sign messages before deploying their wallet (critical for onboarding)
- **Compatibility**: Extends ERC-1271, backward compatible with EOA signatures
- **Use Cases**: Sign-in before wallet deployment, gasless onboarding flows

### Production Wallet Comparison

| Wallet | Signature Schemes | Mainnet Status | Key Features |
|--------|------------------|----------------|--------------|
| **Coinbase Smart Wallet** | P256 (passkeys) + ECDSA | Base mainnet | Dual owner support, ERC-6492 |
| **Safe (Gnosis)** | ECDSA multi-sig, P256 (via precompile) | Ethereum + L2s | M-of-N threshold, modular design |
| **Trust Wallet Barz** | P256 (passkeys) | Ethereum mainnet | Audited passkey implementation |
| **Standard ERC-4337** | ECDSA | All EVM chains | Gas-efficient, simple |

### Gas Cost Summary

| Signature Type | Gas Cost (Mainnet) | Notes |
|----------------|-------------------|-------|
| **ECDSA (secp256k1)** | ~3,000 | Native precompile, most efficient |
| **P256 (with EIP-7951)** | ~3,450 | As of Fusaka (Dec 3, 2025) |
| **P256 (without precompile)** | ~300k-400k | Contract verification (pre-Fusaka) |
| **Multi-sig (2-of-3)** | ~9,000+ | 3× ECDSA + contract logic |
| **Multi-sig (3-of-5)** | ~15,000+ | 5× ECDSA + contract logic |

### EIP-7951 Impact (Fusaka Upgrade)

**Activated**: December 3, 2025 at 21:49:11 UTC (Epoch 411392)

The Fusaka upgrade brings native P256 precompile support (EIP-7951) to Ethereum mainnet, reducing passkey signature verification from ~350k gas to ~3,450 gas. This makes passkey-based authentication economically viable:

- **Security Improvements**: Fixes critical issues in RIP-7212 while maintaining interface compatibility
- **Hardware Integration**: Direct support for Apple Secure Enclave, Android Keystore, FIDO2/WebAuthn
- **Mainstream Adoption**: Enables familiar biometric authentication flows for Web3 applications
- **Cost Comparison**: P256 now only ~15% more expensive than ECDSA (vs. 100x before)

This is a watershed moment for account abstraction UX on Ethereum mainnet.

## Implementation Comparison

| Aspect | Ethereum (ERC-4337) | Aptos (AIP-104) |
|--------|---------------------|-----------------|
| **Integration** | Smart contract layer | Native consensus layer |
| **Deployment** | Mainnet (March 2023) | Testnet (July 2025) |
| **Infrastructure** | Requires bundlers | No bundlers needed |
| **Mempool** | Separate UserOp mempool | Standard transaction pool |
| **Language** | Solidity contracts | Move modules |
| **Entry Point** | EntryPoint singleton contract | AptosVM direct execution |
| **Gas Model** | Bundler + paymaster overhead | 60 gas units for auth (configurable) |
| **ZK Proofs** | Optional (custom implementation) | Optional (Move module verification) |
| **Flexibility** | Constrained by EntryPoint | Arbitrary Move logic |

## Capabilities Enabled
- Multi-signature and social recovery
- Session keys for limited-scope authorization
- Batch transactions reducing overhead
- Sponsored transactions improving UX
- Custom signature schemes (passkeys, biometrics, ZK proofs)
- Automated payments and subscriptions

## Current Limitations
- **ERC-4337 mempool fragmentation**: Separate UserOp mempools reduce efficiency
- **Higher gas costs versus EOAs**: Smart contract execution overhead (~21k base + validation logic)
- **Bundler centralization risks**: Limited bundler diversity creates censorship vectors
- **Cross-chain standardization gaps**: Inconsistent implementations across L2s
- **Developer tooling maturity**: SDK fragmentation, debugging complexity
- **P256 adoption lag**: Despite Fusaka precompile, wallet/dApp integration still ramping up (Dec 2025)

## Future Directions

**Ethereum**:
- **EIP-7702**: Consensus-layer integration to enable EOAs to delegate to smart contracts (coming in future upgrade)
- **EIP-7951**: ✅ SHIPPED (Fusaka, Dec 3 2025) - P256 precompile enables mainstream passkey adoption
- Improved bundler decentralization and anti-censorship mechanisms
- Cross-chain EntryPoint standardization (same addresses across all EVM chains)
- Adoption of passkey-based authentication in major wallets and dApps

**Aptos**:
- **AIP-113 (Derivable AA)**: Passed November 2025 for cross-chain and multi-domain authentication
- Mainnet deployment timeline for full account abstraction support
- Enhanced Move authentication libraries and tooling

**Industry-Wide**:
- Universal cross-chain AA standards
- ZK-based authentication schemes for privacy and efficiency
- Integration with passkeys and biometric authentication
- Improved developer tooling and wallet SDK maturity
