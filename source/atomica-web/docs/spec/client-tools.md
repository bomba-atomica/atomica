# Client Tools Specification: Timelock Encryption

## Overview

The client tools enable web and CLI clients to interact with the Atomica Timelock system. The core functionality includes:
1.  **Encryption**: Encrypting a message for a specific timelock (ID + deadline).
2.  **Decryption**: Decrypting a message after the deadline has passed, using a key retrieved from the blockchain.

## Cryptographic Primitives

### Dependencies
- **Curve**: BLS12-381
- **Hash**: SHA3-256
- **Serialization**: BCS (Binary Canonical Serialization)

### Constants
- **IBE_IDENTITY_DST**: `b"APTOS_IBE_IDENTITY_DST"`
- **IBE_KEY_DERIVATION_DST**: `b"APTOS_IBE_KEY_DERIVATION_DST"`
- **H_TO_CURVE_AUG**: `b"H(id)"`

### 1. Identity Computation
A unique identity is derived for each timelock session.

```
identity = SHA3-256(IBE_IDENTITY_DST || LE_U64(timelock_id) || LE_U64(deadline_us))
```
*   `timelock_id`: u64 (Little Endian)
*   `deadline_us`: u64 (Little Endian) - Unix timestamp in microseconds

### 2. Encryption (IBE)
To encrypt a message `M` for an identity `id`:

1.  **Hash to Curve**:
    ```
    Q_id = HashToCurveG1(Augmentation="H(id)" || identity, DST=IBE_IDENTITY_DST)
    ```
2.  **Sample Randomness**:
    *   `r` <- random scalar
3.  **Compute U**:
    *   `U = r * G2_Generator`
4.  **Compute Pairing**:
    *   `g_id = e(Q_id, MPK)^r`
5.  **Derive Symmetric Key**:
    *   `gt_bytes = BCS_Serialize(g_id)` (576 bytes, 12 x 48-byte LE coefficients)
    *   `K = SHA3-256(IBE_KEY_DERIVATION_DST || gt_bytes || LE_U32(0))` (Counter mode 0)
    *   *Note: If message length > 32 bytes, increment counter.*
6.  **XOR Encryption**:
    *   `V = M XOR K`
7.  **Ciphertext**:
    *   `C = { u: U, v: V }`

### 3. Decryption (IBE)
To decrypt ciphertext `C = { u, v }` using decryption key `dk` (G1 Element):

1.  **Compute Pairing**:
    *   `g_id = e(dk, u)`
2.  **Derive Symmetric Key**:
    *   `gt_bytes = BCS_Serialize(g_id)`
    *   `K = SHA3-256(IBE_KEY_DERIVATION_DST || gt_bytes || LE_U32(0))`
3.  **XOR Decryption**:
    *   `M = v XOR K`

## Client-Side Workflow

### A. Setup
1.  Fetch `MPK` (Master Public Key) from the Aptos blockchain (`0x1::timelock::get_public_key`).

### B. Bid Submission (Encryption)
1.  User selects an auction/timelock (`timelock_id`, `deadline`).
2.  Client computes `identity`.
3.  Client generates `r`, computes `U`, derives key, encrypts payload.
4.  Client submits `(U, V)` to the smart contract.

### C. Bid Reveal (Decryption)
1.  Client monitors blockchain for `RequestRevealEvent` or checks time.
2.  After deadline, validators publish `dk` shares.
3.  Contract aggregates shares into `dk`.
4.  Client fetches `dk` (`0x1::timelock::get_decryption_key`).
5.  Client decrypts local ciphertext or fetches encrypted bids to verify.

## Implementation Status

### Completed
- **Core Cryptography**: Implemented in `src/lib/timelock.ts`. Verified against Rust `bcs` and `blstrs` golden vectors.
  - Identity computation matches blockchain logic.
  - Custom `GT` serialization (576 bytes LE) verified.
  - Encryption/Decryption flow verified.
- **Client SDK**: Implemented in `src/lib/timelock_client.ts`.
  - `getMpk()`: Fetches MPK from chain.
  - `encrypt()`: Encrypts for specific timelock.
  - `waitForDecryption()`: Polls for reveal.
  - `decrypt()`: Fetches key and decrypts.
- **Unit Tests**:
  - `tests/unit/timelock.test.ts`: Crypto primitives validation.
  - `tests/unit/timelock_client.test.ts`: Client flow validation (mocked).

### Known Issues
- **E2E Test (`tests/meta/timelock-e2e.test.ts`)**: Currently skipped.
  - **Issue**: The local Docker testnet validators do not automatically submit decryption key shares after the timelock deadline passes.
  - **Cause**: The validator software in the Docker image likely lacks the active background worker or configuration to observe the `TimelockRegistry` and invoke `submit_dk_shares`.
  - **Workaround**: Unit tests verify the off-chain logic. E2E validation requires an update to the validator node software or configuration in `atomica-aptos`.

## Implementation Details (TypeScript)
- Use `@noble/bls12-381` for curve operations.
- Use `@noble/hashes` for SHA3-256.
- Custom implementation for `GT` BCS serialization (12 fields, LE).
