# Client Tools Implementation Plan

## Goal
Implement robust, TDD-verified client-side encryption and decryption for Atomica Timelock.

## Steps

1.  **Setup Test Environment**:
    *   Ensure `vitest` is configured.
    *   Create `tests/unit/timelock.test.ts`.
    *   Import `ibe_golden_vectors.json` as test data.

2.  **Implement Core Crypto (`src/lib/timelock.ts`)**:
    *   `computeIdentity(timelockId, deadline)`: Matches rust `compute_identity`.
    *   `hashToG1(identity)`: Implements augmented hash-to-curve.
    *   `serializeGt(gt)`: Implements custom 576-byte LE serialization.
    *   `deriveKey(gt, length)`: Implements KDF.
    *   `encrypt(mpk, identity, message)`: Full IBE encryption.
    *   `decrypt(dk, ciphertext)`: Full IBE decryption.

3.  **Verification**:
    *   Run unit tests against golden vectors.
    *   Verify roundtrip (Encrypt -> Decrypt) with random keys in tests.

4.  **Integration**:
    *   Expose `TimelockClient` class for the web app.
    *   Methods to fetch keys from Aptos client.

## Dependencies
- `@noble/bls12-381`
- `@noble/hashes`
- `aptos` (SDK)
