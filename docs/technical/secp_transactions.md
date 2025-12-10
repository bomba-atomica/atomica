# SECP Signed Transactions Specification

## Overview

This document specifies the implementation of SECP256k1 signed transactions on the Atomica chain (Zapatos). This feature allows users with customary Ethereum wallets (e.g., MetaMask, Trezor) to sign Move transaction scripts, submit them to the chain, have the chain authenticate the user (creating an account if necessary), verify the signature, and execute the payload.

## Goals

1.  **SECP Signing**: Support transaction signing using SECP256k1 keys common in the Ethereum ecosystem.
2.  **Customary Wallet Support**: Enable users to use existing wallets.
3.  **Automatic Account Lookup/Creation**: The chain must derive the account from the authentication key (SECP public key) and automatically create the account if it does not exist.
4.  **Standard Execution**: Execute the transaction payload (script or entry function) after verification.

## Architecture

### 1. Transaction Authenticator

The `TransactionAuthenticator` in `types/src/transaction/authenticator.rs` already supports `SingleKeyAuthenticator` which can wrap `AnyPublicKey` and `AnySignature`. The `AnyPublicKey` enum supports `Secp256k1Ecdsa`.

We will utilize `TransactionAuthenticator::SingleSender` variants with a `SingleKeyAuthenticator` containing the SECP256k1 public key and signature.

### 2. Transaction Flow

1.  **Signing**:
    *   The user constructs a `RawTransaction` (Move transaction script).
    *   The user signs the transaction hash using their Ethereum wallet (SECP256k1).
    *   **Note**: If the wallet uses `personal_sign` (EIP-191), the signature will be over `keccak256("\x19Ethereum Signed Message:\n" + len(msg) + msg)`. Standard Aptos signing is over `sha3_256(RawTransaction)`.
    *   *Decision*: For the MVP, we assume the user can sign the raw transaction hash (e.g., using "sign hash" features or a custom frontend that handles the signing flow appropriately, or we adopt a blind signing approach).

2.  **Submission**:
    *   The transaction is submitted to the Mempool.
    *   The `TransactionAuthenticator` contains the `Secp256k1` signature and public key.

3.  **Prologue & Account Lookup**:
    *   The `AptosVM` runs the `prologue`.
    *   **Derivation**: The system derives the candidate Account Address from the `AuthenticationKey` (hash of SECP Public Key + Scheme).
    *   **Lookup**: The VM checks if `Account` resource exists at this derived address.
    *   **Implicit Creation**:
        *   If the account does *not* exist, the VM must decide whether to create it.
        *   Security Risk: Allowing arbitrary account creation can be a DoS vector (state bloat).
        *   Mitigation: The transaction must carry enough gas to cover creation *and* execution, OR be sponsored.
        *   *Mechanism*: We leverage the `Account` module's ability to support implicit accounts. If the address has been pre-funded (e.g. via a bridge or faucet), the account resource might not exist yet but the address is valid. The `create_account_if_does_not_exist` logic can be triggered.

4.  **Verification**:
    *   `TransactionAuthenticator::verify` is called.
    *   It delegates to `SingleKeyAuthenticator::verify`.
    *   `AnySignature::verify` calls `secp256k1_ecdsa::Signature::verify`.
    *   This verifies that `Signature` matches the `PublicKey` and the `RawTransaction` hash.

5.  **Execution**:
    *   Once verified, the `RawTransaction` payload is executed.

## Implementation Details

### User Address Derivation
We will use the standard Aptos derivation (SHA3-256 of PubKey). The "account lookup" is simply deriving this address.

### Account Creation Logic
We will ensure that the validation logic allows for transactions from addresses that have a balance but no `Account` resource (Implicit Accounts), triggering the creation where appropriate, or verify that the existing `create_account_if_does_not_exist` path in `AptosVM::finish_aborted_transaction` (and potentially success paths) covers this.

## Changes Required

1.  **Documentation**: This specification.
2.  **Tests**: Add a test case in `api/src/tests/secp256k1_ecdsa.rs` that simulates the full flow:
    *   Generate SECP Key.
    *   Derive Address.
    *   Fund Address (implicitly creating it or pre-funding).
    *   Submit Tx signed by SECP Key.
    *   Verify execution.
3.  **Review**: Ensure `RUST_SECURE_CODING.md` compliance.
