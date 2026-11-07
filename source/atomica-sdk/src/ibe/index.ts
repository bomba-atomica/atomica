/**
 * IBE (Identity-Based Encryption) utilities for the Atomica SDK.
 *
 * This module provides the identity computation layer that bridges the
 * TypeScript client to the on-chain Move IBE/timelock system.
 *
 * The V2 bid encryptor and decryptor (`encryptBid`, `decryptBid`) live at
 * `@atomica/state-proof-verifier/ibe` and are re-exported here. Chain-reading
 * helpers that seal and open auction bids are in `@atomica/sdk/aptos`
 * (`sealBid`, `decryptWindowBids`).
 *
 * @see docs/architecture/v0-architecture.md §2 — sealed-bid reveal path
 * @see source/state-proofs/typescript/src/ibe/index.ts — crypto primitives
 */
export {
  decryptBid,
  encryptBid,
  parseBidCiphertext,
  serializeBidCiphertext,
  verifyBidCiphertext,
} from "@atomica/state-proof-verifier/ibe";
export type { BidCiphertext } from "@atomica/state-proof-verifier/ibe";
export { computeIdentity } from "./identity.js";
export {
  BID_AD_TAG,
  BID_COMMIT_TAG,
  TIMELOCK_IDENTITY_TAG,
  buildBidAd,
  computeBidCommitment,
  computeTimelockIdentityV2,
  encodeBidPlaintext,
} from "./bid.js";
export type { BidAdFields } from "./bid.js";
