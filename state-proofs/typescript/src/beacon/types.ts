/**
 * Beacon Chain Type Definitions
 *
 * SSZ type definitions for Ethereum Light Client Sync Protocol.
 *
 * References:
 * - https://github.com/ethereum/consensus-specs/blob/master/specs/altair/light-client/sync-protocol.md
 * - https://github.com/ethereum/consensus-specs/blob/master/specs/phase0/beacon-chain.md
 */

/**
 * Sync committee period length in epochs
 */
export const SYNC_COMMITTEE_PERIOD = 27 * 32; // ~27 days

/**
 * Bytes per public key in BLS12-381
 */
export const PUBKEY_SIZE = 48;

/**
 * Bytes per signature in BLS12-381
 */
export const SIGNATURE_SIZE = 96;

/**
 * Sync committee consists of 512 validators
 */
export const SYNC_COMMITTEE_SIZE = 512;

/**
 * Ethereum 2.0 fork versions
 */
export const FORK_VERSION = {
  altair: Uint8Array.from([0x01, 0x00, 0x00, 0x00]),
  bellatrix: Uint8Array.from([0x02, 0x00, 0x00, 0x00]),
  capella: Uint8Array.from([0x03, 0x00, 0x00, 0x00]),
  deneb: Uint8Array.from([0x04, 0x00, 0x00, 0x00]),
} as const;

/**
 * Beacon block header structure
 */
export interface BeaconBlockHeader {
  slot: number;
  proposerIndex: number;
  parentRoot: string;
  stateRoot: string;
  bodyRoot: string;
}

/**
 * Execution payload header (from ExecutionPayloadHeader)
 */
export interface ExecutionPayloadHeader {
  parentHash: string;
  feeRecipient: string;
  stateRoot: string;
  receiptsRoot: string;
  logsBloom: string;
  prevRandao: string;
  blockNumber: number;
  gasLimit: number;
  gasUsed: number;
  timestamp: number;
  extraData: string;
  baseFeePerGas: bigint;
  blockHash: string;
  transactionsRoot: string;
  withdrawalsRoot: string;
}

/**
 * Light client beacon block header with execution payload
 */
export interface LightClientHeader {
  beacon: BeaconBlockHeader;
  execution: ExecutionPayloadHeader;
  executionBranch: string[];
}

/**
 * Sync committee pubkeys
 */
export interface SyncCommittee {
  pubkeys: string[];
  aggregatePubkey: string;
}

/**
 * Sync committee update from beacon API
 */
export interface LightClientUpdate {
  attestedHeader: LightClientHeader;
  nextSyncCommittee: SyncCommittee;
  nextSyncCommitteeBranch: string[];
  finalizedHeader: LightClientHeader | null;
  finalityBranch: string[];
  syncAggregate: SyncAggregate;
  signatureSlot: number;
}

/**
 * Sync aggregate for sync committee signatures
 */
export interface SyncAggregate {
  syncCommitteeBits: Uint8Array;
  syncCommitteeSignature: string;
}

/**
 * Light client bootstrap structure
 */
export interface LightClientBootstrap {
  header: LightClientHeader;
  currentSyncCommittee: SyncCommittee;
  currentSyncCommitteeBranch: string[];
}

/**
 * Light client store (persisted state)
 */
export interface LightClientStore {
  /** Most recent trusted header */
  header: LightClientHeader;
  /** Current sync committee */
  currentSyncCommittee: SyncCommittee;
  /** Next sync committee */
  nextSyncCommittee: SyncCommittee;
  /** Finalized header */
  finalizedHeader: LightClientHeader | null;
  /** Current period */
  period: number;
  /** Previous period update timestamp */
  previousSlot: number;
}

/**
 * Beacon API response types
 */
export interface BeaconAPIResponse<T> {
  data: T;
  executionOptimistic: boolean;
  finalized: boolean;
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
