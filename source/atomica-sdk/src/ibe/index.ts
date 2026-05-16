/**
 * IBE (Identity-Based Encryption) utilities for the Atomica SDK.
 *
 * This module provides the identity computation layer that bridges the
 * TypeScript client to the on-chain Move IBE/timelock system.
 *
 * BF-IBE crypto (encrypt, decrypt, generateSystemParameters, extractKey)
 * lives at `@atomica/state-proof-verifier/ibe` — do not duplicate here.
 *
 * @see docs/architecture/v0-architecture.md §2 — sealed-bid reveal path
 * @see source/state-proofs/typescript/src/ibe/index.ts — crypto primitives
 */
export { computeIdentity } from "./identity.js";
