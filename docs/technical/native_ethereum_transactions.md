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
1.  **No Relayer Needed**: The user pays their own gas (if they have funds) or uses contract-sponsored gas (see Option #2 below, the default approach).
2.  **No Blind Signing**: Users sign a human-readable SIWE message, drastically improving security and user confidence compared to signing raw hashes.
3.  **Implicit Accounts**: The `DerivableV1` scheme supports deriving the Atomica address from the Ethereum address, enabling "implicit" account creation. A user can receive funds to their mapped address and immediately interact with the chain without a prior account creation transaction.

## Gas Payment Options

**Required for Onboarding**: Atomica requires a **FeePayer backend service** for gasless onboarding. This is a fundamental limitation of Aptos/Zapatos - gas payment is enforced at the VM level before Move code executes, making smart contract sponsorship impossible.

### Option 1: User Has Tokens (Pure P2P)
If the user has AUA tokens at their derived Zapatos address, they can submit transactions directly to Zapatos RPC endpoints without any intermediary. Gas is deducted from their account balance automatically.

**Flow:**
```
Browser → Sign SIWE → Submit to Zapatos RPC → Validators Verify → Execute
```

### Option 2: FeePayer Backend Service ⭐ **REQUIRED**

**Why Required**: Gas payment is enforced at the VM level in the transaction prologue (BEFORE Move code executes). Smart contracts cannot pay gas. A backend account with AUA balance must sign as FeePayer.

**How it works:**
1. User signs SIWE message in MetaMask (for their actual transaction, e.g., "Place Bid")
2. Frontend sends signed transaction to FeePayer service API
3. Service validates eligibility (rate limits, Ethereum balance)
4. Service wraps transaction with FeePayer authenticator:
   - Sender: `Abstract(ethereum_derivable_account + user_SIWE_signature)`
   - FeePayer: Backend account signature
5. Service submits to Zapatos
6. User's account auto-created (implicit account creation)
7. Gas paid by FeePayer
8. **(Optional)** Service transfers initial AUA to user for future P2P transactions

**After First Transaction (if pre-funded):**
- User signs SIWE in MetaMask
- Submits directly to Zapatos RPC (P2P mode!)
- Gas deducted from user's balance
- No FeePayer service involved

**This is the industry standard:**
- Coinbase Smart Wallet: Uses FeePayer
- Safe (Gnosis): Uses relayer
- All major AA providers: Require backend

**Infrastructure:**
- Single backend server
- One hot wallet with AUA
- Simple API endpoint
- Ethereum RPC access (for deposit verification)
- Cost: ~10 AUA/month for 1000 users

**Recommended Anti-Sybil: Deposit-Gated Sponsorship**
- User deposits on Ethereum first (natural for auction platform)
- Provides Ethereum address + deposit tx hash to faucet
- Faucet verifies deposit (tx inclusion proof)
- Faucet transfers initial AUA to derived Zapatos address
- User now has gas for all future transactions (P2P!)
- Strong sybil resistance (requires capital commitment)

**See**: `fee-payer.md` for complete analysis and implementation details

### Option 3: User Already Has Tokens

User manually acquired AUA tokens via faucet, purchase, or received from friend.

**Flow:**
```
Browser → Sign SIWE → Submit to Zapatos RPC → Validators Verify → Execute
```

**Pure P2P** - No backend service needed.

## Default User Onboarding Flow

**For new users without Zapatos accounts** (using Option #2 - FeePayer):

1. User connects MetaMask to Atomica app
2. User clicks "Place Bid" (or any action)
3. User signs SIWE message in MetaMask (human-readable, shows what they're approving)
4. Frontend sends to FeePayer service API
5. Service validates eligibility and wraps with FeePayer signature
6. Service submits to Zapatos:
   - User's account **implicitly created**
   - Bid transaction executes
   - Gas paid by FeePayer
   - (Optional) Service transfers 1000 AUA to user for future P2P
7. ✅ User successfully placed bid!

**Subsequent transactions** (if user received AUA in step 6):
- User signs SIWE in MetaMask
- Submits directly to any Zapatos RPC (P2P!)
- No FeePayer service involved

**No pre-existing account required!** The FeePayer transaction implicitly creates the account.

## Implementation Requirements
*   **Frontend**: Update the Atomica Web SDK to support SIWE signing flow (hash tx -> create SIWE -> sign -> send to FeePayer API or submit P2P).
*   **Node/Framework**: Ensure `ethereum_derivable_account` is deployed (part of framework).
*   **Backend**: FeePayer service required for gasless onboarding:
    - Single server (can be serverless)
    - One hot wallet with AUA balance
    - API endpoint to wrap transactions with FeePayer signature
    - Rate limiting and anti-sybil mechanisms
*   **User Flow**:
    - New users: Via FeePayer service (Option #2)
    - Existing users with balance: Direct P2P (Option #3)

## References
*   [`atomica-aptos/aptos-move/framework/aptos-framework/sources/account/common_account_abstractions/ethereum_derivable_account.move`](https://github.com/bomba-atomica/atomica-aptos/blob/dev-atomica/aptos-move/framework/aptos-framework/sources/account/common_account_abstractions/ethereum_derivable_account.move)
*   [`atomica-aptos/types/src/transaction/authenticator.rs`](https://github.com/bomba-atomica/atomica-aptos/blob/dev-atomica/types/src/transaction/authenticator.rs)
*   EIP-4361 (SIWE): https://eips.ethereum.org/EIPS/eip-4361
