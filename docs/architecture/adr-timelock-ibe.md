# ADR: Adoption of BLS12-381 Identity-Based Encryption for Timelock

## Status
Accepted

## Context
The Atomica auction system requires a "Double Encryption" or "Timelock Encryption" mechanism where bids are encrypted off-chain and can only be decrypted on-chain after a specific timeframe (epoch) has passed and validators have revealed the secret.

Initially, we considered **ElGamal encryption on the Ristretto255 curve** (available in `aptos_std`), assuming manual key generation or DKG compatibility.
However, further research into the **Drand** beacon (industry standard for randomness/timelock) and the **Zapatos/Aptos DKG** implementation revealed:
1.  **Drand** uses **Identity-Based Encryption (IBE)** logic on the **BLS12-381** curve (pairing-friendly). This allows encrypting messages to a future "Identity" (e.g., Round Number) using a *static* Master Public Key, without needing a pre-generated Public Key for that specific round.
2.  **Zapatos DKG** validators hold **BLS12-381** key shares (verified in `real_dkg/mod.rs`). To use the existing validator set as the Timelock authority, we must use the curve they already support.
3.  **Ristretto255** is robust but does not support pairings required for standard IBE or BLS signature verification, meaning we couldn't easily verify the DKG output (signature) against the Master Public Key on-chain in an opaque way.

## Decision
We will implement **Identity-Based Encryption (IBE)** functionality on the **BLS12-381** curve using the `aptos_std::bls12381_algebra` and `crypto_algebra` modules.

### Scheme Details
We adopt the "Hashed IBE" variant (similar to Drand's approach):
*   **Curve**: BLS12-381 (`G1`, `G2`, `Gt` from `aptos_std`).
*   **Master Key**: Validators generate a threshold BLS Master Public Key ($P_{pub} \in G_1$ or $G_2$).
*   **Identity**: The Auction Round (Epoch) ID is mapped to a curve point ($Q_{id} = H(ID)$).
*   **Encryption**: The sender computes a shared secret $K = e(P_{pub}, Q_{id})^r$ and encrypts the message with a symmetric key derived from $K$. They publish $U = rG$.
*   **Decryption**: Validators reveal/sign the identity: $Sig = s \cdot Q_{id}$. The contract computes $K = e(U, Sig)$ and derives the symmetric key to decrypt.

## Consequences

### Positive
*   **Forward Encryption**: Users can encrypt bids for auction rounds that don't exist yet, using only the static Master Public Key.
*   **Validator Compatibility**: Leverages existing BLS12-381 DKG infrastructure in Aptos/Zapatos.
*   **Standard Compliance**: Aligns with Drand's proven `tlock` specification.
*   **On-Chain Verification**: `bls12381_algebra` exposing `pairing` allows the contract to cryptographically verify the decryption key matches the ID and Master Key.

### Negative
*   **Performance Cost**: Bilinear pairings are significantly more expensive (gas-wise) than Ristretto255 point multiplication. We assume this cost is acceptable for the high value of secure auction settlement.
*   **Implementation Complexity**: Requires handling generic algebra imports (`crypto_algebra::Element`) and ensuring correct G1/G2 swapping (since Drand/Aptos might swap which group holds the PK vs Signature).

## Reference
*   [Drand Timelock Encryption](https://drand.love/docs/timelock-encryption/)
*   `zapatos/types/src/dkg/real_dkg/mod.rs` (Source of truth for BLS keys)
