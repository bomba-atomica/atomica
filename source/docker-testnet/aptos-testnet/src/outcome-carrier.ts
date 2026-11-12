/**
 * Test-side carrier of an Aptos `AuctionOutcome` to Ethereum.
 *
 * Fetches the event proof of an `AuctionOutcome` from an Atomica node, advances
 * AptosLightClient through every missing epoch, and calls
 * `LockBox.recordOutcome` from an account with no special rights.
 *
 * The proof encoding (BCS LedgerInfo parsing, validator set by epoch, EIP-2537
 * key and signature encodings) lives today in
 * source/evm-contracts/test-orchestration/src/aptos-light-client-live.ts.
 */
import type { ethers } from "ethers";

// SCOUT(#219) ADD: whole file, a stub; nothing imports it yet. The SDK and UI unwind issue (195) adds an outcome carrier to the SDK, so this helper would be the third copy of the proof encoding unless the test waits for that carrier.

/** Body of `GET /v1/atomica/event_proof/{version}/{event_index}`. Every field is a hex string. */
export interface AptosEventProofResponse {
    version: string;
    event_index: string;
    event: string;
    transaction_info: string;
    transaction_accumulator_proof: string;
    event_accumulator_proof: string;
    ledger_info_with_signatures: string;
}

/** Fetch the proof of event `eventIndex` of the transaction at `version`. */
export async function fetchAptosEventProof(
    _aptosNodeUrl: string,
    _version: bigint,
    _eventIndex: number,
): Promise<AptosEventProofResponse> {
    throw new Error("NOT_IMPLEMENTED: SCOUT(#219) fetchAptosEventProof");
}

/**
 * Call `AptosLightClient.advanceEpoch` once per epoch change until the client
 * knows the validator set of `targetEpoch`.
 */
export async function advanceLightClientTo(
    _carrier: ethers.Signer,
    _lightClient: string,
    _aptosNodeUrl: string,
    _targetEpoch: bigint,
): Promise<void> {
    throw new Error("NOT_IMPLEMENTED: SCOUT(#219) advanceLightClientTo");
}

/**
 * Advance the light client to the proof's epoch, then call
 * `LockBox.recordOutcome` with the proof. Returns the Ethereum transaction hash.
 */
export async function recordAuctionOutcome(
    _carrier: ethers.Signer,
    _lockBox: string,
    _aptosNodeUrl: string,
    _proof: AptosEventProofResponse,
): Promise<string> {
    throw new Error("NOT_IMPLEMENTED: SCOUT(#219) recordAuctionOutcome");
}
