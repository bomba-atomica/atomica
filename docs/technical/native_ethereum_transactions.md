# Native Ethereum Wallet Transaction Support

## Objective
Enable users with native Ethereum wallets (e.g., MetaMask, Rabby) to sign and submit transactions directly to the Atomica chain without relying on a relayer service. The experience should mimic a native wallet interaction as much as possible, utilizing standard signing methods.

## Solution Overview
The solution leverages the **Abstract Account Abstraction (Abstract Authenticator)** features already present in the Zapatos framework, specifically utilizing the `ethereum_derivable_account` module. 

Instead of treating the Ethereum wallet as a raw SECP256k1 signer (which would require the wallet to sign the raw Aptos transaction hash, often flagged as "blind signing" or unsafe by modern wallets), we utilize the **Sign In With Ethereum (SIWE)** standard (EIP-4361). The Atomica transaction hash is embedded into the SIWE message as the `Nonce`.

## Architecture

### 1. On-Chain Components
*   **Module**: `aptos_framework::ethereum_derivable_account`
*   **Authenticator**: `TransactionAuthenticator::Abstract` using the `Scheme::DerivableDomainAbstraction` (or `Scheme::Abstraction` with `DerivableV1` data).
*   **Verification Logic**: The `ethereum_derivable_account::authenticate` function verifies that:
    1.  The signature matches the public key and the SIWE message.
    2.  The SIWE message's `Nonce` matches the hash of the current transaction (`digest`).
    3.  The recovered Ethereum address matches the user's identity.

### 2. Transaction Flow

1.  **Construct Raw Transaction**: The frontend builds the Atomica `RawTransaction` (payload, gas params, etc.).
2.  **Calculate Digest**: The frontend calculates the hash of this `RawTransaction` (the "digest").
3.  **Construct SIWE Message**:
    *   The frontend creates a standard SIWE message string.
    *   **Crucial Step**: The `Nonce` field of the SIWE message is set to the hexadecimal representation of the `digest` (step 2).
    *   Other fields (URI, Domain, Chain ID) must match the expected values for the Atomica network.
4.  **User Signing**:
    *   The frontend requests the user to sign this message using `personal_sign` (or `eth_signTypedData` if supported by the move verification logic, though `ethereum_derivable_account` currently focuses on standard message signing).
    *   The user sees a readable SIWE message in their wallet, not a random hex string.
5.  **Transaction Assembly**:
    *   The frontend creates a `TransactionAuthenticator::Abstract`.
    *   **Function Info**: Points to `0x1::ethereum_derivable_account::authenticate`.
    *   **Auth Data**: `AbstractAuthenticationData::DerivableV1` containing:
        *   `signing_message_digest`: The hash from Step 2.
        *   `abstract_signature`: The signature produced by the wallet in Step 4.
        *   `abstract_public_key`: The public key/address info.
6.  **Submission**: The transaction is submitted to the node.
7.  **Verification**:
    *   The node's prologue calls `ethereum_derivable_account::authenticate`.
    *   The Move module reconstructs the expected SIWE message using the transaction digest and verifies the signature.

## Key Advantages
1.  **No Relayer Needed**: The user pays their own gas (if they have funds) or uses a standard fee-payer mechanism.
2.  **No Blind Signing**: Users sign a human-readable SIWE message, drastically improving security and user confidence compared to signing raw hashes.
3.  **Implicit Accounts**: The `DerivableV1` scheme supports deriving the Atomica address from the Ethereum address, enabling "implicit" account creation. A user can receive funds to their mapped address and immediately interact with the chain without a prior account creation transaction.

## Implementation Requirements
*   **Frontend**: Update the Atomica Web SDK to support this specific signing flow (hash tx -> create SIWE -> sign -> wrap in Abstract Authenticator).
*   **Node/Framework**: Ensure `ethereum_derivable_account` is deployed and accessible (it appears to be part of the framework).
*   **Gas**: Users need AUA (or the native token) at their derived address to pay for gas, or a fee payer must be used.

## References
*   `source/zapatos/aptos-move/framework/aptos-framework/sources/account/common_account_abstractions/ethereum_derivable_account.move`
*   `source/zapatos/types/src/transaction/authenticator.rs`
